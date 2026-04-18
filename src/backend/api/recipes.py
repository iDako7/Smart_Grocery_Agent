"""Recipe detail endpoint — authenticated direct KB lookup, no LLM."""

import uuid

from contracts.tool_schemas import GetRecipeDetailInput, RecipeDetail
from fastapi import APIRouter, Depends, HTTPException
from src.ai.kb import get_kb
from src.ai.tools.get_recipe_detail import get_recipe_detail
from src.backend.auth import get_current_user_id

router = APIRouter()


@router.get("/recipe/{recipe_id}")
async def get_recipe_detail_endpoint(
    recipe_id: str,
    user_id: uuid.UUID = Depends(get_current_user_id),
) -> RecipeDetail:
    """Return full recipe detail from the KB by id.

    Auth-gated but returns no user-specific data — any authenticated user
    can fetch any recipe in the knowledge base.
    """
    async with get_kb() as kb:
        result = await get_recipe_detail(kb, GetRecipeDetailInput(recipe_id=recipe_id))

    if result is None:
        raise HTTPException(status_code=404, detail="Recipe not found")

    return result
