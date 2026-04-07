# Refactor & Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove dead code, split BedGrid.tsx (1,118 lines) and GuestDetailPanel.tsx (1,088 lines) into focused files, keep tests green throughout.

**Architecture:** Pure file extraction — no behavior changes. Components and hooks are moved to their own files with explicit imports. Flat file structure in `components/grid/`.

**Tech Stack:** Next.js, React, TypeScript, @dnd-kit/core, @tanstack/react-query

---

## File Structure

**Cleanup (deletions):**
- Delete: `src/` (root-level, 58 .ts/.tsx files — entirely obsolete, superseded by `apps/web/src/`)
- Delete: `apps/web/tests/drag-debug.mjs`
- Delete: `apps/web/tests/drag-visual.mjs`
- Modify: `.gitignore` — add `.superpowers/`

**BedGrid.tsx split — new files:**
- Create: `apps/web/src/components/grid/GuestCellClone.tsx` (~60 lines) — drag overlay clone component + drop animation config
- Create: `apps/web/src/components/grid/RoomRows.tsx` (~160 lines) — RoomRows memo component + SkeletonRows
- Create: `apps/web/src/components/grid/GridHeader.tsx` (~230 lines) — toolbar + SummaryPill component
- Create: `apps/web/src/components/grid/useBedGridDrag.ts` (~200 lines) — drag/drop hook with mutations + undo

**GuestDetailPanel.tsx split — new files:**
- Create: `apps/web/src/components/GuestBillView.tsx` (~180 lines) — bill/invoice display + print
- Create: `apps/web/src/components/GuestCheckinForm.tsx` (~100 lines) — check-in ID/nationality/phone form
- Create: `apps/web/src/components/GuestExtendForm.tsx` (~80 lines) — extend stay form

---

### Task 1: Cleanup — Delete dead files and update .gitignore

**Files:**
- Delete: `src/` (root-level directory, 58 files)
- Delete: `apps/web/tests/drag-debug.mjs`
- Delete: `apps/web/tests/drag-visual.mjs`
- Modify: `.gitignore`

- [ ] **Step 1: Delete the obsolete root `src/` directory**

```bash
rm -rf src/
```

This directory contains 58 outdated `.ts/.tsx` files from before the monorepo restructure. All active code is in `apps/web/src/`.

- [ ] **Step 2: Delete debug test scripts**

```bash
rm apps/web/tests/drag-debug.mjs apps/web/tests/drag-visual.mjs
```

These are untracked Puppeteer debugging scripts, not part of the test suite.

- [ ] **Step 3: Add `.superpowers/` to `.gitignore`**

Add this line to the end of `.gitignore`:

```
.superpowers/
```

- [ ] **Step 4: Verify tests still pass**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | grep -v "validator.ts\|accidental-clicks"`
Expected: No new errors (the two pre-existing ones are unrelated)

- [ ] **Step 5: Commit**

```bash
git add -A
git status  # verify only deletions + .gitignore change
git commit -m "chore: remove obsolete root src/, debug scripts, update .gitignore"
```

---

### Task 2: Extract GuestCellClone.tsx

**Files:**
- Create: `apps/web/src/components/grid/GuestCellClone.tsx`
- Modify: `apps/web/src/components/grid/BedGrid.tsx`

- [ ] **Step 1: Create `GuestCellClone.tsx`**

Create `apps/web/src/components/grid/GuestCellClone.tsx` with the following content — this is the `GuestCellClone` function (lines 813-859 of BedGrid.tsx) and `dropAnimationConfig` (lines 70-78) moved to their own file:

```tsx
import { defaultDropAnimationSideEffects } from "@dnd-kit/core";
import type { Assignment } from "./BedGrid";

export const dropAnimationConfig = {
  duration: 180,
  easing: "cubic-bezier(0.2, 0, 0, 1)",
  sideEffects: defaultDropAnimationSideEffects({
    styles: {
      active: { opacity: "0" },
    },
  }),
};

const SOURCE_BAR_COLORS: Record<string, string> = {
  "booking.com": "bg-blue-500",
  hostelworld: "bg-orange-500",
  manual: "bg-emerald-500",
};

function getCellColors(status: string) {
  switch (status) {
    case "checked_in":  return { bg: "bg-emerald-100", border: "border-emerald-300", text: "text-emerald-900" };
    case "confirmed":   return { bg: "bg-blue-100",    border: "border-blue-300",    text: "text-blue-900"    };
    case "checked_out": return { bg: "bg-slate-100",   border: "border-slate-200",   text: "text-slate-400"   };
    case "no_show":     return { bg: "bg-red-100",     border: "border-red-300",     text: "text-red-700"     };
    case "cancelled":   return { bg: "bg-slate-50",    border: "border-slate-200",   text: "text-slate-300"   };
    default:            return { bg: "bg-blue-100",    border: "border-blue-300",    text: "text-blue-900"    };
  }
}

