# Bed Grid Drag-and-Drop Improvement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 812-cell re-render storm during drag, replace the floating text label with a ghost cell clone overlay, add smooth ease-out drop animation, and show a red highlight when hovering a guest's own reservation cell.

**Architecture:** `BedGrid.tsx` re-renders on every `draggedAssignment` state change (every pointer event during drag). Since `RoomRows` is not memoized, this cascades to all 812 cells. Fix: `React.memo(RoomRows)` is the main perf win — `draggedAssignment` is not a `RoomRows` prop so memoizing it blocks the cascade entirely. `React.memo(GuestCell)` and `React.memo(DroppableCell)` add secondary protection. Visual changes (clone overlay, animation, conflict highlight) are then layered on top.

**Tech Stack:** React 18 (memo, useDndContext), @dnd-kit/core v6.3.1 (closestCenter, defaultDropAnimationSideEffects, DragOverEvent), Tailwind CSS v4

---

### Task 1: Performance — React.memo on RoomRows + closestCenter collision detection

**Files:**
- Modify: `apps/web/src/components/grid/BedGrid.tsx`
- Modify: `apps/web/src/components/grid/GuestCell.tsx`
- Modify: `apps/web/src/components/grid/DroppableCell.tsx`

The root cause of the re-render storm: `draggedAssignment` state lives in `BedGrid`. When the pointer moves during drag, DnD Kit updates transform state, which triggers `BedGrid` re-renders. Since `RoomRows` has no `React.memo`, every re-render cascades through all 812 cells. `React.memo(RoomRows)` stops this because `draggedAssignment` is never passed as a prop to `RoomRows`.

- [ ] **Step 1: Add closestCenter to BedGrid imports**

In `apps/web/src/components/grid/BedGrid.tsx`, update the `@dnd-kit/core` import to add `closestCenter`:

```tsx
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
```

- [ ] **Step 2: Use closestCenter on DndContext**

Find the `<DndContext` JSX (around line 579) and add the `collisionDetection` prop:

```tsx
<DndContext
  sensors={sensors}
  collisionDetection={closestCenter}
  onDragStart={handleDragStart}
  onDragEnd={handleDragEnd}
>
```

- [ ] **Step 3: Wrap RoomRows with React.memo**

`RoomRows` is defined as a plain function at the bottom of `BedGrid.tsx` (around line 730). Wrap it:

```tsx
const RoomRows = React.memo(function RoomRows({
  room,
  dates,
  assignmentMap,
  cellPositionMap,
  selectedReservation,
  onSelectReservation,
  onOpenPanel,
  colorIndex,
  returningGuestIds,
}: {
  room: RoomWithBeds;
  dates: Date[];
  assignmentMap: Map<string, Assignment>;
  cellPositionMap: Map<string, CellPosition>;
  selectedReservation: number | null;
  onSelectReservation: (id: number | null) => void;
  onOpenPanel: (assignment: Assignment) => void;
  colorIndex: number;
  returningGuestIds: Set<number>;
}) {
  // ... existing body unchanged ...
});
```

Note: `onSelectReservation` is `setSelectedReservation` (a React state setter — stable reference). `onOpenPanel` is `setPanelAssignment` (also a stable state setter). Both are already stable, so no `useCallback` wrappers needed in `BedGrid`.

- [ ] **Step 4: Wrap GuestCell with React.memo**

At the bottom of `apps/web/src/components/grid/GuestCell.tsx`, change:

```tsx
// Remove the plain named export and replace with:
export const GuestCell = React.memo(function GuestCell({
  assignment,
  position,
  isSelected,
  isReturning,
  onSelect,
  onDoubleClick,
}: {
  assignment: Assignment;
  position: CellPosition;
  isSelected: boolean;
  isReturning?: boolean;
  onSelect: () => void;
  onDoubleClick?: () => void;
}) {
  // ... entire existing body unchanged ...
})
```

Also add `React` to the import since `React.memo` is now used:

```tsx
import { useDraggable, useDroppable, useDndContext } from "@dnd-kit/core";
import React, { useCallback } from "react";
import type { Assignment, CellPosition } from "./BedGrid";
```

- [ ] **Step 5: Wrap DroppableCell with React.memo**

In `apps/web/src/components/grid/DroppableCell.tsx`:

```tsx
import React, { useState } from "react";

export const DroppableCell = React.memo(function DroppableCell({
  bedId,
  date,
  roomType,
}: {
  bedId: string;
  date: string;
  roomType: string;
}) {
  // ... existing body unchanged ...
})
```

