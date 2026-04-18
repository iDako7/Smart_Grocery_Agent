"""Session + Chat API endpoints."""

import logging
import uuid

import openai
import pydantic
from contracts.api_types import (
    ChatRequest,
    ConversationTurn,
    CreateSessionRequest,
    CreateSessionResponse,
    PatchSessionRecipeRequest,
    SessionStateResponse,
)
from contracts.sse_events import AgentErrorCategory
from contracts.tool_schemas import GetRecipeDetailInput
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncConnection
from src.ai.context import load_context, save_turn
from src.ai.kb import get_kb
from src.ai.orchestrator import run_agent
from src.ai.sse import emit_agent_result
from src.ai.tools.get_recipe_detail import get_recipe_detail
from src.ai.types import AgentResult
from src.backend.auth import get_current_user_id
from src.backend.db.engine import get_db
from src.backend.db.tables import conversation_turns, sessions

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/session", status_code=201)
async def create_session(
    body: CreateSessionRequest | None = None,
    user_id: uuid.UUID = Depends(get_current_user_id),
    conn: AsyncConnection = Depends(get_db),
) -> CreateSessionResponse:
    sid = uuid.uuid4()
    result = await conn.execute(sessions.insert().values(id=sid, user_id=user_id).returning(sessions.c.created_at))
    row = result.first()
    await conn.commit()
    return CreateSessionResponse(session_id=str(sid), created_at=row.created_at)


@router.get("/session/{session_id}")
async def get_session(
    session_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user_id),
    conn: AsyncConnection = Depends(get_db),
) -> SessionStateResponse:
    row = (
        await conn.execute(
            sessions.select().where(
                sessions.c.id == session_id,
                sessions.c.user_id == user_id,
            )
        )
    ).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Session not found")

    # Load conversation turns (user + assistant only)
    turns_result = await conn.execute(
        select(
            conversation_turns.c.role,
            conversation_turns.c.content,
            conversation_turns.c.created_at,
        )
        .where(conversation_turns.c.session_id == session_id)
        .where(conversation_turns.c.role.in_(["user", "assistant"]))
        .order_by(conversation_turns.c.id)
    )
    conversation = [
        ConversationTurn(role=t.role, content=t.content, timestamp=t.created_at) for t in turns_result.fetchall()
    ]

    snapshot = row.state_snapshot or {}
    return SessionStateResponse(
        session_id=str(session_id),
        screen=row.screen,
        pcsv=snapshot.get("pcsv"),
        recipes=snapshot.get("recipes", []),
        grocery_list=snapshot.get("grocery_list"),
        conversation=conversation,
    )


@router.patch("/session/{session_id}/recipes")
async def patch_session_recipes(
    session_id: uuid.UUID,
    body: PatchSessionRecipeRequest,
    user_id: uuid.UUID = Depends(get_current_user_id),
    conn: AsyncConnection = Depends(get_db),
) -> SessionStateResponse:
    """Replace the recipe at body.index in session state_snapshot["recipes"].

    The list length stays the same — slot body.index becomes body.recipe.
    Returns the updated SessionStateResponse so the caller can confirm the write.
    """
    row = (
        await conn.execute(
            sessions.select().where(
                sessions.c.id == session_id,
                sessions.c.user_id == user_id,
            )
        )
    ).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Session not found")

    snapshot: dict = dict(row.state_snapshot or {})
    recipes: list = list(snapshot.get("recipes", []))

    if body.index >= len(recipes):
        raise HTTPException(
            status_code=400,
            detail=f"Index {body.index} out of range for recipe list of length {len(recipes)}",
        )

    recipes[body.index] = body.recipe.model_dump()
    snapshot["recipes"] = recipes

    await conn.execute(sessions.update().where(sessions.c.id == session_id).values(state_snapshot=snapshot))
    await conn.commit()

    return SessionStateResponse(
        session_id=str(session_id),
        screen=row.screen,
        pcsv=snapshot.get("pcsv"),
        recipes=snapshot.get("recipes", []),
        grocery_list=snapshot.get("grocery_list"),
        conversation=[],
    )


@router.post("/session/{session_id}/chat")
async def chat(
    session_id: uuid.UUID,
    body: ChatRequest,
    user_id: uuid.UUID = Depends(get_current_user_id),
    conn: AsyncConnection = Depends(get_db),
) -> StreamingResponse:
    # Verify session exists and belongs to user
    row = (
        await conn.execute(
            sessions.select().where(
                sessions.c.id == session_id,
                sessions.c.user_id == user_id,
            )
        )
    ).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Session not found")

    # Save user turn
    await save_turn(conn, session_id, "user", body.message, screen=body.screen)

    # Load conversation history
    history = await load_context(conn, session_id)

    # Run agent (collect phase)
    agent_failed = False
    category: AgentErrorCategory | None = None
    try:
        async with get_kb() as kb:
            result = await run_agent(body.message, kb, conn, user_id, history=history, screen=body.screen)
    except RuntimeError:
        logger.exception("Agent config error for session %s", session_id)
        category = "config"
    except openai.APIError:
        logger.exception("Agent LLM error for session %s", session_id)
        category = "llm"
    except pydantic.ValidationError:
        logger.exception("Agent validation error for session %s", session_id)
        category = "validation"
    except Exception:
        logger.exception("Agent execution failed for session %s", session_id)
        category = "unknown"

    if category is not None:
        agent_failed = True
        result = AgentResult(
            status="partial",
            response_text="I encountered an error processing your request. Please try again.",
            reason=f"agent_error:{category}",
        )

    # Only persist on success — don't save error messages as assistant turns
    if not agent_failed:
        # Save assistant turn
        await save_turn(conn, session_id, "assistant", result.response_text, screen=body.screen)

        # Update session state snapshot
        snapshot: dict = {}
        if result.pcsv:
            snapshot["pcsv"] = result.pcsv.model_dump()
        if result.recipes:
            # Hydrate each RecipeSummary with canonical `ingredients` + `instructions`
            # from the KB so both the SSE emit path and the saved meal plan path
            # carry full detail (issue #71). AI-generated recipes have no KB row —
            # leave ingredients/instructions at their defaults. Alternatives
            # nested under each primary also need hydration — otherwise the
            # frontend swap-in-place flow renders zero ingredient pills when
            # the user picks an alternative (PR #112 UAT bug).
            async with get_kb() as kb:
                for r in result.recipes:
                    detail = await get_recipe_detail(kb, GetRecipeDetailInput(recipe_id=r.id))
                    if detail is not None:
                        r.ingredients = detail.ingredients
                        r.instructions = detail.instructions
                    for alt in r.alternatives:
                        alt_detail = await get_recipe_detail(kb, GetRecipeDetailInput(recipe_id=alt.id))
                        if alt_detail is not None:
                            alt.ingredients = alt_detail.ingredients
                            alt.instructions = alt_detail.instructions
            snapshot["recipes"] = [s.model_dump() for s in result.recipes]
        if result.grocery_list:
            snapshot["grocery_list"] = [s.model_dump() for s in result.grocery_list]

        await conn.execute(
            sessions.update().where(sessions.c.id == session_id).values(screen=body.screen, state_snapshot=snapshot)
        )
        await conn.commit()

    # Emit phase — stream SSE events
    return StreamingResponse(
        emit_agent_result(result, error_category=category),
        media_type="text/event-stream",
    )
