"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useCallback } from "react";
import { useLang } from "@/contexts/LanguageContext";
import {
  format,
  addDays,
  subDays,
  startOfWeek,
  eachDayOfInterval,
  isToday,
  isWeekend,
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
  MoveHorizontal,
  CalendarDays,
} from "lucide-react";
import { GuestCell } from "./GuestCell";
import { DroppableCell } from "./DroppableCell";
import { GuestDetailPanel } from "@/components/GuestDetailPanel";
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

// Determines the position of a cell within a multi-day stay
export type CellPosition = "single" | "start" | "middle" | "end";

export function BedGrid() {
  const queryClient = useQueryClient();
  const [startDate, setStartDate] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const [numDays, setNumDays] = useState(14);
  const [draggedAssignment, setDraggedAssignment] =
    useState<Assignment | null>(null);
  const [selectedReservation, setSelectedReservation] = useState<number | null>(
    null
  );
  const [panelAssignment, setPanelAssignment] = useState<Assignment | null>(
    null
  );
  const [dragMode, setDragMode] = useState<"stay" | "night">("stay");
  const { t } = useLang();

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

  const { data: rooms = [], isLoading: roomsLoading } = useQuery<
    RoomWithBeds[]
  >({
    queryKey: ["rooms"],
    queryFn: () => fetch("/api/rooms").then((r) => r.json()),
  });

  const { data: assignments = [], isLoading: assignmentsLoading } = useQuery<
    Assignment[]
  >({
    queryKey: ["assignments", fromStr, toStr],
    queryFn: () =>
      fetch(`/api/assignments?from=${fromStr}&to=${toStr}`).then((r) =>
        r.json()
      ),
  });

  const moveMutation = useMutation({
    mutationFn: (data: {
      reservationId: number;
      newBedId: string;
      singleDate?: string;
    }) =>
      fetch("/api/assignments/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assignments"] });
    },
  });

  // Build lookup: bedId:date -> assignment
  const assignmentMap = useMemo(() => {
    const map = new Map<string, Assignment>();
    for (const a of assignments) {
      map.set(`${a.bedId}:${a.date}`, a);
    }
    return map;
  }, [assignments]);

  // Build cell position map for reservation bar rendering
  const cellPositionMap = useMemo(() => {
    const map = new Map<string, CellPosition>();
    const dateStrs = dates.map((d) => format(d, "yyyy-MM-dd"));

    for (const a of assignments) {
      const key = `${a.bedId}:${a.date}`;
      const dateIndex = dateStrs.indexOf(a.date);
      if (dateIndex === -1) continue;

      const prevKey = `${a.bedId}:${dateStrs[dateIndex - 1]}`;
      const nextKey = `${a.bedId}:${dateStrs[dateIndex + 1]}`;
      const prevAssignment = assignmentMap.get(prevKey);
      const nextAssignment = assignmentMap.get(nextKey);

      const hasPrev =
        prevAssignment?.reservationId === a.reservationId &&
        prevAssignment?.guestName === a.guestName;
      const hasNext =
        nextAssignment?.reservationId === a.reservationId &&
        nextAssignment?.guestName === a.guestName;

      if (!hasPrev && !hasNext) map.set(key, "single");
      else if (!hasPrev && hasNext) map.set(key, "start");
      else if (hasPrev && hasNext) map.set(key, "middle");
      else map.set(key, "end");
    }
    return map;
  }, [assignments, dates, assignmentMap]);

  // Occupancy stats for the header
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const totalBeds = rooms.reduce((sum, r) => sum + r.beds.length, 0);
  const todayOccupied = assignments.filter((a) => a.date === todayStr).length;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current as Assignment | undefined;
    if (data) setDraggedAssignment(data);
  }

  function handleDragEnd(event: DragEndEvent) {
    setDraggedAssignment(null);
    if (!event.over || !draggedAssignment) return;

    const targetBedId = event.over.data.current?.bedId as string;
    if (!targetBedId || targetBedId === draggedAssignment.bedId) return;

    moveMutation.mutate({
      reservationId: draggedAssignment.reservationId,
      newBedId: targetBedId,
      singleDate: dragMode === "night" ? draggedAssignment.date : undefined,
    });
  }

  const isLoading = roomsLoading || assignmentsLoading;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        {/* Left: Navigation */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-white rounded-lg border border-slate-200 shadow-sm">
            <button
              onClick={() => setStartDate((d) => subDays(d, numDays))}
              className="p-2 hover:bg-slate-50 rounded-l-lg border-r border-slate-200 transition-colors"
            >
              <ChevronLeft size={16} className="text-slate-600" />
            </button>
            <button
              onClick={() =>
                setStartDate(startOfWeek(new Date(), { weekStartsOn: 1 }))
              }
              className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-1.5"
            >
              <Calendar size={14} />
              {t("grid_today")}
            </button>
            <button
              onClick={() => setStartDate((d) => addDays(d, numDays))}
              className="p-2 hover:bg-slate-50 rounded-r-lg border-l border-slate-200 transition-colors"
            >
              <ChevronRight size={16} className="text-slate-600" />
            </button>
          </div>

          <span className="text-sm font-medium text-slate-700 ml-2">
            {format(startDate, "MMM d")} —{" "}
            {format(addDays(startDate, numDays - 1), "MMM d, yyyy")}
          </span>
        </div>

        {/* Center: Occupancy indicator */}
        <div className="flex items-center gap-3 px-4 py-1.5 bg-white rounded-lg border border-slate-200 shadow-sm">
          <Users size={14} className="text-slate-400" />
          <span className="text-sm text-slate-600">
            Today:{" "}
            <span className="font-semibold text-slate-900">
              {todayOccupied}/{totalBeds}
            </span>
            <span className="text-slate-400 ml-1">
              ({totalBeds > 0 ? Math.round((todayOccupied / totalBeds) * 100) : 0}
              %)
            </span>
          </span>
        </div>

        {/* Right: View controls + Legend */}
        <div className="flex items-center gap-3">
          {/* Legend */}
          <div className="hidden lg:flex items-center gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-blue-100 border border-blue-300 border-dashed" />
              Expected
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-blue-400" />
              Checked In
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-slate-200" />
              Checked Out
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-red-200" />
              No Show
            </span>
          </div>

          <div className="h-4 w-px bg-slate-200 hidden lg:block" />

          {/* Drag mode toggle */}
          <div className="flex bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
            <button
              onClick={() => setDragMode("stay")}
              title="Drag moves the entire stay"
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
                dragMode === "stay"
                  ? "bg-slate-800 text-white"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <MoveHorizontal size={12} />
              {t("grid_move_stay")}
            </button>
            <button
              onClick={() => setDragMode("night")}
              title="Drag moves only that single night"
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors border-l border-slate-200 ${
                dragMode === "night"
                  ? "bg-slate-800 text-white"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <CalendarDays size={12} />
              {t("grid_move_night")}
            </button>
          </div>

          <div className="h-4 w-px bg-slate-200 hidden lg:block" />

          {/* Period selector */}
          <div className="flex bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
            {[
              { n: 7, label: "1 Week" },
              { n: 14, label: "2 Weeks" },
              { n: 21, label: "3 Weeks" },
            ].map(({ n, label }) => (
              <button
                key={n}
                onClick={() => setNumDays(n)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  numDays === n
                    ? "bg-slate-800 text-white"
                    : "text-slate-600 hover:bg-slate-50"
                } ${n !== 7 ? "border-l border-slate-200" : ""}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Loading bar */}
      {isLoading && (
        <div className="h-0.5 bg-slate-200 rounded overflow-hidden">
          <div className="h-full w-1/3 bg-indigo-500 rounded animate-pulse" />
        </div>
      )}

      {/* Grid */}
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="overflow-x-auto bg-white rounded-xl border border-slate-200 shadow-sm">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="sticky left-0 z-20 bg-slate-50 border-b border-r border-slate-200 p-0 w-36 min-w-[144px]">
                  <div className="px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Room / Bed
                  </div>
                </th>
                {dates.map((date) => {
                  const weekend = isWeekend(date);
                  const today = isToday(date);
                  return (
                    <th
                      key={date.toISOString()}
                      className={`border-b border-r border-slate-200 p-0 min-w-[90px] ${
                        today
                          ? "bg-indigo-50"
                          : weekend
                            ? "bg-amber-50/40"
                            : "bg-slate-50"
                      }`}
                    >
                      <div className="px-2 py-2 text-center">
                        <div
                          className={`text-[10px] font-medium uppercase tracking-wide ${
                            today
                              ? "text-indigo-500"
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
                          <div className="w-1 h-1 bg-indigo-500 rounded-full mx-auto mt-1 pulse-dot" />
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rooms.map((room) => (
                <RoomRows
                  key={room.id}
                  room={room}
                  dates={dates}
                  assignmentMap={assignmentMap}
                  cellPositionMap={cellPositionMap}
                  selectedReservation={selectedReservation}
                  onSelectReservation={setSelectedReservation}
                  onOpenPanel={setPanelAssignment}
                />
              ))}
            </tbody>
          </table>
        </div>

        <DragOverlay dropAnimation={null}>
          {draggedAssignment && (
            <div className="bg-indigo-100 border border-indigo-300 text-indigo-800 shadow-xl text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 font-medium">
              {draggedAssignment.guestName}
              <span className="text-indigo-400 text-[10px]">
                {dragMode === "night" ? `· ${draggedAssignment.date}` : "· full stay"}
              </span>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* Guest Detail Panel */}
      {panelAssignment && (
        <GuestDetailPanel
          reservation={{
            id: panelAssignment.reservationId,
            source: panelAssignment.source,
            guestName: panelAssignment.guestName,
            checkIn: panelAssignment.checkIn,
            checkOut: panelAssignment.checkOut,
            roomTypeReq: panelAssignment.roomTypeReq,
            numGuests: panelAssignment.numGuests,
            totalPrice: panelAssignment.totalPrice,
            currency: panelAssignment.currency,
            paymentStatus: panelAssignment.paymentStatus,
            amountPaid: panelAssignment.amountPaid,
            status: panelAssignment.status,
            bedId: panelAssignment.bedId,
            externalId: panelAssignment.externalId,
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
}: {
  room: RoomWithBeds;
  dates: Date[];
  assignmentMap: Map<string, Assignment>;
  cellPositionMap: Map<string, CellPosition>;
  selectedReservation: number | null;
  onSelectReservation: (id: number | null) => void;
  onOpenPanel: (assignment: Assignment) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const isFemale = room.roomType === "female";

  // Count occupancy for this room today
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const todayOccupied = room.beds.filter((bed) =>
    assignmentMap.has(`${bed.id}:${todayStr}`)
  ).length;

  return (
    <>
      {/* Room header */}
      <tr
        className="cursor-pointer select-none group"
        onClick={() => setCollapsed(!collapsed)}
      >
        <td
          className={`sticky left-0 z-10 border-b border-r border-slate-200 px-3 py-2 ${
            isFemale ? "bg-pink-50/80" : "bg-slate-50"
          }`}
          colSpan={dates.length + 1}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className={`text-[10px] transition-transform duration-200 ${collapsed ? "" : "rotate-90"} inline-block`}
              >
                ▶
              </span>
              <span
                className={`text-xs font-bold ${isFemale ? "text-pink-700" : "text-slate-700"}`}
              >
                {room.name}
              </span>
              {isFemale && (
                <span className="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded-full bg-pink-100 text-pink-600 tracking-wide">
                  Female Only
                </span>
              )}
              <span className="text-[10px] text-slate-400 font-medium">
                {room.capacity} beds
              </span>
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
            >
              <div className="flex items-center gap-2 py-1">
                <span className="w-2 h-2 rounded-full bg-slate-200 group-hover/row:bg-indigo-400 transition-colors" />
                <span className="text-xs text-slate-500 font-medium">
                  Bed {bed.bedNumber}
                </span>
              </div>
            </td>
            {dates.map((date) => {
              const dateStr = format(date, "yyyy-MM-dd");
              const assignment = assignmentMap.get(`${bed.id}:${dateStr}`);
              const cellPosition = cellPositionMap.get(
                `${bed.id}:${dateStr}`
              );
              const weekend = isWeekend(date);
              const today = isToday(date);

              return (
                <td
                  key={dateStr}
                  className={`border-b border-r border-slate-100 p-0 h-9 ${
                    today
                      ? "bg-indigo-50/20"
                      : weekend
                        ? "bg-amber-50/20"
                        : ""
                  }`}
                >
                  {assignment && assignment.status !== "cancelled" && assignment.status !== "no_show" ? (
                    <GuestCell
                      assignment={assignment}
                      position={cellPosition || "single"}
                      isSelected={
                        selectedReservation === assignment.reservationId
                      }
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