- [ ] **Step 6: Start dev server and verify no TypeScript errors**

```bash
cd "/Users/dunguyen/Desktop/Hostel Saas/apps/web" && npx tsc --noEmit
```

Expected: 0 errors. If errors appear, check that `React` is imported in files using `React.memo`.

- [ ] **Step 7: Commit**

```bash
cd "/Users/dunguyen/Desktop/Hostel Saas"
git add apps/web/src/components/grid/BedGrid.tsx \
        apps/web/src/components/grid/GuestCell.tsx \
        apps/web/src/components/grid/DroppableCell.tsx
git commit -m "perf: React.memo on RoomRows/GuestCell/DroppableCell, closestCenter collision"
```

---

### Task 2: Ghost Cell Clone Overlay + Ghost Styling When Dragging

**Files:**
- Modify: `apps/web/src/components/grid/BedGrid.tsx`
- Modify: `apps/web/src/components/grid/GuestCell.tsx`

Replace the current text-label `DragOverlay` content with a presentational clone of the source cell. The original cell shows a dashed ghost while dragging.

- [ ] **Step 1: Add GuestCellClone component to BedGrid.tsx**

Add this component near the bottom of `BedGrid.tsx`, above `RoomRows`. It is pure presentational — no hooks, no drag/drop:

```tsx
// Pure visual clone of a GuestCell for the DragOverlay
function GuestCellClone({ assignment }: { assignment: Assignment }) {
  const sourceBarColors: Record<string, string> = {
    "booking.com": "bg-blue-500",
    hostelworld: "bg-orange-500",
    manual: "bg-emerald-500",
  };
  const barColor = sourceBarColors[assignment.source] || "bg-slate-400";

  const colors = (() => {
    switch (assignment.status) {
      case "checked_in":  return { bg: "bg-emerald-100", border: "border-emerald-300", text: "text-emerald-900" };
      case "confirmed":   return { bg: "bg-blue-100",    border: "border-blue-300",    text: "text-blue-900"    };
      case "checked_out": return { bg: "bg-slate-100",   border: "border-slate-200",   text: "text-slate-400"   };
      default:            return { bg: "bg-blue-100",    border: "border-blue-300",    text: "text-blue-900"    };
    }
  })();

  const payDot =
    assignment.status !== "checked_out" &&
    assignment.paymentStatus !== "paid" &&
    assignment.paymentStatus !== "refunded"
      ? assignment.paymentStatus === "partial" ? "bg-amber-400" : "bg-red-400"
      : null;

  return (
    <div className="h-9 min-w-[90px] max-w-[200px] flex items-center py-1 cursor-grabbing opacity-95 drop-shadow-xl">
      <div
        className={`w-full h-7 flex items-center rounded-l ml-1 -mr-px ${colors.bg} border ${colors.border} border-solid`}
      >
        <div className={`w-1 h-full ${barColor} opacity-90 rounded-l flex-shrink-0`} />
        <span className={`truncate text-xs font-semibold px-1.5 ${colors.text} flex-1 min-w-0`}>
          {assignment.guestName}
        </span>
        {payDot && (
          <span className={`w-1.5 h-1.5 rounded-full ${payDot} flex-shrink-0 mr-1.5`} />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Replace the DragOverlay content in BedGrid.tsx**

Find the current `<DragOverlay>` block (around line 683):

```tsx
// BEFORE:
<DragOverlay dropAnimation={null}>
  {draggedAssignment && !isExtendingOverlay && (
    <div className="bg-indigo-100 border border-indigo-300 text-indigo-800 shadow-xl text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 font-medium">
      {draggedAssignment.guestName}
      <span className="text-indigo-400 text-[10px]">
        {dragMode === "night" ? `· ${draggedAssignment.date}` : "· full stay"}
      </span>
    </div>
  )}
</DragOverlay>
```

Replace with (keep `dropAnimation={null}` for now — Task 3 will replace it):

```tsx
<DragOverlay dropAnimation={null}>
  {draggedAssignment && !isExtendingOverlay && (
    <GuestCellClone assignment={draggedAssignment} />
  )}
  {draggedAssignment && isExtendingOverlay && (
    <div className="bg-indigo-100 border border-indigo-300 text-indigo-800 shadow-xl text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 font-medium">
      {draggedAssignment.guestName}
      <span className="text-indigo-400 text-[10px]">· extending</span>
    </div>
  )}
