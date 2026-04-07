# Drag-and-Drop Performance & Visual Improvement Design

**Date:** 2026-04-06  
**Scope:** Bed grid drag-and-drop in `apps/web/src/components/grid/`  
**Scale:** 58 beds × 14 days = 812 cells rendered  

---

## Problem

The bed grid renders 812 cells with no memoization. Every drag state change (picking up a guest, moving over cells) triggers a full re-render of all 812 cells. Additionally, the current drag experience is visually jarring: drop animation is disabled (`dropAnimation={null}`), drag overlay shows only a text label (not a visual representation of the cell), and there is no feedback when hovering over a conflicting occupied cell.

---

## Goals

1. Stop unnecessary re-renders during drag — make interactions feel instant at 58 beds
2. Make the drag overlay look like the actual cell being moved (ghost clone)
3. Add smooth ease-out animation when a guest lands on a new bed
4. Show a red highlight when hovering over an occupied (conflicting) cell before releasing

---

## Out of Scope

- Touch/tablet support (laptop/desktop only)
- Row virtualization (812 cells is manageable with memoization; virtualization adds DnD complexity for little gain at this scale)
- Keyboard drag-and-drop accessibility
- Scroll-during-drag auto-scroll

---

## Architecture

All changes are confined to the grid component directory:

```
apps/web/src/components/grid/
  BedGrid.tsx       — DnD context, sensors, overlay, event handlers
  GuestCell.tsx     — draggable + droppable cell (wrap in React.memo)
  DroppableCell.tsx — empty drop target (wrap in React.memo)
```

No API changes. No schema changes. No new dependencies (DnD Kit already installed).

---

## 1. Performance: Memoization

### GuestCell and DroppableCell

Wrap both components with `React.memo`. Both currently re-render whenever any parent state changes (e.g., `draggedAssignment` updating as cursor moves).

```tsx
export default React.memo(GuestCell)
export default React.memo(DroppableCell)
```

**Stable props requirement:** The parent must pass stable references. Audit all function props passed to these components (`onClick`, `onDoubleClick`) and wrap them with `useCallback` in `BedGrid`. Unstable function references defeat `React.memo`.

### cellPositionMap

Currently recomputed on every render. Memoize with `useMemo`:

```tsx
const cellPositionMap = useMemo(() => {
  // existing computation
}, [assignments]) // only recompute when assignments change
```

### occupancyByDate

Same pattern:

```tsx
const occupancyByDate = useMemo(() => {
  // existing computation
}, [assignments])
```

### returningGuestIds

Already uses `useMemo` — no change needed.

---

## 2. Performance: Collision Detection

Replace the default `rectIntersection` with `closestCenter` from `@dnd-kit/core`.

```tsx
import { closestCenter } from '@dnd-kit/core'

<DndContext collisionDetection={closestCenter} ...>
```

`closestCenter` measures distance from the center of the dragged item to the center of each droppable, which is more reliable for narrow grid cells where rect intersection can miss or fire on the wrong cell.

---

## 3. Visual: Ghost Cell Clone Overlay

### What changes

Replace the current text-label `DragOverlay` content with a component that renders a clone of the actual `GuestCell` visual — same dimensions, same color, same border stripe, same guest name — but without drag/drop hooks attached.

### Implementation

Create a new `DragOverlayCell` component (or inline in `BedGrid`) that accepts the `draggedAssignment` and renders:

```tsx
<DragOverlay dropAnimation={dropAnimationConfig}>
  {draggedAssignment && (
    <GuestCellClone assignment={draggedAssignment} />
  )}
</DragOverlay>
```

`GuestCellClone` is a pure presentational component (no `useDraggable`, no `useDroppable`) that replicates the visual output of `GuestCell`: background color based on status, left border stripe for source (Booking.com blue, Hostelworld orange, manual emerald), guest name, payment dot, returning dot.

The original cell in the grid shows a dashed ghost outline during drag (`isDragging === true`): border becomes `border: 1px dashed` with reduced opacity (`opacity: 0.25`), background removed.

### Extend drag overlay

The extend drag (drag handle on right edge) keeps its current simple label — it does not need a full cell clone since it's a resize operation, not a move.

---

## 4. Visual: Smooth Ease-out Drop Animation

Replace `dropAnimation={null}` with a configured drop animation:

```tsx
import { defaultDropAnimationSideEffects } from '@dnd-kit/core'

const dropAnimationConfig = {
  duration: 180,
  easing: 'cubic-bezier(0.2, 0, 0, 1)',
  sideEffects: defaultDropAnimationSideEffects({
    styles: { active: { opacity: '0' } }
  })
}
```

This produces a 180ms ease-out landing: the floating clone scales up from 85% and fades in as it arrives at the target cell. The source ghost fades out simultaneously.

---

## 5. Visual: Red Conflict Highlight

### Detection

The only invalid drop in the current system is dragging a guest onto a cell belonging to **their own reservation** (can't swap with yourself). Dropping on any other occupied cell is a valid swap — do not show red for those.

In `handleDragOver` (currently not implemented — add it):

```tsx
const [conflictCellId, setConflictCellId] = useState<string | null>(null)

function handleDragOver(event: DragOverEvent) {
  const { over } = event
  if (!over || !draggedAssignment) { setConflictCellId(null); return }
  
  const overData = over.data.current
  if (overData?.type === 'guest') {
    // Only conflict if hovering own reservation (can't swap with yourself)
    const isSelf = overData.reservationId === draggedAssignment.reservationId
    setConflictCellId(isSelf ? String(over.id) : null)
  } else {
    setConflictCellId(null)
  }
}
```

Pass `isConflict: conflictCellId === cellId` prop down to `GuestCell`. When true, apply `bg-red-950 border border-red-500/60` classes to the cell.

### Preventing bad drops

In `handleDragEnd`, if `overData.reservationId === draggedAssignment.reservationId`, return early — same behaviour as today but now the user sees red before they release.

---

## Component Interfaces After Changes

### GuestCell props (additions)

```tsx
isConflict?: boolean  // shows red highlight when true
```

### DroppableCell props (additions)

```tsx
isConflict?: boolean  // shows red highlight when true
```

### New: GuestCellClone

```tsx
interface GuestCellCloneProps {
  assignment: Assignment  // full assignment object for visual rendering
  dragMode: 'stay' | 'night'
}
```

Pure presentational, no hooks.

---

## Files Changed

| File | Change |
|------|--------|
| `BedGrid.tsx` | Add `handleDragOver`, `conflictCellId` state, `dropAnimationConfig`, `closestCenter`, `useCallback` wrappers, `useMemo` for `cellPositionMap` + `occupancyByDate` |
| `GuestCell.tsx` | Add `React.memo`, `isConflict` prop, ghost styling when `isDragging`, remove text from overlay (handled in BedGrid) |
| `DroppableCell.tsx` | Add `React.memo`, `isConflict` prop, red highlight class |
| `BedGrid.tsx` (overlay) | Replace text label with `GuestCellClone` presentational component |

---

## Success Criteria

- Dragging a guest bar does not visibly lag or stutter on a 58-bed grid
- The floating clone looks identical to the source cell
- Releasing a guest onto a valid bed produces a smooth 180ms landing animation
- Hovering over an occupied cell during drag shows a red border
- Dropping on a conflict cell is a no-op (no mutation, no error)
- All existing drag behaviors (move stay, move single night, swap, extend) continue to work
