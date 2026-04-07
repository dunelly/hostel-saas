"use client";
import React, { useState } from "react";
import { format, isWeekend, isToday } from "date-fns";
import { GuestCell } from "./GuestCell";
import { DroppableCell } from "./DroppableCell";
import type { Assignment, CellPosition } from "./BedGrid";
import type { RoomWithBeds } from "@/types";

// Accent colors for room rows (non-female rooms)
export const ROOM_ACCENT_COLORS = ["#8b5cf6", "#0ea5e9", "#f59e0b", "#10b981", "#f97316", "#6366f1"];

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
