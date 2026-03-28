"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { Search, X, LogIn, LogOut, Clock } from "lucide-react";
import type { Assignment } from "./grid/BedGrid";

interface Props {
  assignments: Assignment[];
  onSelect: (assignment: Assignment) => void;
  onClose: () => void;
}

export function CommandPalette({ assignments, onSelect, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Deduplicate by reservationId — keep the most recent assignment per reservation
  const unique = useMemo(() => {
    const map = new Map<number, Assignment>();
    for (const a of assignments) {
      const existing = map.get(a.reservationId);
      if (!existing || a.date > existing.date) map.set(a.reservationId, a);
    }
    return Array.from(map.values());
  }, [assignments]);

  const filtered = useMemo(() => {
    if (!query.trim()) return unique.slice(0, 10);
    const q = query.toLowerCase();
    return unique.filter(
      (a) =>
        a.guestName.toLowerCase().includes(q) ||
        a.bedId.toLowerCase().includes(q) ||
        a.source.toLowerCase().includes(q)
    );
  }, [unique, query]);

  useEffect(() => setActiveIdx(0), [filtered]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && filtered[activeIdx]) {
      onSelect(filtered[activeIdx]);
      onClose();
    }
  }

  function StatusIcon({ status }: { status: string }) {
    if (status === "checked_in") return <LogIn size={11} className="text-emerald-500" />;
    if (status === "checked_out") return <LogOut size={11} className="text-slate-400" />;
    return <Clock size={11} className="text-blue-400" />;
  }

  return (
    <>
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-[100]"
        onClick={onClose}
      />
      <div className="fixed top-[18%] left-1/2 -translate-x-1/2 w-full max-w-md z-[110] bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-200">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-100">
          <Search size={16} className="text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search guests by name, bed, or source…"
            className="flex-1 text-sm text-slate-800 placeholder-slate-400 outline-none"
          />
          {query ? (
            <button onClick={() => setQuery("")} className="text-slate-300 hover:text-slate-500 transition-colors">
              <X size={14} />
            </button>
          ) : (
            <kbd className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded font-mono">ESC</kbd>
          )}
        </div>

        {/* Results */}
        <div className="max-h-72 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-400">No guests found</div>
          ) : (
            filtered.map((a, idx) => (
              <button
                key={a.reservationId}
                onClick={() => { onSelect(a); onClose(); }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 transition-colors text-left ${
                  idx === activeIdx ? "bg-indigo-50" : "hover:bg-slate-50"
                }`}
              >
                {/* Avatar */}
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 ${
                    a.status === "checked_in"
                      ? "bg-emerald-600"
                      : a.status === "checked_out"
                        ? "bg-slate-500"
                        : "bg-slate-900"
                  }`}
                >
                  {a.guestName
                    .split(" ")
                    .map((n: string) => n[0])
                    .slice(0, 2)
                    .join("")
                    .toUpperCase()}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-800 truncate">{a.guestName}</div>
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                    <StatusIcon status={a.status} />
                    <span>{a.checkIn} → {a.checkOut}</span>
                    <span className="text-slate-300">·</span>
                    <span className="font-mono">{a.bedId}</span>
                  </div>
                </div>

                {/* Status badge */}
                <span
                  className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${
                    a.status === "checked_in"
                      ? "bg-emerald-100 text-emerald-700"
                      : a.status === "checked_out"
                        ? "bg-slate-100 text-slate-500"
                        : a.status === "no_show"
                          ? "bg-red-100 text-red-600"
                          : "bg-blue-100 text-blue-700"
                  }`}
                >
                  {a.status.replace("_", " ")}
                </span>
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-slate-100 flex items-center justify-between">
          <span className="text-[10px] text-slate-400">
            {filtered.length} guest{filtered.length !== 1 ? "s" : ""}
          </span>
          <div className="flex items-center gap-3 text-[10px] text-slate-400">
            <span>
              <kbd className="bg-slate-100 px-1 py-0.5 rounded font-mono">↑↓</kbd> navigate
            </span>
            <span>
              <kbd className="bg-slate-100 px-1 py-0.5 rounded font-mono">↵</kbd> open
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
