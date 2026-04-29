"use client";
import React, { useState } from "react";
import { format, isWeekend, isToday } from "date-fns";
import { GuestCell } from "./GuestCell";
import { DroppableCell } from "./DroppableCell";
import type { Assignment, CellPosition } from "./BedGrid";
import type { RoomWithBeds } from "@/types";

function getRoomSubtitle(room: RoomWithBeds) {
  if (room.roomType === "female") return `${room.capacity} Bed Female Dorm`;
  return `${room.capacity} Bed Mixed Dorm`;
}

const ROOM_ACCENT_COLORS = ["#008378", "#6d5dfc", "#38bdf8", "#565e74"];

export const RoomRows = React.memo(function RoomRows({
  room,
  dates,
  assignmentMap,
  cellPositionMap,
  guestIndexMap,
  selectedReservation,
  onSelectReservation,
  onOpenPanel,
  colorIndex,
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
  guestIndexMap: Map<string, number>;
  selectedReservation: number | null;
  onSelectReservation: (id: number | null) => void;
  onOpenPanel: (assignment: Assignment) => void;
  colorIndex: number;
  activeReservationId: number | null;
  activeDragMode: "stay" | "night";
  activeDragAssignmentId: number | null;
  activeDragBedId: string | null;
  dragBedDates: string[];
}) {
  const [collapsed, setCollapsed] = useState(false);
  const accentColor = room.roomType === "female"
    ? "#b61718"
    : ROOM_ACCENT_COLORS[colorIndex % ROOM_ACCENT_COLORS.length];
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const todayOccupied = room.beds.filter((bed) =>
    assignmentMap.has(`${bed.id}:${todayStr}`)
  ).length;

  return (
    <>
      <tr
        className="cursor-pointer select-none group"
        onClick={() => setCollapsed(!collapsed)}
      >
        <td
          className="sticky left-0 z-10 border-b border-r border-slate-200 bg-slate-50 px-4 py-2"
          style={{ borderLeft: `4px solid ${accentColor}` }}
          colSpan={dates.length + 1}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <span
                className={`text-[10px] text-slate-500 transition-transform duration-200 ${collapsed ? "" : "rotate-90"} inline-block`}
              >
                ▶
              </span>
              <span className="truncate text-sm font-extrabold tracking-tight text-slate-800">
                {room.name}
              </span>
              {room.roomType === "female" && (
                <span className="rounded bg-red-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-red-700">
                  Female Only
                </span>
              )}
              <span className="text-[11px] font-semibold text-slate-500">
                {room.capacity} beds
              </span>
            </div>
            <span className="text-[11px] font-semibold text-slate-500">
              {todayOccupied}/{room.capacity} occupied
            </span>
          </div>
        </td>
      </tr>

      {/* Bed rows */}
      {!collapsed && room.beds.map((bed) => (
          <tr key={bed.id} data-bed-id={bed.id} className="group/row">
            <td
              className="sticky left-0 z-10 border-b border-r border-slate-200 bg-white px-4 py-0"
            >
              <div className="flex items-center justify-between gap-3 py-1.5">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium tracking-tight text-slate-600">
                    Bed {bed.bedNumber}
                  </div>
                </div>
              </div>
            </td>
            {dates.map((date) => {
              const dateStr = format(date, "yyyy-MM-dd");
              const assignment = assignmentMap.get(`${bed.id}:${dateStr}`);
              const cellPosition = cellPositionMap.get(`${bed.id}:${dateStr}`);
              const guestIndex = assignment ? guestIndexMap.get(`${assignment.reservationId}:${assignment.bedId}`) : null;
              const weekend = isWeekend(date);
              const today = isToday(date);

              return (
                <td
                  key={dateStr}
                  className={`border-b border-slate-100 p-0 h-11 ${
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
                      activeReservationId={activeReservationId}
                      activeDragMode={activeDragMode}
                      activeDragAssignmentId={activeDragAssignmentId}
                      activeDragBedId={activeDragBedId}
                      guestIndex={guestIndex}
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
              <td key={di} className="border-b border-slate-100 p-0 h-9">
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
