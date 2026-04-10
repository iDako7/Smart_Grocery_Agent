> [!NOTE]
>
> This is the result of UAT test of stage 2



## problem

### general problem

1. the user should be able to quit the making plan process or go back to the previous step

**Resolution:** Adding a back arrow (left side) + optional cancel "X" to return to Home on Clarify, Recipes, and Grocery screens. Uses a callback pattern (`onBack` prop) so each screen controls its own back destination.

2. The saved plan, saved recipe and saved list don't exist

**Resolution:** The saved pages exist as routes (`/saved/plan/:id`, `/saved/recipe/:id`, `/saved/list/:id`) and screens (`SavedMealPlanScreen`, `SavedRecipeScreen`, `SavedGroceryListScreen`), but the sidebar `onItemClick` handler only closes the sidebar without navigating. Fix: wire sidebar clicks to `navigate()` based on section.



### side bar

after click the plans and recipes, the plan page or recipe page didn't load

**Resolution:** Same root cause as general problem #2. The `onItemClick` in `HomeScreen.tsx` just calls `setSidebarOpen(false)` without routing. Fix: pass a proper handler that navigates to the correct `/saved/*` route.



## Feature improvement



### grocery page

1. remove the aisle view, only keep the by store view -- use the same logic for saved list view

**Resolution:** Remove the "By store / By aisle" toggle entirely. Keep only the store-grouped view. Remove `aisleGroups` mock data dependency and all aisle-related state/rendering. Rationale: users shop by store, not aisle. This also makes GroceryScreen consistent with SavedGroceryListScreen which already uses store-only view.



### recipe page

1. Try another button occupies too much space, what improving options we have, which one you recommend?

**Resolution:** Replace with an overflow menu (`...` icon button) using shadcn/ui DropdownMenu. The menu contains "Try another" and is extensible for future actions (save, share, etc.). This is Option D from the design review. Rationale: saves vertical space, scales for future per-card actions, keeps card footer clean.