</DragOverlay>
```

- [ ] **Step 3: Update GuestCell ghost styling when isDragging**

In `GuestCell.tsx`, find the outer `<div>` (around line 130) that currently uses `opacity-30` when dragging:

```tsx
// BEFORE:
className={`relative group h-full flex items-center py-1 cursor-grab active:cursor-grabbing ${
  isDragging || isExtending ? "opacity-30" : dimClass
}`}
```

Replace with a dashed ghost outline that shows the cell's original position:

```tsx
// AFTER:
className={`relative group h-full flex items-center py-1 cursor-grab active:cursor-grabbing ${
  isDragging || isExtending ? "opacity-25" : dimClass
}`}
```

And update the inner content div (around line 144) to show dashed border when dragging:

```tsx
// BEFORE:
className={`w-full h-7 flex items-center ${radiusClass} ${colors.bg} border ${colors.border} ${borderStyle} ${
  isSelected ? "ring-2 ring-indigo-500 ring-offset-1" : assignment.isManual ? "ring-1 ring-amber-400" : ""
} transition-shadow`}
```

```tsx
// AFTER:
className={`w-full h-7 flex items-center ${radiusClass} border transition-shadow ${
  isDragging || isExtending
    ? "border-dashed border-blue-400 bg-transparent"
    : `${colors.bg} ${colors.border} ${borderStyle} ${
        isSelected ? "ring-2 ring-indigo-500 ring-offset-1" : assignment.isManual ? "ring-1 ring-amber-400" : ""
      }`
}`}
```

- [ ] **Step 4: Check TypeScript**

```bash
cd "/Users/dunguyen/Desktop/Hostel Saas/apps/web" && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 5: Manual smoke test**

Start the dev server (`npm run dev` in `apps/web`) and navigate to `/grid`. Drag a guest cell. Verify:
- The floating element looks like a real cell (name, colored background, left stripe)
- The original cell at its old position shows a faint dashed outline
- Dropping the guest on an empty bed still works correctly

- [ ] **Step 6: Commit**

```bash
cd "/Users/dunguyen/Desktop/Hostel Saas"
git add apps/web/src/components/grid/BedGrid.tsx \
        apps/web/src/components/grid/GuestCell.tsx
git commit -m "feat: ghost cell clone drag overlay, dashed ghost on source cell"
```

---

### Task 3: Drop Animation + Self-Conflict Red Highlight + Regression Tests

**Files:**
- Modify: `apps/web/src/components/grid/BedGrid.tsx`
- Modify: `apps/web/src/components/grid/GuestCell.tsx`
- Modify: `apps/web/src/components/grid/DroppableCell.tsx` (minor, for completeness)
- Test: `apps/web/tests/grid.test.ts`

- [ ] **Step 1: Add defaultDropAnimationSideEffects import to BedGrid.tsx**

Update the `@dnd-kit/core` import block (builds on the import from Task 1):

```tsx
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  closestCenter,
  defaultDropAnimationSideEffects,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
```

- [ ] **Step 2: Define dropAnimationConfig outside the BedGrid component**

Add this constant at module level in `BedGrid.tsx`, just above the `export function BedGrid()` declaration. Defining it outside the component avoids recreating the config object on every render:

```tsx
const dropAnimationConfig = {
  duration: 180,
  easing: "cubic-bezier(0.2, 0, 0, 1)",
  sideEffects: defaultDropAnimationSideEffects({
    styles: {
      active: { opacity: "0" },
    },
  }),
};

export function BedGrid() {
  // ... existing body
```

- [ ] **Step 3: Replace dropAnimation={null} with the config**

Find the `<DragOverlay dropAnimation={null}>` line and change it to:

```tsx
<DragOverlay dropAnimation={dropAnimationConfig}>
```

- [ ] **Step 4: Add self-conflict red highlight in GuestCell**

The only invalid drop in this system is dragging a guest onto a cell of their own reservation. We detect this using `useDndContext()` (already imported from `@dnd-kit/core` in Task 1 step 4).

In `GuestCell.tsx`, after the existing `useDroppable` call, add:

```tsx
const { active } = useDndContext();

// Show red only when hovered by your OWN drag (can't swap with yourself)
const isSelfConflict =
  isOver &&
  active !== null &&
  active.data?.current?.type !== "extend" &&
  active.data?.current?.reservationId === assignment.reservationId;
```

Note: `isOver` comes from the existing `useDroppable` call. Change the existing line to capture it:

```tsx
// BEFORE:
const { setNodeRef: setDropRef } = useDroppable({
```

