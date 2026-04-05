"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths } from "date-fns";
import { ChevronLeft, ChevronRight, Plus, X, UserPlus, Sun, Sunset, Moon, Coffee, Palmtree } from "lucide-react";

interface StaffMember { id: number; name: string; color: string; }
interface Shift { id: number; staffId: number; staffName: string; staffColor: string; date: string; shiftType: string; note: string | null; }
interface DayOff { id: number; staffId: number; staffName: string; date: string; }

const SHIFT_TYPES = [
  { key: "morning",   label: "Morning",   time: "7 AM — 1 PM",  hours: "6h", Icon: Sun,    gradient: "from-amber-400 to-orange-400",   dimBg: "bg-amber-50",   dimText: "text-amber-700" },
  { key: "afternoon", label: "Afternoon", time: "1 PM — 6 PM",  hours: "5h", Icon: Sunset, gradient: "from-violet-400 to-purple-500",  dimBg: "bg-violet-50",  dimText: "text-violet-700" },
  { key: "evening",   label: "Evening",   time: "6 PM — 11 PM", hours: "5h", Icon: Moon,   gradient: "from-slate-600 to-slate-800",    dimBg: "bg-slate-100",  dimText: "text-slate-700" },
] as const;

const DAY_NAMES_VI: Record<number, string> = { 0: "CN", 1: "T2", 2: "T3", 3: "T4", 4: "T5", 5: "T6", 6: "T7" };

const STAFF_COLORS = [
  "#e11d48", "#ea580c", "#ca8a04", "#16a34a", "#0891b2", "#4f46e5", "#9333ea", "#db2777",
  "#0d9488", "#2563eb", "#c026d3", "#dc2626",
];

