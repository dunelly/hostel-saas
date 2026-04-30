"use client";

import { useQuery } from "@tanstack/react-query";
import { useState, useMemo, useEffect, useCallback } from "react";
import {
  format,
  addDays,
  subDays,
  eachDayOfInterval,
  isToday,
  isWeekend,
} from "date-fns";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { GuestCellClone, dropAnimationConfig } from "./GuestCellClone";
import { GuestDetailPanel } from "@/components/GuestDetailPanel";
import { RoomRows, SkeletonRows } from "./RoomRows";
import { GridHeader } from "./GridHeader";
import { CommandPalette } from "@/components/CommandPalette";
import { useBedGridDrag } from "./useBedGridDrag";
import type { RoomWithBeds } from "@/types";

export interface Assignment {
  id: number;
  reservationId: number;
  bedId: string;
  date: string;
  guestName: string;
  isManual: number;
  guestId: number;
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

export function BedGrid() {
  const [startDate, setStartDate] = useState(() => subDays(new Date(), 1));
  const [numDays, setNumDays] = useState(14);
  const [selectedReservation, setSelectedReservation] = useState<number | null>(null);
  const [panelAssignment, setPanelAssignment] = useState<Assignment | null>(null);
  const [showPalette, setShowPalette] = useState(false);
  const [expandedPill, setExpandedPill] = useState<"arrivals" | "departures" | "unpaid" | null>(null);

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

  // Always show fresh data in the panel after mutations
  const livePanelAssignment = useMemo(() => {
    if (!panelAssignment) return null;
    return assignments.find(a => a.reservationId === panelAssignment.reservationId) ?? panelAssignment;
  }, [panelAssignment, assignments]);

  // Lookup: bedId:date → assignment
  const assignmentMap = useMemo(() => {
    const map = new Map<string, Assignment>();
    for (const a of assignments) map.set(`${a.bedId}:${a.date}`, a);
    return map;
  }, [assignments]);

  const bedOrderMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const room of rooms) {
      [...room.beds]
        .sort((a, b) => a.bedNumber - b.bedNumber)
        .forEach((bed, index) => {
          map.set(bed.id, index + 1);
        });
    }
    return map;
  }, [rooms]);

  const guestIndexMap = useMemo(() => {
    const reservationBeds = new Map<number, Set<string>>();
    for (const a of assignments) {
      if (!reservationBeds.has(a.reservationId)) {
        reservationBeds.set(a.reservationId, new Set());
      }
      reservationBeds.get(a.reservationId)!.add(a.bedId);
    }

    const map = new Map<string, number>();
    for (const [reservationId, bedIds] of reservationBeds) {
      if (bedIds.size <= 1) continue;
      [...bedIds]
        .sort((a, b) => (bedOrderMap.get(a) ?? 0) - (bedOrderMap.get(b) ?? 0) || a.localeCompare(b))
        .forEach((bedId, index) => {
          map.set(`${reservationId}:${bedId}`, index + 1);
        });
    }
    return map;
  }, [assignments, bedOrderMap]);

  // Returning guest detection: guestId with multiple reservationIds
  const returningGuestIds = useMemo(() => {
    const guestReservations = new Map<number, Set<number>>();
    for (const a of assignments) {
      if (!a.guestId) continue;
      if (!guestReservations.has(a.guestId)) guestReservations.set(a.guestId, new Set());
      guestReservations.get(a.guestId)!.add(a.reservationId);
    }
    const returning = new Set<number>();
    for (const [guestId, resIds] of guestReservations) {
      if (resIds.size > 1) returning.add(guestId);
    }
    return returning;
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

  // Today's summary: arrivals, departures, unpaid
  const todaySummary = useMemo(() => {
    const todayAssignments = assignments.filter((a) => a.date === todayStr && a.status !== "cancelled");
    const seen = new Map<number, Assignment>();
    for (const a of todayAssignments) {
      if (!seen.has(a.reservationId)) seen.set(a.reservationId, a);
    }
    const unique = Array.from(seen.values());
    return {
      arrivals: unique.filter((a) => a.checkIn === todayStr && (a.status === "confirmed" || a.status === "checked_in")),
      departures: unique.filter((a) => a.checkOut === todayStr && (a.status === "checked_in" || a.status === "checked_out")),
      unpaid: unique.filter((a) => a.paymentStatus !== "paid" && a.paymentStatus !== "refunded" && a.status !== "no_show"),
    };
  }, [assignments, todayStr]);

  const scrollToBed = useCallback((bedId: string, reservationId: number) => {
    setSelectedReservation(reservationId);
    setExpandedPill(null);
    const row = document.querySelector(`tr[data-bed-id="${bedId}"]`);
    if (row) row.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  // Cmd/Ctrl+K → command palette, Escape → close palette
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

  const isLoading = roomsLoading || assignmentsLoading;

  return (
    <div className="space-y-2">
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

      {/* Grid */}
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="overflow-auto max-h-[calc(100vh-7.5rem)] bg-white rounded-xl border border-slate-200 shadow-sm">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 z-30">
              <tr>
                <th className="sticky left-0 z-40 bg-slate-50 border-b border-r border-slate-200 p-0 w-[180px] min-w-[180px] max-w-[180px]">
                  <div className="flex items-center justify-between px-4 py-4 text-[12px] font-semibold text-slate-400 uppercase tracking-wider">
                    Room / Bed
                    <span className="h-px w-5 bg-slate-300" />
                  </div>
                </th>
                {dates.map((date) => {
                  const weekend = isWeekend(date);
                  const today = isToday(date);
                  const dateStr = format(date, "yyyy-MM-dd");
                  const occ = occupancyByDate.get(dateStr) || 0;
                  const occPct = totalBeds > 0 ? occ / totalBeds : 0;
                  const headerBg = today
                    ? "bg-teal-50"
                    : weekend
                      ? "bg-slate-50"
                      : "bg-white";

                  return (
                    <th
                      key={date.toISOString()}
                      className={`border-b border-slate-200 p-0 w-[120px] min-w-[120px] max-w-[120px] ${headerBg}`}
                      title={`${occ}/${totalBeds} beds full (${Math.round(occPct * 100)}%)`}
                    >
                      <div className="px-2 py-2 text-center">
                        <div
                          className={`text-[10px] font-medium uppercase tracking-wide ${
                            today
                              ? "text-teal-600"
                              : "text-slate-400"
                          }`}
                        >
                          {format(date, "EEE")}
                        </div>
                        <div
                          className={`text-xs font-semibold mt-0.5 ${
                            today ? "text-teal-600" : "text-slate-900"
                          }`}
                        >
                          {format(date, "d")}
                        </div>
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
                    guestIndexMap={guestIndexMap}
                    selectedReservation={selectedReservation}
                    onSelectReservation={setSelectedReservation}
                    onOpenPanel={setPanelAssignment}
                    colorIndex={roomIndex}
                    activeReservationId={!isExtendingOverlay && draggedAssignment ? draggedAssignment.reservationId : null}
                    activeDragMode={dragMode}
                    activeDragAssignmentId={draggedAssignment?.id ?? null}
                    activeDragBedId={draggedAssignment?.bedId ?? null}
                    dragBedDates={dragBedDates}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        <DragOverlay dropAnimation={dropAnimationConfig}>
          {draggedAssignment && !isExtendingOverlay && (() => {
            // Width = number of nights visible in current window × single cell width
            let overlayWidth: number | undefined;
            if (dragCellWidth) {
              if (dragMode === "night") {
                // Single night drag — overlay is one cell wide
                overlayWidth = dragCellWidth;
              } else {
                // Count nights on the specific bed being dragged, not the full reservation
                const dragBedId = draggedAssignment.bedId;
                const dragResId = draggedAssignment.reservationId;
                const bedNights = assignments.filter(a =>
                  a.reservationId === dragResId &&
                  a.bedId === dragBedId &&
                  a.status !== "cancelled" && a.status !== "no_show"
                ).length;
                overlayWidth = Math.max(1, bedNights) * dragCellWidth;
              }
            }
            const guestIndex = guestIndexMap.get(`${draggedAssignment.reservationId}:${draggedAssignment.bedId}`);
            return <GuestCellClone assignment={draggedAssignment} width={overlayWidth} guestIndex={guestIndex} />;
          })()}
          {draggedAssignment && isExtendingOverlay && (
            <div className="bg-indigo-100 border border-indigo-300 text-indigo-800 shadow-xl text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 font-medium">
              {draggedAssignment.guestName}
              <span className="text-indigo-400 text-[10px]">· extending</span>
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
            guestId: livePanelAssignment.guestId,
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
