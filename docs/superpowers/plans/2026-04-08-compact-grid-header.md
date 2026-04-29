# Compact GridHeader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the two-row GridHeader into a single compact row — pills inline, legend removed, date range text removed, undo icon-only — to reclaim ~30px of vertical space for the bed grid.

**Architecture:** Pure layout restructure of one component. No logic, props, or data changes. The `GridHeader` return JSX gets rewritten to a single `flex` row. The `SummaryPill` sub-component is untouched.

**Tech Stack:** React, Tailwind CSS, Lucide icons

---

### Task 1: Rewrite GridHeader to single-row layout

**Files:**
- Modify: `apps/web/src/components/grid/GridHeader.tsx:45-208`

- [ ] **Step 1: Replace the GridHeader return JSX**

In `apps/web/src/components/grid/GridHeader.tsx`, replace everything inside the `return (` statement (lines 45-208) with a single-row layout. Keep all the same props and logic — only the JSX structure changes.

Find this block (the entire return statement body):

```tsx
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
```

Replace with this single-row layout (removes legend, removes date range text, makes undo icon-only, moves pills inline):

```tsx
    <div className="flex items-center gap-2 flex-wrap">
      {/* Date navigation */}
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

      {/* Summary pills — inline */}
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

      <div className="flex-1" />

      {/* Occupancy */}
      <div className="flex items-center gap-1.5 px-2.5 py-1 bg-white rounded-lg border border-slate-200 shadow-sm text-xs text-slate-600">
        <Users size={12} className="text-slate-400" />
        <span className="font-semibold text-slate-900">{todayOccupied}/{totalBeds}</span>
        <span className="text-slate-400">({totalBeds > 0 ? Math.round((todayOccupied / totalBeds) * 100) : 0}%)</span>
      </div>

      {/* Search */}
      <button
        onClick={onShowPalette}
        className="flex items-center gap-1.5 px-2.5 py-1 bg-white border border-slate-200 rounded-lg shadow-sm text-xs text-slate-500 hover:text-slate-700 hover:border-slate-300 transition-colors"
      >
        <Search size={12} />
        <kbd className="hidden md:inline text-[10px] bg-slate-100 text-slate-400 px-1 py-px rounded font-mono">⌘K</kbd>
      </button>

      {/* Undo — icon only */}
      <button
        onClick={onUndo}
        disabled={!undoAvailable}
        title="Undo last move (⌘Z)"
        className="p-1.5 bg-white border border-slate-200 rounded-lg shadow-sm text-slate-600 hover:text-slate-900 hover:border-slate-300 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <Undo2 size={13} />
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
```

- [ ] **Step 2: Remove unused imports**

The `format` and `addDays` imports from `date-fns` are no longer used in GridHeader (the date range text was removed). Remove them from the import line.

Find:
```tsx
import { format, addDays, subDays } from "date-fns";
```

Replace with:
```tsx
import { subDays } from "date-fns";
```

Note: `addDays` is still used inside the date navigation backward button logic — wait, actually no. Looking at the code: `addDays` is used in the forward navigation button `setStartDate((d: Date) => addDays(d, numDays))`. So `addDays` must stay. And `format` was only used for the date range text which is now removed. So the correct replacement is:

Find:
```tsx
import { format, addDays, subDays } from "date-fns";
```

Replace with:
```tsx
import { addDays, subDays } from "date-fns";
```

- [ ] **Step 3: Verify the app builds**

Run: `cd apps/web && npx next build 2>&1 | tail -5`
Expected: Build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/grid/GridHeader.tsx
git commit -m "feat: compact GridHeader into single row, remove legend and date range text"
```
