"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import React, { useState, useMemo, useEffect, useCallback } from "react";
import { useLang } from "@/contexts/LanguageContext";
import {
  format,
  addDays,
  subDays,
  eachDayOfInterval,
  isToday,
  isWeekend,
  parseISO,
} from "date-fns";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  Users,
  Search,
  Undo2,
} from "lucide-react";
import { GuestCell } from "./GuestCell";
import { DroppableCell } from "./DroppableCell";
import { GuestDetailPanel } from "@/components/GuestDetailPanel";
import { CommandPalette } from "@/components/CommandPalette";
import { useToast } from "@/components/Toast";
import type { RoomWithBeds } from "@/types";

export interface Assignment {
  id: number;
  reservationId: number;
  bedId: string;
  date: string;
  guestName: string;
  isManual: number;
  source: string;
  checkIn: string;
  checkOut: string;
  paymentStatus: string;
  status: string;
  numGuests: number;
  roomTypeReq: string;
  totalPrice: number | null;
  amountPaid: number | null;
  currency: string | null;
  externalId?: string | null;
}

export type CellPosition = "single" | "start" | "middle" | "end";

// Accent colors for room rows (non-female rooms)
const ROOM_ACCENT_COLORS = ["#8b5cf6", "#0ea5e9", "#f59e0b", "#10b981", "#f97316", "#6366f1"];

