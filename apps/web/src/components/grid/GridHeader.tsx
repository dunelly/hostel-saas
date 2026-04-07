"use client";
import React, { useEffect, useRef } from "react";
import { format, addDays, subDays } from "date-fns";
import { ChevronLeft, ChevronRight, Calendar, Users, Search, Undo2, LogIn, LogOut, AlertCircle } from "lucide-react";
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


// ─── Summary pill with clickable dropdown ──────────────────────────────────
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
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
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
