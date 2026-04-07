# Refactor & Cleanup Design

**Date:** 2026-04-07
**Goal:** Remove dead code, split oversized components, keep tests green throughout.

## Phase 1: Cleanup

**Delete:**
- `/src/` (root-level) — 60 obsolete files entirely superseded by `apps/web/src/`
- `apps/web/tests/drag-debug.mjs` — untracked debug script
- `apps/web/tests/drag-visual.mjs` — untracked debug script

**Add to `.gitignore`:**
- `.superpowers/`

**Verify:** tests pass after cleanup.

## Phase 2: BedGrid.tsx Split (1,118 → ~350 lines)

All files stay flat in `components/grid/`. No behavior changes — pure extraction.

| New File | Contents | ~Lines |
|---|---|---|
| `useBedGridDrag.ts` | `handleDragStart`, `handleDragEnd`, drag state (`dragMode`, `dragBedDates`, `draggedAssignment`, `dragCellWidth`, `isExtendingOverlay`), move/swap/extend mutations, undo stack + `pushUndo`/`performUndo` | ~250 |
| `RoomRows.tsx` | `RoomRows` memo component (already a standalone function in BedGrid.tsx) | ~200 |
| `GuestCellClone.tsx` | `GuestCellClone` component + `dropAnimationConfig` | ~80 |
| `GridHeader.tsx` | Date navigation, occupancy counter, legend, 2W/3W toggle, summary pills (arrivals/departures/unpaid) | ~150 |

**BedGrid.tsx keeps:** Query hooks, `dates`/`assignmentMap`/`cellPositionMap` memos, `DndContext` wrapper, `DragOverlay`, layout shell composing sub-components.

## Phase 3: GuestDetailPanel.tsx Split (1,088 → ~300 lines)

| New File | Contents | ~Lines |
|---|---|---|
| `GuestInfoSection.tsx` | Guest name, contact, reservation details display, status badges, source indicator | ~200 |
| `GuestEditForm.tsx` | Edit mode form — date pickers, room type, price/payment fields, save/cancel | ~300 |
| `GuestActions.tsx` | Action buttons — check-in/out, cancel, no-show, payment toggles, delete confirmation | ~200 |

**GuestDetailPanel.tsx keeps:** Panel shell (slide-in, close button), state management (edit mode, active tab), query/mutation hooks, composes sub-components.

## Phase 4: Verify & Clean

- Run full test suite, fix broken selectors from file moves
- Confirm production build succeeds
- One commit per phase

## Constraints

- No behavior changes. Every phase is pure extraction.
- Tests stay green after each phase.
- Flat file structure in `components/grid/` (no subdirectories).
- Pages (reservations, tours, etc.) left as-is — self-contained and not imported elsewhere.