export function BedGrid() {
  const queryClient = useQueryClient();
  const [startDate, setStartDate] = useState(() => subDays(new Date(), 1));
  const [numDays, setNumDays] = useState(14);
  const [draggedAssignment, setDraggedAssignment] = useState<Assignment | null>(null);
  const [selectedReservation, setSelectedReservation] = useState<number | null>(null);
  const [panelAssignment, setPanelAssignment] = useState<Assignment | null>(null);
  const [isExtendingOverlay, setIsExtendingOverlay] = useState(false);
  const [dragMode, setDragMode] = useState<"stay" | "night">("stay");
  const [showPalette, setShowPalette] = useState(false);

  type UndoEntry =
    | { type: "move"; reservationId: number; fromBedId: string; singleDate?: string }
    | { type: "extend"; reservationId: number; oldCheckOut: string; bedId: string };
  const [undoHistory, setUndoHistory] = useState<UndoEntry[]>([]);
  const pushUndo = useCallback((entry: UndoEntry) => {
    setUndoHistory((prev) => [...prev.slice(-9), entry]);
  }, []);
  const { t } = useLang();
  const { toast } = useToast();

  const dates = useMemo(
    () =>
      eachDayOfInterval({
        start: startDate,
        end: addDays(startDate, numDays - 1),
      }),
    [startDate, numDays]
  );

  const fromStr = format(startDate, "yyyy-MM-dd");
  const toStr = format(addDays(startDate, numDays - 1), "yyyy-MM-dd");

  const { data: rooms = [], isLoading: roomsLoading } = useQuery<RoomWithBeds[]>({
    queryKey: ["rooms"],
    queryFn: () => fetch("/api/rooms").then((r) => r.json()),
  });

  const { data: assignments = [], isLoading: assignmentsLoading } = useQuery<Assignment[]>({
    queryKey: ["assignments", fromStr, toStr],
    queryFn: () =>
      fetch(`/api/assignments?from=${fromStr}&to=${toStr}`).then((r) => r.json()),
  });

  // Always show fresh data in the panel after mutations
  const livePanelAssignment = useMemo(() => {
    if (!panelAssignment) return null;
    return assignments.find(a => a.reservationId === panelAssignment.reservationId) ?? panelAssignment;
  }, [panelAssignment, assignments]);

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

  // Lookup: bedId:date → assignment
  const assignmentMap = useMemo(() => {
    const map = new Map<string, Assignment>();
    for (const a of assignments) map.set(`${a.bedId}:${a.date}`, a);
    return map;
  }, [assignments]);

  // Cell position map for multi-day bar rendering
  const cellPositionMap = useMemo(() => {
    const map = new Map<string, CellPosition>();
    const dateStrs = dates.map((d) => format(d, "yyyy-MM-dd"));

    for (const a of assignments) {
      // Cancelled/no_show cells render as DroppableCell — skip position computation
      if (a.status === "cancelled" || a.status === "no_show") continue;

      const key = `${a.bedId}:${a.date}`;
      const dateIndex = dateStrs.indexOf(a.date);
      if (dateIndex === -1) continue;

      const prevKey = `${a.bedId}:${dateStrs[dateIndex - 1]}`;
      const nextKey = `${a.bedId}:${dateStrs[dateIndex + 1]}`;
      const prevA = assignmentMap.get(prevKey);
      const nextA = assignmentMap.get(nextKey);

      // Only treat a neighbor as a continuation if it's the same reservation
      // AND it's an active assignment (not cancelled/no_show)
      const hasPrev =
        prevA?.reservationId === a.reservationId &&
        prevA?.status !== "cancelled" &&
        prevA?.status !== "no_show";
      const hasNext =
        nextA?.reservationId === a.reservationId &&
        nextA?.status !== "cancelled" &&
        nextA?.status !== "no_show";

      if (!hasPrev && !hasNext) map.set(key, "single");
      else if (!hasPrev && hasNext) map.set(key, "start");
      else if (hasPrev && hasNext) map.set(key, "middle");
      else map.set(key, "end");
    }
    return map;
  }, [assignments, dates, assignmentMap]);

  // Per-date occupancy for heatmap (excluding cancelled/no_show)
  const occupancyByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of assignments) {
      if (a.status !== "cancelled" && a.status !== "no_show") {
        map.set(a.date, (map.get(a.date) || 0) + 1);
      }
    }
    return map;
  }, [assignments]);

  const todayStr = format(new Date(), "yyyy-MM-dd");
  const totalBeds = rooms.reduce((sum, r) => sum + r.beds.length, 0);
  const todayOccupied = assignments.filter((a) => a.date === todayStr && a.status !== "cancelled" && a.status !== "no_show").length;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

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

  // Cmd/Ctrl+K → command palette, Cmd+Z → undo
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setShowPalette((p) => !p);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        performUndo();
      }
      if (e.key === "Escape") setShowPalette(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [performUndo]);

  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current;
    if (data?.type === "extend") {
      setDraggedAssignment(data.assignment);
      setIsExtendingOverlay(true);
    } else if (data) {
      setDraggedAssignment(data as Assignment);
      setIsExtendingOverlay(false);
      if (data.dragMode) setDragMode(data.dragMode as "stay" | "night");
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    setDraggedAssignment(null);
    setIsExtendingOverlay(false);

    if (!event.over || !event.active.data.current) return;

    const targetBedId = event.over.data.current?.bedId as string;
    const targetDate = event.over.data.current?.date as string;
    if (!targetBedId || !targetDate) return;

    // Extend drag — must stay on same bed
    if (event.active.data.current.type === "extend") {
      const assignment = event.active.data.current.assignment as Assignment;
      if (targetBedId !== assignment.bedId) {
        toast("Can only extend on the same bed", "error");
        return;
      }

      const newCheckOut = format(addDays(parseISO(targetDate), 1), "yyyy-MM-dd");
      if (newCheckOut === assignment.checkOut) return; // no change

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

    // Normal move — with inline undo
    const actData = event.active.data.current as Assignment & { dragMode?: "stay" | "night" };
    if (event.over.data.current?.type === "guest") return; // can't move onto occupied cell
    if (targetBedId === actData.bedId) return;

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
      onError: (error: Error) => toast(error.message, "error"),
    });
  }

  const isLoading = roomsLoading || assignmentsLoading;

  return (
    <div className="space-y-2">
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
          onClick={() => setShowPalette(true)}
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
          onClick={performUndo}
          disabled={undoHistory.length === 0}
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

      {/* Grid */}
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="overflow-auto max-h-[calc(100vh-7rem)] bg-white rounded-xl border border-slate-200 shadow-sm">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 z-30">
              <tr>
                <th className="sticky left-0 z-40 bg-slate-50 border-b border-r border-slate-200 p-0 w-36 min-w-[144px]">
                  <div className="px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Room / Bed
                  </div>
                </th>
                {dates.map((date) => {
                  const weekend = isWeekend(date);
                  const today = isToday(date);
                  const dateStr = format(date, "yyyy-MM-dd");
                  const occ = occupancyByDate.get(dateStr) || 0;
                  const occPct = totalBeds > 0 ? occ / totalBeds : 0;

                  // Heatmap: today > high-occ > med-occ > weekend > default
                  const headerBg = today
                    ? "bg-indigo-50"
                    : occPct >= 0.85
                      ? "bg-red-50"
                      : occPct >= 0.6
                        ? "bg-amber-50"
                        : weekend
                          ? "bg-amber-50/40"
                          : "bg-slate-50";

                  return (
                    <th
                      key={date.toISOString()}
                      className={`border-b border-r border-slate-200 p-0 min-w-[90px] ${headerBg}`}
                    >
                      <div className="px-2 py-2 text-center">
                        <div
                          className={`text-[10px] font-medium uppercase tracking-wide ${
                            today
                              ? "text-indigo-500"
                              : occPct >= 0.85
                                ? "text-red-500"
                                : occPct >= 0.6
                                  ? "text-amber-600"
                                  : weekend
                                    ? "text-amber-600/70"
                                    : "text-slate-400"
                          }`}
                        >
                          {format(date, "EEE")}
                        </div>
                        <div
                          className={`text-xs font-semibold mt-0.5 ${
                            today ? "text-indigo-700" : "text-slate-700"
                          }`}
                        >
                          {format(date, "d")}
                        </div>
                        {today && (
                          <div className="w-1 h-1 bg-indigo-500 rounded-full mx-auto mt-1" />
                        )}
                        {/* Occupancy heat bar */}
                        {!today && occPct > 0 && (
                          <div className="mt-1.5 h-0.5 w-full bg-slate-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                occPct >= 0.85
                                  ? "bg-red-400"
                                  : occPct >= 0.6
                                    ? "bg-amber-400"
                                    : "bg-emerald-400"
                              }`}
                              style={{ width: `${Math.min(100, occPct * 100)}%` }}
                            />
                          </div>
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {isLoading && rooms.length === 0 ? (
                <SkeletonRows numDays={numDays} />
              ) : (
                rooms.map((room, roomIndex) => (
                  <RoomRows
                    key={room.id}
                    room={room}
                    dates={dates}
                    assignmentMap={assignmentMap}
                    cellPositionMap={cellPositionMap}
                    selectedReservation={selectedReservation}
                    onSelectReservation={setSelectedReservation}
                    onOpenPanel={setPanelAssignment}
                    colorIndex={roomIndex}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

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
      </DndContext>

      {/* Command palette */}
      {showPalette && (
        <CommandPalette
          assignments={assignments}
          onSelect={(a) => setPanelAssignment(a)}
          onClose={() => setShowPalette(false)}
        />
      )}

      {/* Guest Detail Panel */}
      {livePanelAssignment && (
        <GuestDetailPanel
          reservation={{
            id: livePanelAssignment.reservationId,
            source: livePanelAssignment.source,
            guestName: livePanelAssignment.guestName,
            checkIn: livePanelAssignment.checkIn,
            checkOut: livePanelAssignment.checkOut,
            roomTypeReq: livePanelAssignment.roomTypeReq,
            numGuests: livePanelAssignment.numGuests,
            totalPrice: livePanelAssignment.totalPrice,
            currency: livePanelAssignment.currency,
            paymentStatus: livePanelAssignment.paymentStatus,
            amountPaid: livePanelAssignment.amountPaid,
            status: livePanelAssignment.status,
            bedId: livePanelAssignment.bedId,
            externalId: livePanelAssignment.externalId,
          }}
          onClose={() => setPanelAssignment(null)}
        />
      )}
    </div>
  );
}

function RoomRows({
  room,
  dates,
  assignmentMap,
  cellPositionMap,
  selectedReservation,
  onSelectReservation,
  onOpenPanel,
  colorIndex,
}: {
  room: RoomWithBeds;
  dates: Date[];
  assignmentMap: Map<string, Assignment>;
  cellPositionMap: Map<string, CellPosition>;
  selectedReservation: number | null;
  onSelectReservation: (id: number | null) => void;
  onOpenPanel: (assignment: Assignment) => void;
  colorIndex: number;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const isFemale = room.roomType === "female";

  // Female rooms keep pink; mixed rooms get a cycling accent color
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
          <tr key={bed.id} className="group/row">
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
                    <DroppableCell bedId={bed.id} date={dateStr} roomType={room.roomType} />
                  )}
                </td>
              );
            })}
          </tr>
        ))}
    </>
  );
}

function SkeletonRows({ numDays }: { numDays: number }) {
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
            // Deterministic pattern for skeleton assignment cells
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