export default function SchedulePage() {
  const queryClient = useQueryClient();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [showAddStaff, setShowAddStaff] = useState(false);
  const [newStaffName, setNewStaffName] = useState("");
  const [newStaffColor, setNewStaffColor] = useState(STAFF_COLORS[0]);
  const [editCell, setEditCell] = useState<{ date: string; shiftType: string } | null>(null);
  const [dayOffDropdown, setDayOffDropdown] = useState<string | null>(null);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const from = format(monthStart, "yyyy-MM-dd");
  const to = format(monthEnd, "yyyy-MM-dd");
  const todayStr = format(new Date(), "yyyy-MM-dd");

  const { data: staffList = [] } = useQuery<StaffMember[]>({
    queryKey: ["staff"],
    queryFn: () => fetch("/api/staff").then(r => r.json()),
  });

  const { data: scheduleData } = useQuery<{ shifts: Shift[]; daysOff: DayOff[] }>({
    queryKey: ["shifts", from, to],
    queryFn: () => fetch(`/api/shifts?from=${from}&to=${to}`).then(r => r.json()),
  });

  const shiftMap = useMemo(() => {
    const map = new Map<string, Shift[]>();
    for (const s of scheduleData?.shifts || []) {
      const key = `${s.date}:${s.shiftType}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return map;
  }, [scheduleData?.shifts]);

  const dayOffMap = useMemo(() => {
    const map = new Map<string, DayOff[]>();
    for (const d of scheduleData?.daysOff || []) {
      if (!map.has(d.date)) map.set(d.date, []);
      map.get(d.date)!.push(d);
    }
    return map;
  }, [scheduleData?.daysOff]);

  const addStaffMutation = useMutation({
    mutationFn: (data: { name: string; color: string }) =>
      fetch("/api/staff", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["staff"] }); setNewStaffName(""); setShowAddStaff(false); },
  });

  const assignShiftMutation = useMutation({
    mutationFn: (data: { staffId: number; date: string; shiftType: string; note?: string }) =>
      fetch("/api/shifts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["shifts"] }); setEditCell(null); },
  });

  const deleteShiftMutation = useMutation({
    mutationFn: (data: { id: number; type?: string }) =>
      fetch("/api/shifts", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["shifts"] }),
  });

  const toggleDayOffMutation = useMutation({
    mutationFn: (data: { staffId: number; date: string }) =>
      fetch("/api/shifts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "toggle_dayoff", ...data }) }).then(r => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["shifts"] }); setDayOffDropdown(null); },
  });

  // Close dropdowns on Escape key
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") { setEditCell(null); setDayOffDropdown(null); }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  return (
    <div className="space-y-5 max-w-full">
      {/* ─── Header ─── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Staff Schedule</h1>
          <p className="text-xs text-slate-400 mt-0.5">Assign shifts, track days off</p>
        </div>
        <button
          onClick={() => setShowAddStaff(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-b from-slate-800 to-slate-900 text-white text-xs font-semibold rounded-xl hover:from-slate-700 hover:to-slate-800 transition-all shadow-sm shadow-slate-900/20 active:scale-[0.97]"
        >
          <UserPlus size={13} />
          Add Staff
        </button>
      </div>

      {/* ─── Add Staff Panel ─── */}
      {showAddStaff && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm animate-in">
          <div className="flex items-end gap-4">
            <div className="flex-1">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Staff Name</label>
              <input
                type="text" value={newStaffName} onChange={(e) => setNewStaffName(e.target.value)}
                placeholder="e.g. Xuan, Thuy, Khue..."
                autoFocus
                className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800/10 focus:border-slate-300 transition-all"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Color</label>
              <div className="flex gap-1.5">
                {STAFF_COLORS.map(c => (
                  <button
                    key={c} onClick={() => setNewStaffColor(c)}
                    className={`w-6 h-6 rounded-full transition-all duration-150 ${newStaffColor === c ? "ring-2 ring-offset-2 ring-slate-900 scale-110" : "hover:scale-110"}`}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>
            <button
              onClick={() => newStaffName.trim() && addStaffMutation.mutate({ name: newStaffName.trim(), color: newStaffColor })}
              className="px-5 py-2.5 bg-slate-900 text-white text-xs font-bold rounded-xl hover:bg-slate-800 transition-colors"
            >
              Add
            </button>
            <button onClick={() => setShowAddStaff(false)} className="px-3 py-2.5 text-xs text-slate-400 hover:text-slate-600 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ─── Staff Chips + Month Nav ─── */}
      <div className="flex items-center justify-between">
        {/* Staff chips */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {staffList.map((s, i) => (
            <span
              key={s.id}
              className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full text-white shadow-sm transition-transform hover:scale-105"
              style={{
                background: `linear-gradient(135deg, ${s.color}, ${s.color}cc)`,
                animationDelay: `${i * 50}ms`,
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-white/40" />
              {s.name}
            </span>
          ))}
          {staffList.length === 0 && (
            <span className="text-xs text-slate-300 italic">No staff added yet</span>
          )}
        </div>

        {/* Month navigation */}
        <div className="flex items-center gap-1 bg-white rounded-xl border border-slate-200 p-1 shadow-sm">
          <button
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="text-xs font-bold text-slate-700 min-w-[120px] text-center tracking-wide">
            {format(currentMonth, "MMMM yyyy")}
          </span>
          <button
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* ─── Schedule Grid ─── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            {/* ─── Header: Day names + dates ─── */}
            <thead>
              <tr>
                <th className="sticky left-0 z-20 bg-slate-900 text-white px-3 py-3 text-left text-[10px] font-bold uppercase tracking-widest min-w-[110px] rounded-tl-2xl">
                  Shift
                </th>
                {days.map((day, i) => {
                  const dateStr = format(day, "yyyy-MM-dd");
                  const dow = getDay(day);
                  const isWeekend = dow === 0 || dow === 6;
                  const isToday = dateStr === todayStr;
                  const isSunday = dow === 0;

                  return (
                    <th
                      key={dateStr}
                      className={`px-0 py-2.5 text-center min-w-[72px] border-l border-slate-200/50 ${
                        isToday
                          ? "bg-indigo-600 text-white"
                          : isSunday
                            ? "bg-red-500/10 text-red-600"
                            : isWeekend
                              ? "bg-orange-500/5 text-orange-600"
                              : "bg-slate-50 text-slate-500"
                      } ${i === days.length - 1 ? "rounded-tr-2xl" : ""}`}
                    >
                      <div className="text-[9px] font-bold uppercase tracking-wider opacity-70">
                        {DAY_NAMES_VI[dow]}
                      </div>
                      <div className={`text-sm font-bold mt-0.5 ${
                        isToday ? "bg-white text-indigo-600 w-6 h-6 rounded-full flex items-center justify-center mx-auto" : ""
                      }`}>
                        {format(day, "d")}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody>
              {/* ─── Shift Rows ─── */}
              {SHIFT_TYPES.map(shift => {
                const ShiftIcon = shift.Icon;
                return (
                  <tr key={shift.key}>
                    {/* Shift label */}
                    <td className={`sticky left-0 z-10 ${shift.dimBg} border-b border-r border-slate-100 px-3 py-2`}>
                      <div className="flex items-center gap-2">
                        <div className={`w-6 h-6 rounded-lg bg-gradient-to-br ${shift.gradient} flex items-center justify-center shadow-sm`}>
                          <ShiftIcon size={12} className="text-white" />
                        </div>
                        <div>
                          <div className={`text-[10px] font-bold ${shift.dimText}`}>{shift.label}</div>
                          <div className="text-[9px] text-slate-400">{shift.time}</div>
                        </div>
                      </div>
                    </td>

                    {/* Day cells */}
                    {days.map(day => {
                      const dateStr = format(day, "yyyy-MM-dd");
                      const key = `${dateStr}:${shift.key}`;
                      const cellShifts = shiftMap.get(key) || [];
                      const isEditing = editCell?.date === dateStr && editCell?.shiftType === shift.key;
                      const isToday = dateStr === todayStr;
                      const isSunday = getDay(day) === 0;

                      return (
                        <td
                          key={dateStr}
                          className={`border-b border-l border-slate-100 px-0.5 py-0.5 align-top cursor-pointer transition-colors ${
                            isToday ? "bg-indigo-50/40" : isSunday ? "bg-red-50/20" : "hover:bg-slate-50"
                          }`}
                          onClick={(e) => { e.stopPropagation(); setEditCell({ date: dateStr, shiftType: shift.key }); setDayOffDropdown(null); }}
                        >
                          <div className="min-h-[32px] p-0.5 space-y-0.5">
                            {cellShifts.map(s => (
                              <div
                                key={s.id}
                                className="group flex items-center gap-0.5 px-1.5 py-1 rounded-lg text-[10px] font-bold text-white shadow-sm transition-all hover:shadow-md hover:-translate-y-px"
                                style={{
                                  background: `linear-gradient(135deg, ${s.staffColor}, ${s.staffColor}bb)`,
                                }}
                              >
                                <span className="truncate flex-1">{s.staffName}</span>
                                {s.note && <span className="text-[8px] opacity-60 truncate">({s.note})</span>}
                                <button
                                  onClick={(e) => { e.stopPropagation(); deleteShiftMutation.mutate({ id: s.id }); }}
                                  className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 hover:bg-white/20 rounded"
                                >
                                  <X size={9} />
                                </button>
                              </div>
                            ))}

                            {/* Assign dropdown */}
                            {isEditing && (
                              <div className="relative" onClick={e => e.stopPropagation()}>
                                <select
                                  autoFocus
                                  className="w-full text-[10px] font-semibold border border-indigo-300 rounded-lg px-1.5 py-1 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400/30 shadow-lg"
                                  onChange={(e) => {
                                    if (e.target.value) assignShiftMutation.mutate({ staffId: parseInt(e.target.value), date: dateStr, shiftType: shift.key });
                                  }}
                                  onBlur={() => setEditCell(null)}
                                  defaultValue=""
                                >
                                  <option value="">Assign...</option>
                                  {staffList.map(s => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                  ))}
                                </select>
                              </div>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}

              {/* ─── Activities Row ─── */}
              <tr>
                <td className="sticky left-0 z-10 bg-amber-50 border-b border-r border-slate-100 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-amber-400 to-yellow-500 flex items-center justify-center shadow-sm">
                      <Coffee size={12} className="text-white" />
                    </div>
                    <div className="text-[10px] font-bold text-amber-700">Activities</div>
                  </div>
                </td>
                {days.map(day => {
                  const dateStr = format(day, "yyyy-MM-dd");
                  const notes = [...new Set(
                    (scheduleData?.shifts || []).filter(s => s.date === dateStr && s.note).map(s => s.note).filter(Boolean)
                  )];
                  const isToday = dateStr === todayStr;
                  return (
                    <td key={dateStr} className={`border-b border-l border-slate-100 px-1 py-1 ${isToday ? "bg-indigo-50/40" : ""}`}>
                      {notes.map((n, i) => (
                        <span key={i} className="block text-[9px] font-bold text-amber-600 bg-amber-100 rounded px-1 py-0.5 truncate">
                          {n}
                        </span>
                      ))}
                    </td>
                  );
                })}
              </tr>

              {/* ─── Days Off Row ─── */}
              <tr>
                <td className="sticky left-0 z-10 bg-teal-50 border-r border-slate-100 px-3 py-2 rounded-bl-2xl">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-teal-400 to-cyan-500 flex items-center justify-center shadow-sm">
                      <Palmtree size={12} className="text-white" />
                    </div>
                    <div className="text-[10px] font-bold text-teal-700">Days Off</div>
                  </div>
                </td>
                {days.map((day, i) => {
                  const dateStr = format(day, "yyyy-MM-dd");
                  const offs = dayOffMap.get(dateStr) || [];
                  const isToday = dateStr === todayStr;
                  const isOpen = dayOffDropdown === dateStr;

                  return (
                    <td
                      key={dateStr}
                      className={`border-l border-slate-100 px-0.5 py-0.5 align-top cursor-pointer transition-colors ${
                        isToday ? "bg-indigo-50/40" : "hover:bg-teal-50/50"
                      } ${i === days.length - 1 ? "rounded-br-2xl" : ""}`}
                      onClick={(e) => { e.stopPropagation(); setDayOffDropdown(isOpen ? null : dateStr); setEditCell(null); }}
                    >
                      <div className="min-h-[28px] p-0.5 space-y-0.5">
                        {offs.map(o => {
                          const member = staffList.find(s => s.id === o.staffId);
                          return (
                            <span
                              key={o.id}
                              className="block text-[9px] font-bold rounded px-1 py-0.5 truncate"
                              style={{
                                background: `${member?.color || "#0891b2"}20`,
                                color: member?.color || "#0891b2",
                              }}
                            >
                              {o.staffName}
                            </span>
                          );
                        })}

                        {/* Day off dropdown */}
                        {isOpen && staffList.length > 0 && (
                          <div className="relative z-30" onClick={e => e.stopPropagation()}>
                            <div className="absolute top-0 left-0 bg-white border border-teal-200 rounded-lg shadow-xl p-1 min-w-[90px]">
                              {staffList.map(s => {
                                const isOff = offs.some(o => o.staffId === s.id);
                                return (
                                  <button
                                    key={s.id}
                                    onClick={() => toggleDayOffMutation.mutate({ staffId: s.id, date: dateStr })}
                                    className={`w-full flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-semibold transition-colors ${
                                      isOff ? "bg-teal-100 text-teal-700" : "hover:bg-slate-50 text-slate-600"
                                    }`}
                                  >
                                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} />
                                    {s.name}
                                    {isOff && <span className="ml-auto text-teal-500">&#10003;</span>}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── Legend ─── */}
      <div className="flex items-center gap-4 text-[10px] text-slate-400 px-1">
        <span>Click a cell to assign a shift</span>
        <span className="text-slate-200">|</span>
        <span>Click <strong className="text-teal-600">Days Off</strong> row to toggle</span>
        <span className="text-slate-200">|</span>
        <span>Hover a shift to remove it</span>
      </div>
    </div>
  );
}
