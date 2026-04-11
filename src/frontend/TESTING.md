# Stage 2 — Manual Testing Guide

## Run

```bash
cd src/frontend
bun dev
```

Opens at `http://localhost:5173`.

## Scenario switcher

Floating button bottom-right toggles between **BBQ weekend** and **Weeknight chicken** data. Or use `?scenario=chicken` in the URL.

## Screens to test

| Route | What to check |
|---|---|
| `/` | Hero input, 3 quick-start chips navigate to `/clarify`, hamburger opens sidebar |
| `/clarify` | PCV badges (ok/warn/gap), chip selection toggles, "Looks good" navigates to `/recipes` |
| `/recipes` | 3 recipe cards, "try another" opens swap panel, info (i) opens bottom sheet, "Build list" navigates to `/grocery` |
| `/grocery` | Store/aisle toggle switches views, checkboxes toggle items, checked items fade |
| `/saved/plan/1` | Expand/collapse recipe rows, mono detail blocks, remove button |
| `/saved/recipe/1` | Edit/view toggle, textarea in edit mode, cancel reverts |
| `/saved/list/1` | Check/uncheck items, remove items, per-section add-item inputs |

## Cross-cutting

- **Sidebar**: Open from Home hamburger. 3 sections with items.
- **Design tokens**: All screens should feel warm (cream/paper backgrounds, jade/persimmon accents). No white or blue defaults.
- **Fonts**: DM Sans (body), Noto Sans SC (CJK dish names), JetBrains Mono (recipe detail blocks).
- **Scenario switch**: Toggle scenario and revisit screens. Data should change everywhere.

## Unit tests

```bash
bun run test          # 305 tests
bun run build         # TypeScript check + production build
```