```tsx
// AFTER:
const { setNodeRef: setDropRef, isOver } = useDroppable({
```

- [ ] **Step 5: Apply red styling to GuestCell inner div when isSelfConflict**

Update the inner content div (modified in Task 2 Step 3) to include the conflict state:

```tsx
className={`w-full h-7 flex items-center ${radiusClass} border transition-shadow ${
  isDragging || isExtending
    ? "border-dashed border-blue-400 bg-transparent"
    : isSelfConflict
      ? "bg-red-950 border-red-500/60"
      : `${colors.bg} ${colors.border} ${borderStyle} ${
          isSelected ? "ring-2 ring-indigo-500 ring-offset-1" : assignment.isManual ? "ring-1 ring-amber-400" : ""
        }`
}`}
```

- [ ] **Step 6: Write failing regression tests**

In `apps/web/tests/grid.test.ts`, add at the end of the `describe("Bed Grid", ...)` block:

```ts
it("drag overlay shows a cell-like element (not just a text pill)", async () => {
  // Find a guest cell that has a reservation bar
  const guestCell = await page.$(".reservation-bar, [class*='bg-emerald-100'], [class*='bg-blue-100']");
  if (!guestCell) {
    console.log("No guest cells found — skipping drag overlay test");
    return;
  }

  const box = await guestCell.boundingBox();
  if (!box) return;

  // Start drag by holding pointer down
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  // Move far enough to activate drag (> 8px threshold)
  await page.mouse.move(box.x + box.width / 2 + 20, box.y + box.height / 2);

  // DragOverlay should appear — look for the clone with drop-shadow-xl class
  const overlay = await page.waitForSelector(".drop-shadow-xl", { timeout: 3000 }).catch(() => null);
  expect(overlay).not.toBeNull();

  // Release
  await page.mouse.up();
});

it("dropping on own cell is a no-op (no error toast appears)", async () => {
  // Find a guest cell with a start position (has the name visible)
  const guestCells = await page.$$("[class*='bg-emerald-100'], [class*='bg-blue-100']");
  if (guestCells.length === 0) return;

  const box = await guestCells[0].boundingBox();
  if (!box) return;

  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  // Drag from cell and drop back on itself
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 20, cy); // activate drag
  await page.mouse.move(cx, cy);       // drag back to source
  await page.mouse.up();

  // Wait briefly; no error toast should appear
  await new Promise((r) => setTimeout(r, 400));
  const errorToast = await page.$("[class*='bg-red'][class*='text-white'], .toast-error").catch(() => null);
  expect(errorToast).toBeNull();
});
```

- [ ] **Step 7: Run tests to verify they fail correctly (overlay test might fail before changes)**

```bash
cd "/Users/dunguyen/Desktop/Hostel Saas/apps/web" && npx vitest run tests/grid.test.ts --reporter=verbose 2>&1 | tail -30
```

Expected: new tests either pass (overlay already there after Task 2) or fail with a clear reason.

- [ ] **Step 8: Check TypeScript**

```bash
cd "/Users/dunguyen/Desktop/Hostel Saas/apps/web" && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 9: Run full test suite**

```bash
cd "/Users/dunguyen/Desktop/Hostel Saas/apps/web" && npx vitest run 2>&1 | tail -20
```

Expected: All previously passing tests still pass. The two new grid tests pass.

- [ ] **Step 10: Commit**

```bash
cd "/Users/dunguyen/Desktop/Hostel Saas"
git add apps/web/src/components/grid/BedGrid.tsx \
        apps/web/src/components/grid/GuestCell.tsx \
        apps/web/src/components/grid/DroppableCell.tsx \
        apps/web/tests/grid.test.ts
git commit -m "feat: smooth ease-out drop animation, red highlight on self-conflict drag"
```

---

## Verification Checklist

After all tasks, manually verify the following in the browser at `/grid`:

- [ ] Dragging a guest bar shows a clone that looks like the real cell (colored background, name, left stripe)
- [ ] The original cell shows a faint dashed outline while dragging
- [ ] Releasing on a valid empty bed: the clone glides smoothly into position (180ms ease-out, not jarring snap)
- [ ] Releasing on another guest's cell: guests swap beds, no error
- [ ] Hovering over a cell of the **same** guest's reservation during drag: that cell turns red
- [ ] Releasing on own cell: nothing happens, no toast error
- [ ] Extending a stay (drag right edge) still works, shows the extending label in the overlay
- [ ] Undo (⌘Z) still works after a move
- [ ] All existing drag behaviors (single night move, full stay move, swap) still work