export function GuestCellClone({ assignment, width }: { assignment: Assignment; width?: number }) {
  const barColor = SOURCE_BAR_COLORS[assignment.source] || "bg-slate-400";
  const colors = getCellColors(assignment.status);

  const payDot =
    assignment.status !== "checked_out" &&
    assignment.status !== "cancelled" &&
    assignment.paymentStatus !== "paid" &&
    assignment.paymentStatus !== "refunded"
      ? assignment.paymentStatus === "partial" ? "bg-amber-400" : "bg-red-400"
      : null;

  return (
    <div
      className="h-9 flex items-center py-1 cursor-grabbing opacity-95 drop-shadow-xl"
      style={width ? { width } : { minWidth: 90 }}
    >
      <div
        className={`w-full h-7 flex items-center rounded ml-1 mr-1 ${colors.bg} border ${colors.border} border-solid`}
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

- [ ] **Step 2: Update BedGrid.tsx imports**

In `BedGrid.tsx`, remove the `GuestCellClone` function (lines 813-859) and the `dropAnimationConfig` const (lines 70-78). Add this import near the top:

```tsx
import { GuestCellClone, dropAnimationConfig } from "./GuestCellClone";
```

- [ ] **Step 3: Verify build**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | grep -v "validator.ts\|accidental-clicks"`
Expected: No new errors

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/grid/GuestCellClone.tsx apps/web/src/components/grid/BedGrid.tsx
git commit -m "refactor: extract GuestCellClone from BedGrid"
```

---

### Task 3: Extract RoomRows.tsx

**Files:**
- Create: `apps/web/src/components/grid/RoomRows.tsx`
- Modify: `apps/web/src/components/grid/BedGrid.tsx`

- [ ] **Step 1: Create `RoomRows.tsx`**

Create `apps/web/src/components/grid/RoomRows.tsx` — move the `RoomRows` component (lines 861-1003), `SkeletonRows` (lines 1005-1049), and the `ROOM_ACCENT_COLORS` constant (line 68) from BedGrid.tsx:

```tsx
"use client";

import React, { useState } from "react";
import { format, isWeekend, isToday } from "date-fns";
import { GuestCell } from "./GuestCell";
import { DroppableCell } from "./DroppableCell";
import type { Assignment, CellPosition } from "./BedGrid";
import type { RoomWithBeds } from "@/types";

const ROOM_ACCENT_COLORS = ["#8b5cf6", "#0ea5e9", "#f59e0b", "#10b981", "#f97316", "#6366f1"];

export const RoomRows = React.memo(function RoomRows({
  room,
  dates,
  assignmentMap,
  cellPositionMap,
  selectedReservation,
  onSelectReservation,
  onOpenPanel,
  colorIndex,
  returningGuestIds,
  activeReservationId,
  activeDragMode,
  activeDragAssignmentId,
  activeDragBedId,
  dragBedDates,
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
  activeReservationId: number | null;
  activeDragMode: "stay" | "night";
  activeDragAssignmentId: number | null;
  activeDragBedId: string | null;
  dragBedDates: string[];
}) {
  const [collapsed, setCollapsed] = useState(false);
  const isFemale = room.roomType === "female";

  const accentColor = isFemale
    ? "#ec4899"
    : ROOM_ACCENT_COLORS[colorIndex % ROOM_ACCENT_COLORS.length];

  const todayStr = format(new Date(), "yyyy-MM-dd");
  const todayOccupied = room.beds.filter((bed) =>
    assignmentMap.has(`${bed.id}:${todayStr}`)
  ).length;

  return (
    <>
      {/* Room header row */}
      <tr
        className="cursor-pointer select-none group"
        onClick={() => setCollapsed(!collapsed)}
      >
        <td
          className={`sticky left-0 z-10 border-b border-r border-slate-200 px-3 py-2 ${
            isFemale ? "bg-pink-50/80" : "bg-slate-50"
          }`}
          style={{ borderLeft: `3px solid ${accentColor}` }}
          colSpan={dates.length + 1}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className={`text-[10px] transition-transform duration-200 ${collapsed ? "" : "rotate-90"} inline-block`}
              >
                ▶
              </span>
              <span className={`text-xs font-bold ${isFemale ? "text-pink-700" : "text-slate-700"}`}>
                {room.name}
              </span>
              {isFemale && (
                <span className="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded-full bg-pink-100 text-pink-600 tracking-wide">
                  Female Only
                </span>
              )}
              <span className="text-[10px] text-slate-400 font-medium">{room.capacity} beds</span>
            </div>
            <span className="text-[10px] text-slate-400 font-medium mr-2">
              {todayOccupied}/{room.capacity} occupied
            </span>
          </div>
        </td>
      </tr>

      {/* Bed rows */}
      {!collapsed &&
        room.beds.map((bed) => (
          <tr key={bed.id} data-bed-id={bed.id} className="group/row">
            <td
              className={`sticky left-0 z-10 border-b border-r border-slate-200 px-3 py-0 ${
                isFemale ? "bg-pink-50/30" : "bg-white"
              }`}
              style={{ borderLeft: `3px solid ${accentColor}30` }}
            >
              <div className="flex items-center gap-2 py-1">
                <span className="w-2 h-2 rounded-full bg-slate-200 group-hover/row:bg-indigo-400 transition-colors" />
                <span className="text-xs text-slate-500 font-medium">Bed {bed.bedNumber}</span>
              </div>
            </td>
            {dates.map((date) => {
              const dateStr = format(date, "yyyy-MM-dd");
              const assignment = assignmentMap.get(`${bed.id}:${dateStr}`);
              const cellPosition = cellPositionMap.get(`${bed.id}:${dateStr}`);
              const weekend = isWeekend(date);
              const today = isToday(date);

              return (
                <td
                  key={dateStr}
                  className={`border-b border-r border-slate-100 p-0 h-9 ${
                    today ? "bg-indigo-50/20" : weekend ? "bg-amber-50/20" : ""
                  }`}
                >
                  {assignment &&
                  assignment.status !== "cancelled" &&
                  assignment.status !== "no_show" ? (
                    <GuestCell
                      assignment={assignment}
                      position={cellPosition || "single"}
                      isSelected={selectedReservation === assignment.reservationId}
                      isReturning={returningGuestIds.has(assignment.guestId)}
                      activeReservationId={activeReservationId}
                      activeDragMode={activeDragMode}
                      activeDragAssignmentId={activeDragAssignmentId}
                      activeDragBedId={activeDragBedId}
                      onSelect={() =>
                        onSelectReservation(
                          selectedReservation === assignment.reservationId
                            ? null
                            : assignment.reservationId
                        )
                      }
                      onDoubleClick={() => onOpenPanel(assignment)}
                    />
                  ) : (
                    <DroppableCell bedId={bed.id} date={dateStr} roomType={room.roomType} dragBedDates={dragBedDates} />
                  )}
                </td>
              );
            })}
          </tr>
        ))}
    </>
  );
});

export function SkeletonRows({ numDays }: { numDays: number }) {
  const skeletonRooms = [{ beds: 4 }, { beds: 3 }, { beds: 5 }];
  const rows: React.JSX.Element[] = [];

  for (let ri = 0; ri < skeletonRooms.length; ri++) {
    const room = skeletonRooms[ri];

    rows.push(
      <tr key={`sh-${ri}`}>
        <td
          colSpan={numDays + 1}
          className="sticky left-0 z-10 border-b border-r border-slate-200 px-3 py-2.5 bg-slate-50"
        >
          <div
            className="h-3 rounded-full animate-pulse bg-slate-200"
            style={{ width: `${56 + ri * 24}px` }}
          />
        </td>
      </tr>
    );

    for (let bi = 0; bi < room.beds; bi++) {
      rows.push(
        <tr key={`sb-${ri}-${bi}`}>
          <td className="sticky left-0 z-10 border-b border-r border-slate-200 px-3 py-0 bg-white">
            <div className="h-3 w-12 rounded-full animate-pulse bg-slate-100 my-3" />
          </td>
          {Array.from({ length: numDays }).map((_, di) => {
            const showBar = (ri * 13 + bi * 7 + di * 3) % 11 < 3;
            return (
              <td key={di} className="border-b border-r border-slate-100 p-0 h-9">
                {showBar && (
                  <div className="h-7 mx-1 my-0.5 rounded animate-pulse bg-slate-100" />
                )}
              </td>
            );
          })}
        </tr>
      );
    }
  }

  return <>{rows}</>;
}
```

- [ ] **Step 2: Update BedGrid.tsx**

In `BedGrid.tsx`:
1. Remove `ROOM_ACCENT_COLORS` (line 68)
2. Remove `RoomRows` component (lines 861-1003)
3. Remove `SkeletonRows` component (lines 1005-1049)
4. Add import:

```tsx
import { RoomRows, SkeletonRows } from "./RoomRows";
```

- [ ] **Step 3: Verify build**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | grep -v "validator.ts\|accidental-clicks"`
Expected: No new errors

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/grid/RoomRows.tsx apps/web/src/components/grid/BedGrid.tsx
git commit -m "refactor: extract RoomRows and SkeletonRows from BedGrid"
```

---

### Task 4: Extract GridHeader.tsx

**Files:**
- Create: `apps/web/src/components/grid/GridHeader.tsx`
- Modify: `apps/web/src/components/grid/BedGrid.tsx`

- [ ] **Step 1: Create `GridHeader.tsx`**

Create `apps/web/src/components/grid/GridHeader.tsx` — move the toolbar (lines 471-571) and summary pills (lines 574-630) including the `SummaryPill` component (lines 1051-1118) from BedGrid.tsx:

```tsx
"use client";

import React, { useEffect, useRef } from "react";
import { format, addDays, subDays } from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  Users,
  Search,
  Undo2,
  LogIn,
  LogOut,
  AlertCircle,
} from "lucide-react";
import { useLang } from "@/contexts/LanguageContext";
import type { Assignment } from "./BedGrid";

interface GridHeaderProps {
  startDate: Date;
  setStartDate: React.Dispatch<React.SetStateAction<Date>>;
  numDays: number;
  setNumDays: (n: number) => void;
  todayOccupied: number;
  totalBeds: number;
  onShowPalette: () => void;
  onUndo: () => void;
  undoAvailable: boolean;
  todaySummary: {
    arrivals: Assignment[];
    departures: Assignment[];
    unpaid: Assignment[];
  };
  expandedPill: "arrivals" | "departures" | "unpaid" | null;
  setExpandedPill: (pill: "arrivals" | "departures" | "unpaid" | null) => void;
  scrollToBed: (bedId: string, reservationId: number) => void;
}

export function GridHeader({
  startDate,
  setStartDate,
  numDays,
  setNumDays,
  todayOccupied,
  totalBeds,
  onShowPalette,
  onUndo,
  undoAvailable,
  todaySummary,
  expandedPill,
  setExpandedPill,
  scrollToBed,
}: GridHeaderProps) {
  const { t } = useLang();

  return (
    <>
      {/* Compact toolbar — single row */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Navigation */}
        <div className="flex items-center bg-white rounded-lg border border-slate-200 shadow-sm">
          <button
            onClick={() =>
              setStartDate((d: Date) => {
                const minDate = subDays(new Date(), 7);
                const next = subDays(d, numDays);
                return next < minDate ? minDate : next;
              })
            }
            className="p-1.5 hover:bg-slate-50 rounded-l-lg border-r border-slate-200 transition-colors"
          >
            <ChevronLeft size={14} className="text-slate-600" />
          </button>
          <button
            onClick={() => setStartDate(subDays(new Date(), 1))}
            className="px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-1"
          >
            <Calendar size={12} />
            {t("grid_today")}
          </button>
          <button
            onClick={() => setStartDate((d: Date) => addDays(d, numDays))}
            className="p-1.5 hover:bg-slate-50 rounded-r-lg border-l border-slate-200 transition-colors"
          >
            <ChevronRight size={14} className="text-slate-600" />
          </button>
        </div>

        <span className="text-xs font-medium text-slate-600">
          {format(startDate, "MMM d")} — {format(addDays(startDate, numDays - 1), "MMM d, yyyy")}
        </span>

        {/* Occupancy */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-white rounded-lg border border-slate-200 shadow-sm text-xs text-slate-600">
          <Users size={12} className="text-slate-400" />
          <span className="font-semibold text-slate-900">{todayOccupied}/{totalBeds}</span>
          <span className="text-slate-400">({totalBeds > 0 ? Math.round((todayOccupied / totalBeds) * 100) : 0}%)</span>
        </div>

        <div className="flex-1" />

        {/* Search */}
        <button
          onClick={onShowPalette}
          className="flex items-center gap-1.5 px-2.5 py-1 bg-white border border-slate-200 rounded-lg shadow-sm text-xs text-slate-500 hover:text-slate-700 hover:border-slate-300 transition-colors"
        >
          <Search size={12} />
          <kbd className="hidden md:inline text-[10px] bg-slate-100 text-slate-400 px-1 py-px rounded font-mono">⌘K</kbd>
        </button>

        {/* Legend — compact */}
        <div className="hidden lg:flex items-center gap-3 text-[11px] text-slate-500">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-blue-100 border border-blue-300 border-dashed" />
            Expected
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-300" />
            In
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-slate-200" />
            Out
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-red-200" />
            No Show
          </span>
        </div>

        {/* Undo */}
        <button
          onClick={onUndo}
          disabled={!undoAvailable}
          title="Undo last move (⌘Z)"
          className="flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-200 rounded-lg shadow-sm text-[11px] font-medium text-slate-600 hover:text-slate-900 hover:border-slate-300 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Undo2 size={12} />
          Undo
        </button>

        {/* Period selector */}
        <div className="flex bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
          {[
            { n: 14, label: "2W" },
            { n: 21, label: "3W" },
          ].map(({ n, label }, i) => (
            <button
              key={n}
              onClick={() => setNumDays(n)}
              className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
                numDays === n ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-50"
              } ${i !== 0 ? "border-l border-slate-200" : ""}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Today's Summary — clickable pills with dropdown */}
      {(todaySummary.arrivals.length > 0 || todaySummary.departures.length > 0 || todaySummary.unpaid.length > 0) && (
        <div className="flex items-center gap-2 flex-wrap relative">
          {todaySummary.arrivals.length > 0 && (() => {
            const pending = todaySummary.arrivals.filter(a => a.status === "confirmed").length;
            const done = todaySummary.arrivals.filter(a => a.status === "checked_in").length;
            return (
              <SummaryPill
                type="arrivals"
                expanded={expandedPill === "arrivals"}
                onToggle={() => setExpandedPill(expandedPill === "arrivals" ? null : "arrivals")}
                className="bg-emerald-50 border-emerald-200 hover:bg-emerald-100"
                icon={<LogIn size={12} className="text-emerald-600" />}
                label={pending > 0
                  ? <><span className="font-semibold text-emerald-800">{pending} arriving</span>{done > 0 && <span className="text-emerald-500 ml-1">· {done} in</span>}</>
                  : <span className="font-semibold text-emerald-600">all checked in</span>
                }
                guests={todaySummary.arrivals}
                onGuestClick={scrollToBed}
                onClose={() => setExpandedPill(null)}
              />
            );
          })()}
          {todaySummary.departures.length > 0 && (() => {
            const done = todaySummary.departures.filter(a => a.status === "checked_out").length;
            const remaining = todaySummary.departures.length - done;
            return (
              <SummaryPill
                type="departures"
                expanded={expandedPill === "departures"}
                onToggle={() => setExpandedPill(expandedPill === "departures" ? null : "departures")}
                className="bg-slate-50 border-slate-200 hover:bg-slate-100"
                icon={<LogOut size={12} className="text-slate-400" />}
                label={remaining > 0
                  ? <><span className="font-semibold text-slate-700">{remaining} departing</span>{done > 0 && <span className="text-slate-400 ml-1">· {done} out</span>}</>
                  : <span className="font-semibold text-slate-500">all out</span>
                }
                guests={todaySummary.departures}
                onGuestClick={scrollToBed}
                onClose={() => setExpandedPill(null)}
              />
            );
          })()}
          {todaySummary.unpaid.length > 0 && (
            <SummaryPill
              type="unpaid"
              expanded={expandedPill === "unpaid"}
              onToggle={() => setExpandedPill(expandedPill === "unpaid" ? null : "unpaid")}
              className="bg-red-50 border-red-200 hover:bg-red-100"
              icon={<AlertCircle size={12} className="text-red-400" />}
              label={<span className="font-semibold text-red-700">{todaySummary.unpaid.length} unpaid</span>}
              guests={todaySummary.unpaid}
              onGuestClick={scrollToBed}
              onClose={() => setExpandedPill(null)}
            />
          )}
        </div>
      )}
    </>
  );
}

function SummaryPill({
  type,
  expanded,
  onToggle,
  className,
  icon,
  label,
  guests,
  onGuestClick,
  onClose,
}: {
  type: string;
  expanded: boolean;
  onToggle: () => void;
  className: string;
  icon: React.ReactNode;
  label: React.ReactNode;
  guests: Assignment[];
  onGuestClick: (bedId: string, reservationId: number) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!expanded) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [expanded, onClose]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={onToggle}
        className={`flex items-center gap-1.5 px-2.5 py-1 border rounded-lg text-xs cursor-pointer transition-colors ${className}`}
      >
        {icon}
        {label}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={`ml-0.5 text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      {expanded && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-white rounded-xl border border-slate-200 shadow-lg py-1.5 min-w-[300px] max-h-[400px] overflow-y-auto">
          {[...guests].sort((a, b) => a.guestName.localeCompare(b.guestName)).map((a) => (
            <button
              key={`${type}-${a.reservationId}`}
              onClick={() => onGuestClick(a.bedId, a.reservationId)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-slate-50 transition-colors text-left"
            >
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                a.status === "checked_in" ? "bg-emerald-500"
                  : a.status === "checked_out" ? "bg-slate-400"
                  : a.paymentStatus !== "paid" ? "bg-red-400"
                  : "bg-blue-400"
              }`} />
              <span className="font-medium text-slate-700 flex-1 truncate">{a.guestName}</span>
              <span className="text-[11px] text-slate-400 font-mono flex-shrink-0">{a.bedId}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Update BedGrid.tsx**

In `BedGrid.tsx`:
1. Remove the toolbar JSX (lines 471-571 — from `{/* Compact toolbar */}` through the period selector closing `</div>`)
2. Remove the summary pills JSX (lines 574-630 — from `{/* Today's Summary */}` through closing `</div>`)
3. Remove the `SummaryPill` component (lines 1051-1118)
4. Remove now-unused lucide imports: `ChevronLeft, ChevronRight, Calendar, Users, Search, Undo2, LogIn, LogOut, AlertCircle`
5. Add import:

```tsx
import { GridHeader } from "./GridHeader";
```

6. Replace the removed toolbar + summary pills JSX with:

```tsx
      <GridHeader
        startDate={startDate}
        setStartDate={setStartDate}
        numDays={numDays}
        setNumDays={setNumDays}
        todayOccupied={todayOccupied}
        totalBeds={totalBeds}
        onShowPalette={() => setShowPalette(true)}
        onUndo={performUndo}
        undoAvailable={undoHistory.length > 0}
        todaySummary={todaySummary}
        expandedPill={expandedPill}
        setExpandedPill={setExpandedPill}
        scrollToBed={scrollToBed}
      />
```

- [ ] **Step 3: Verify build**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | grep -v "validator.ts\|accidental-clicks"`
Expected: No new errors

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/grid/GridHeader.tsx apps/web/src/components/grid/BedGrid.tsx
git commit -m "refactor: extract GridHeader and SummaryPill from BedGrid"
```

---

### Task 5: Extract useBedGridDrag.ts

**Files:**
- Create: `apps/web/src/components/grid/useBedGridDrag.ts`
- Modify: `apps/web/src/components/grid/BedGrid.tsx`

- [ ] **Step 1: Create `useBedGridDrag.ts`**

Create `apps/web/src/components/grid/useBedGridDrag.ts` — move the drag state, mutations, undo stack, and drag handlers from BedGrid.tsx into a custom hook:

```tsx
import { useState, useCallback, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format, addDays, parseISO } from "date-fns";
import { DragStartEvent, DragEndEvent } from "@dnd-kit/core";
import { useToast } from "@/components/Toast";
import type { Assignment } from "./BedGrid";

type UndoEntry =
  | { type: "move"; reservationId: number; fromBedId: string; singleDate?: string }
  | { type: "extend"; reservationId: number; oldCheckOut: string; bedId: string };

interface UseBedGridDragOptions {
  assignments: Assignment[];
  fromStr: string;
  toStr: string;
}

export function useBedGridDrag({ assignments, fromStr, toStr }: UseBedGridDragOptions) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [draggedAssignment, setDraggedAssignment] = useState<Assignment | null>(null);
  const [dragCellWidth, setDragCellWidth] = useState<number | null>(null);
  const [isExtendingOverlay, setIsExtendingOverlay] = useState(false);
  const [dragMode, setDragMode] = useState<"stay" | "night">("stay");
  const [dragBedDates, setDragBedDates] = useState<string[]>([]);
  const [undoHistory, setUndoHistory] = useState<UndoEntry[]>([]);

  const pushUndo = useCallback((entry: UndoEntry) => {
    setUndoHistory((prev) => [...prev.slice(-9), entry]);
  }, []);

  const moveMutation = useMutation({
    mutationFn: (data: { reservationId: number; newBedId: string; fromBedId?: string; singleDate?: string }) =>
      fetch("/api/assignments/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => {
        if (!r.ok) return r.json().then((err) => { throw new Error(err.error || "Failed to move"); });
        return r.json();
      }),
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: ["assignments"] });
      const qk = ["assignments", fromStr, toStr];
      const prev = queryClient.getQueryData<Assignment[]>(qk);
      queryClient.setQueryData<Assignment[]>(qk, (old = []) =>
        old.map(a => {
          if (a.reservationId !== data.reservationId) return a;
          if (data.fromBedId && a.bedId !== data.fromBedId) return a;
          if (data.singleDate && a.date !== data.singleDate) return a;
          return { ...a, bedId: data.newBedId };
        })
      );
      return { prev, qk };
    },
    onError: (_err: Error, _data: unknown, ctx: { prev?: Assignment[]; qk?: string[] } | undefined) => {
      if (ctx?.prev && ctx?.qk) queryClient.setQueryData(ctx.qk, ctx.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["assignments"] }),
  });

  const swapMutation = useMutation({
    mutationFn: (data: { reservationIdA: number; reservationIdB: number; bedIdA: string; bedIdB: string; singleDate?: string }) =>
      fetch("/api/assignments/swap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => {
        if (!r.ok) return r.json().then((err) => { throw new Error(err.error || "Failed to swap"); });
        return r.json();
      }),
  });

  const extendMutation = useMutation({
    mutationFn: (data: { reservationId: number; newCheckOut: string; targetBedId: string }) =>
      fetch("/api/assignments/extend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => {
        if (!r.ok) return r.json().then((err) => { throw new Error(err.error || "Failed to extend"); });
        return r.json();
      }),
  });

  const performUndo = useCallback(() => {
    setUndoHistory((prev) => {
      const entry = prev[prev.length - 1];
      if (!entry) return prev;
      if (entry.type === "move") {
        moveMutation.mutate(
          { reservationId: entry.reservationId, newBedId: entry.fromBedId, singleDate: entry.singleDate },
          {
            onSuccess: () => queryClient.invalidateQueries({ queryKey: ["assignments"] }),
            onError: (err: Error) => toast(err.message, "error"),
          }
        );
      } else {
        extendMutation.mutate(
          { reservationId: entry.reservationId, newCheckOut: entry.oldCheckOut, targetBedId: entry.bedId },
          {
            onSuccess: () => queryClient.invalidateQueries({ queryKey: ["assignments"] }),
            onError: (err: Error) => toast(err.message, "error"),
          }
        );
      }
      return prev.slice(0, -1);
    });
  }, [moveMutation, extendMutation, queryClient, toast]);

  // Keyboard shortcuts: Cmd+Z → undo
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        performUndo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [performUndo]);

  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current;
    const dateHeader = document.querySelector("thead th:nth-child(2)");
    const cellW = dateHeader ? dateHeader.getBoundingClientRect().width : null;
    setDragCellWidth(cellW);
    if (data?.type === "extend") {
      setDraggedAssignment(data.assignment);
      setIsExtendingOverlay(true);
    } else if (data) {
      const a = data as Assignment;
      setDraggedAssignment(a);
      setIsExtendingOverlay(false);
      if (data.dragMode) setDragMode(data.dragMode as "stay" | "night");
      const bedDates = assignments
        .filter(x => x.reservationId === a.reservationId && x.bedId === a.bedId && x.status !== "cancelled" && x.status !== "no_show")
        .map(x => x.date)
        .sort();
      setDragBedDates(bedDates);
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    setDraggedAssignment(null);
    setDragCellWidth(null);
    setIsExtendingOverlay(false);
    setDragBedDates([]);

    if (!event.over || !event.active.data.current) return;

    const targetBedId = event.over.data.current?.bedId as string;
    const targetDate = event.over.data.current?.date as string;
    if (!targetBedId || !targetDate) return;

    // Extend drag
    if (event.active.data.current.type === "extend") {
      const assignment = event.active.data.current.assignment as Assignment;
      if (targetBedId !== assignment.bedId) {
        toast("Can only extend on the same bed", "error");
        return;
      }

      const newCheckOut = format(addDays(parseISO(targetDate), 1), "yyyy-MM-dd");
      if (newCheckOut === assignment.checkOut) return;

      if (newCheckOut <= assignment.checkIn) {
        toast("Must keep at least one night", "error");
        return;
      }

      const extending = newCheckOut > assignment.checkOut;
      const oldCheckOut = assignment.checkOut;
      extendMutation.mutate(
        { reservationId: assignment.reservationId, newCheckOut, targetBedId },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["assignments"] });
            pushUndo({ type: "extend", reservationId: assignment.reservationId, oldCheckOut, bedId: assignment.bedId });
            toast(extending ? "Stay extended" : "Stay shortened", "success");
          },
          onError: (error: Error) => toast(error.message, "error"),
        }
      );
      return;
    }

    // Normal move or swap
    const actData = event.active.data.current as Assignment & { dragMode?: "stay" | "night" };
    if (targetBedId === actData.bedId) return;

    // Swap
    if (event.over.data.current?.type === "guest") {
      const targetReservationId = event.over.data.current.reservationId as number;
      if (targetReservationId === actData.reservationId) return;

      const effectiveDragMode = actData.dragMode ?? dragMode;
      swapMutation.mutate(
        {
          reservationIdA: actData.reservationId,
          reservationIdB: targetReservationId,
          bedIdA: actData.bedId,
          bedIdB: targetBedId,
          singleDate: effectiveDragMode === "night" ? actData.date : undefined,
        },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["assignments"] });
            toast("Guests swapped", "success");
          },
          onError: (error: Error) => toast(error.message, "error"),
        }
      );
      return;
    }

    // Move
    const originalBedId = actData.bedId;
    const effectiveDragMode = actData.dragMode ?? dragMode;
    const moveData = {
      reservationId: actData.reservationId,
      newBedId: targetBedId,
      fromBedId: actData.bedId,
      singleDate: effectiveDragMode === "night" ? actData.date : undefined,
    };

    moveMutation.mutate(moveData, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["assignments"] });
        pushUndo({ type: "move", reservationId: actData.reservationId, fromBedId: originalBedId, singleDate: moveData.singleDate });
        toast("Guest moved", "success");
      },
      onError: (error: Error) => {
        const dateMatch = error.message.match(/(\d{4}-\d{2}-\d{2})$/);
        if (dateMatch && dateMatch[1] < fromStr) {
          const conflictDate = format(parseISO(dateMatch[1]), "MMM d");
          toast(`${error.message} (not visible — navigate back to ${conflictDate})`, "error");
        } else {
          toast(error.message, "error");
        }
      },
    });
  }

  return {
    draggedAssignment,
    dragCellWidth,
    isExtendingOverlay,
    dragMode,
    dragBedDates,
    undoHistory,
    performUndo,
    handleDragStart,
    handleDragEnd,
    statusMutation: useMutation({
      mutationFn: (data: { reservationId: number; status?: string; paymentStatus?: string }) =>
        fetch(`/api/reservations/${data.reservationId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: data.status, paymentStatus: data.paymentStatus }),
        }).then((r) => {
          if (!r.ok) return r.json().then((err) => { throw new Error(err.error || "Failed to update"); });
          return r.json();
        }),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ["assignments"] }),
    }),
  };
}
```

- [ ] **Step 2: Update BedGrid.tsx**

In `BedGrid.tsx`:
1. Remove: all mutation definitions (moveMutation, swapMutation, extendMutation, statusMutation — lines 133-198)
2. Remove: UndoEntry type, undoHistory state, pushUndo (lines 94-100)
3. Remove: performUndo callback (lines 300-323)
4. Remove: Cmd+Z keyboard handler from the useEffect (keep Cmd+K for palette, keep Escape)
5. Remove: handleDragStart function (lines 342-363)
6. Remove: handleDragEnd function (lines 365-464)
7. Remove: draggedAssignment, dragCellWidth, isExtendingOverlay, dragMode, dragBedDates state declarations (lines 84-85, 88-90)
8. Add import and hook call:

```tsx
import { useBedGridDrag } from "./useBedGridDrag";
```

Inside the `BedGrid` function, after `fromStr`/`toStr`:

```tsx
  const {
    draggedAssignment,
    dragCellWidth,
    isExtendingOverlay,
    dragMode,
    dragBedDates,
    undoHistory,
    performUndo,
    handleDragStart,
    handleDragEnd,
  } = useBedGridDrag({ assignments, fromStr, toStr });
```

Update the Cmd+K useEffect to only handle palette and escape (remove the Cmd+Z line since the hook handles it):

```tsx
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setShowPalette((p) => !p);
      }
      if (e.key === "Escape") setShowPalette(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
```

- [ ] **Step 3: Verify build**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | grep -v "validator.ts\|accidental-clicks"`
Expected: No new errors

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/grid/useBedGridDrag.ts apps/web/src/components/grid/BedGrid.tsx
git commit -m "refactor: extract useBedGridDrag hook from BedGrid"
```

---

### Task 6: Final verification and line count check

**Files:**
- All modified files from tasks 1-5

- [ ] **Step 1: Verify TypeScript compiles**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | grep -v "validator.ts\|accidental-clicks"`
Expected: No new errors

- [ ] **Step 2: Verify line counts**

Run: `wc -l apps/web/src/components/grid/BedGrid.tsx apps/web/src/components/grid/GuestCellClone.tsx apps/web/src/components/grid/RoomRows.tsx apps/web/src/components/grid/GridHeader.tsx apps/web/src/components/grid/useBedGridDrag.ts`

Expected approximate counts:
- BedGrid.tsx: ~300-400 lines
- GuestCellClone.tsx: ~65 lines
- RoomRows.tsx: ~170 lines
- GridHeader.tsx: ~230 lines
- useBedGridDrag.ts: ~210 lines

- [ ] **Step 3: Verify dev server starts**

Run: `cd apps/web && npm run dev`
Open http://localhost:3000/grid — verify the grid loads, drag works, extend works, undo works.

- [ ] **Step 4: Deploy**

```bash
cd apps/web && npx vercel deploy --prod
```
