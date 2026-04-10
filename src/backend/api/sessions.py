"""Session + Chat API endpoints."""

import json
import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncConnection

from contracts.api_types import (
    ChatRequest,
    ConversationTurn,
    CreateSessionRequest,
    CreateSessionResponse,
    SessionStateResponse,
)
from src.ai.context import load_context, save_turn
from src.ai.kb import get_kb
from src.ai.orchestrator import run_agent
from src.ai.sse import emit_agent_result
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
    result = await conn.execute(
        sessions.insert()
        .values(id=sid, user_id=user_id)
        .returning(sessions.c.created_at)
    )
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
        ConversationTurn(role=t.role, content=t.content, timestamp=t.created_at)
        for t in turns_result.fetchall()
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
    try:
        kb = await get_kb()
        try:
            result = await run_agent(body.message, kb, conn, user_id, history=history)
        finally:
            await kb.close()
    except Exception:
        logger.exception("Agent execution failed for session %s", session_id)
        agent_failed = True
        result = AgentResult(
            status="partial",
            response_text="I encountered an error processing your request. Please try again.",
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
            snapshot["recipes"] = [r.model_dump() for r in result.recipes]
        if result.grocery_list:
            snapshot["grocery_list"] = [s.model_dump() for s in result.grocery_list]

        await conn.execute(
            sessions.update()
            .where(sessions.c.id == session_id)
            .values(screen=body.screen, state_snapshot=snapshot)
        )
        await conn.commit()

    # Emit phase — stream SSE events
    return StreamingResponse(
        emit_agent_result(result),
        media_type="text/event-stream",
    )
