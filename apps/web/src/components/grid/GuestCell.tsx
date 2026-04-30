"use client";

import { useDraggable, useDroppable } from "@dnd-kit/core";
import React, { useCallback } from "react";
import type { Assignment, CellPosition } from "./BedGrid";
import { formatCompactGuestName, formatStayNights } from "./nameFormat";

// Cell bg/border/text per status
function getCellStyle(status: string) {
  switch (status) {
    case "checked_in":
      return { bg: "bg-[#14b8a6]", border: "border-[#0d9488]/30", text: "text-white" };
    case "confirmed":
      return { bg: "bg-[#d1fae5]", border: "border-[#a7f3d0]", text: "text-[#0f766e]" };
    case "checked_out":
      return { bg: "bg-[#dbeafe]", border: "border-[#93c5fd]", text: "text-[#1d4ed8]" };
    case "no_show":
      return { bg: "bg-[#fee2e2]", border: "border-[#fca5a5]", text: "text-[#b91c1c]" };
    case "cancelled":
      return { bg: "bg-[#f8fafc]", border: "border-[#e2e8f0]", text: "text-[#94a3b8]" };
    default:
      return { bg: "bg-[#ede9fe]", border: "border-[#c4b5fd]", text: "text-[#6d28d9]" };
  }
}

export const GuestCell = React.memo(function GuestCell({
  assignment,
  position,
  isSelected,
  activeReservationId,
  activeDragMode,
  activeDragAssignmentId,
  activeDragBedId,
  guestIndex,
  onSelect,
  onDoubleClick,
}: {
  assignment: Assignment;
  position: CellPosition;
  isSelected: boolean;
  activeReservationId: number | null;
  activeDragMode: "stay" | "night";
  activeDragAssignmentId: number | null;
  activeDragBedId: string | null;
  guestIndex?: number | null;
  onSelect: () => void;
  onDoubleClick?: () => void;
}) {
  // Name cells (start/single) drag the whole stay; continuation cells (middle/end) drag just that night
  const cellDragMode = position === "start" || position === "single" ? "stay" : "night";

  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: `assignment-${assignment.id}`,
      data: { ...assignment, dragMode: cellDragMode },
    });

  // Also register as a drop target so the extend handle can land here (for shrinking)
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `drop-${assignment.bedId}-${assignment.date}`,
    data: { bedId: assignment.bedId, date: assignment.date, type: "guest", reservationId: assignment.reservationId },
  });

  // Is this reservation currently being dragged (any cell of it)?
  // activeReservationId is passed as prop (not from useDndContext) to avoid defeating React.memo
  const isReservationDragged = activeReservationId === assignment.reservationId;
  // Ghost only the cells being moved: stay mode → same bed, night mode → same cell
  const isGhosted = isReservationDragged && (
    (activeDragMode === "stay" && assignment.bedId === activeDragBedId) ||
    assignment.id === activeDragAssignmentId
  );

  // Show red only when hovered by your OWN drag (can't swap with yourself)
  const isSelfConflict = isOver && isReservationDragged;

  // Stable composed ref — avoids infinite unregister/re-register loop
  const composedRef = useCallback(
    (node: HTMLDivElement | null) => { setNodeRef(node); setDropRef(node); },
    [setNodeRef, setDropRef]
  );

  const {
    attributes: extendAttrs,
    listeners: extendListeners,
    setNodeRef: setExtendNodeRef,
    isDragging: isExtending,
  } = useDraggable({
    id: `extend-${assignment.id}`,
    data: { type: "extend", assignment },
  });

  const style = transform && !isExtending
    ? { transform: `translate(${transform.x}px, ${transform.y}px)`, zIndex: 50 }
    : undefined;

  const colors = getCellStyle(assignment.status);
  const displayName = formatCompactGuestName(assignment.guestName, guestIndex);
  const stayNights = formatStayNights(assignment.checkIn, assignment.checkOut);

  // Dim non-active guests slightly
  const dimClass =
    assignment.status === "checked_out" || assignment.status === "no_show"
      ? "opacity-60"
      : "";

  const radiusClass = {
    single: "mx-[1px]",
    start: "ml-[1px] -mr-px",
    middle: "-mx-px",
    end: "mr-[1px] -ml-px",
  }[position];

  const showName = position === "start" || position === "single";

  return (
    <div
      ref={composedRef}
      {...attributes}
      {...listeners}
      style={style}
      className={`relative group h-full flex items-center py-0.5 cursor-grab active:cursor-grabbing ${
        isDragging ? "opacity-0" : isGhosted ? "opacity-25" : dimClass
      }`}
      title={showName ? `${assignment.guestName} · ${assignment.checkIn} → ${assignment.checkOut} · ${assignment.source}` : undefined}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onDoubleClick?.();
      }}
    >
      <div
        className={`w-full h-9 flex items-center ${radiusClass} border-y border-solid border-opacity-80 shadow-none transition-shadow ${
        position === "single" ? "border-x" :
        position === "start" ? "border-l" :
        position === "end" ? "border-r" : ""} ${
          isDragging || isGhosted
            ? "border-transparent bg-transparent"
            : isSelfConflict
              ? "bg-red-950 border-red-500/60"
              : `${colors.bg} ${colors.border} border-solid ${
                  isSelected ? "ring-2 ring-indigo-500 ring-offset-1" : ""
                }`
        }`}
      >
        {/* Guest name */}
        {showName && (
          <span className={`flex min-w-0 flex-1 flex-col px-2 ${colors.text}`}>
            <span className="truncate text-[13px] font-semibold leading-[14px]">{displayName}</span>
            <span className="truncate text-[10px] font-semibold leading-[11px] opacity-75">{stayNights}</span>
          </span>
        )}

        {/* Stretch handle on the right edge */}
        {(position === "end" || position === "single") && (
          <div
            ref={setExtendNodeRef}
            {...extendAttrs}
            {...extendListeners}
            className="absolute right-0 top-0 bottom-0 w-4 cursor-ew-resize hover:bg-black/10 z-10 flex items-center justify-center opacity-10 hover:opacity-100 group-hover:opacity-60 transition-opacity"
            onPointerDown={(e) => {
              // Trigger dnd-kit listeners before stopping propagation
              extendListeners?.onPointerDown?.(e);
              e.stopPropagation();
            }}
          >
            <div className="w-1 h-3 rounded-full bg-white/60" />
          </div>
        )}
      </div>

    </div>
  );
});
