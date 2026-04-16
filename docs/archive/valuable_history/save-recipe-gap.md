# Save Recipe — Gap Analysis (Apr 10)

## Summary

Backend fully implements save recipe. Frontend has not wired it up at all.

## Backend — Complete

All CRUD endpoints live in `src/backend/api/saved.py`:

| Endpoint | Line |
|---|---|
| `POST /saved/recipes` | 140 |
| `GET /saved/recipes` | 161 |
| `GET /saved/recipes/{id}` | 183 |
| `PUT /saved/recipes/{id}` | 197 |
| `DELETE /saved/recipes/{id}` | 220 |

Database: `saved_recipes` table in `contracts/pg_schema.sql:65`, Alembic migration in `src/backend/alembic/versions/001_initial.py`. Auth + user isolation in place.

## Frontend — Three Gaps

1. **No save button on `RecipeCard`** (`src/frontend/src/components/recipe-card.tsx`) — component only has a "Try another" swap button. No bookmark or save action.

2. **No API call anywhere** — `POST /saved/recipes` is never called in the frontend codebase.

3. **Mock navigation in place of real save** — `RecipesScreen.tsx:257` and `GroceryScreen.tsx:135` both navigate to hardcoded `/saved/plan/1` with a `justSaved` flag. No data is persisted.

The "Saved Recipes" entry visible in the sidebar is seeded mock data, not a real user record.

## What's Needed (frontend only)

1. Add save/bookmark button to `RecipeCard` — on click, call `POST /saved/recipes` with the current `recipe_snapshot`.
2. Use the returned `id` to navigate to `/saved/recipe/{realId}` instead of the hardcoded path.
3. TypeScript contract types already exist at `src/frontend/src/types/api.ts:133` (`SaveRecipeRequest`, `SavedRecipe`) — no contract changes needed.

Backend is not blocked. Pure frontend task.
