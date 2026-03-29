"use client";

import { useDraggable, useDroppable } from "@dnd-kit/core";
import { useState, useCallback } from "react";
import { createPortal } from "react-dom";
import type { Assignment, CellPosition } from "./BedGrid";

// Source accent bar colors (left stripe)
const SOURCE_BAR: Record<string, string> = {
  "booking.com": "bg-blue-500",
  hostelworld: "bg-orange-500",
  manual: "bg-emerald-500",
};

// Cell bg/border/text per status
function getCellStyle(status: string) {
  switch (status) {
    case "checked_in":
      // Green — guest is here
      return { bg: "bg-emerald-100", border: "border-emerald-300", text: "text-emerald-900" };
    case "confirmed":
      // Blue — arriving today / expected, not yet checked in
      return { bg: "bg-blue-100", border: "border-blue-300", text: "text-blue-900" };
    case "checked_out":
      // Slate — guest has left
      return { bg: "bg-slate-100", border: "border-slate-200", text: "text-slate-400" };
    case "no_show":
      // Red — didn't show
      return { bg: "bg-red-100", border: "border-red-300", text: "text-red-700" };
    case "cancelled":
      // Very muted
      return { bg: "bg-slate-50", border: "border-slate-200", text: "text-slate-300" };
    default:
      return { bg: "bg-blue-100", border: "border-blue-300", text: "text-blue-900" };
  }
}

export function GuestCell({
  assignment,
  position,
  isSelected,
  onSelect,
  onDoubleClick,
}: {
  assignment: Assignment;
  position: CellPosition;
  isSelected: boolean;
  onSelect: () => void;
  onDoubleClick?: () => void;
}) {
  const [tooltipAnchor, setTooltipAnchor] = useState<{ x: number; y: number } | null>(null);
  // Name cells (start/single) drag the whole stay; continuation cells (middle/end) drag just that night
  const cellDragMode = position === "start" || position === "single" ? "stay" : "night";

  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: `assignment-${assignment.id}`,
      data: { ...assignment, dragMode: cellDragMode },
    });

  // Also register as a drop target so the extend handle can land here (for shrinking)
  const { setNodeRef: setDropRef } = useDroppable({
    id: `drop-${assignment.bedId}-${assignment.date}`,
    data: { bedId: assignment.bedId, date: assignment.date, type: "guest" },
  });

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
  const barColor = SOURCE_BAR[assignment.source] || "bg-slate-400";

  // Dashed border for "confirmed" (expected, not yet arrived)
  const borderStyle = assignment.status === "confirmed" ? "border-dashed" : "border-solid";

  // Dim non-active guests slightly
  const dimClass =
    assignment.status === "checked_out" || assignment.status === "no_show"
      ? "opacity-60"
      : assignment.status === "confirmed"
        ? "opacity-85"
        : "";

  const barOpacity =
    assignment.status === "checked_in" ? "opacity-90" : "opacity-40";

  const radiusClass = {
    single: "rounded mx-1",
    start: "rounded-l ml-1 -mr-px",
    middle: "-mx-px",
    end: "rounded-r mr-1 -ml-px",
  }[position];

  const showName = position === "start" || position === "single";

  // Unpaid/partial indicator dot
  const payDot =
    assignment.status !== "checked_out" &&
    assignment.status !== "cancelled" &&
    assignment.paymentStatus !== "paid" &&
    assignment.paymentStatus !== "refunded"
      ? assignment.paymentStatus === "partial"
        ? "bg-amber-400"
        : "bg-red-400"
      : null;

  return (
    <div
      ref={composedRef}
      {...attributes}
      {...listeners}
      style={style}
      className={`relative group h-full flex items-center py-1 cursor-grab active:cursor-grabbing ${
        isDragging || isExtending ? "opacity-30" : dimClass
      }`}
      onMouseEnter={(e) => {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const x = Math.min(Math.max(rect.left + rect.width / 2, 115), window.innerWidth - 115);
        setTooltipAnchor({ x, y: rect.top });
      }}
      onMouseLeave={() => setTooltipAnchor(null)}
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
        className={`w-full h-7 flex items-center ${radiusClass} ${colors.bg} border ${colors.border} ${borderStyle} ${
          isSelected
            ? "ring-2 ring-indigo-500 ring-offset-1"
            : assignment.isManual
              ? "ring-1 ring-amber-400"
              : ""
        } transition-shadow`}
      >
        {/* Source accent bar */}
        {(position === "start" || position === "single") && (
          <div
            className={`w-1 h-full ${barColor} ${barOpacity} rounded-l flex-shrink-0`}
          />
        )}

        {/* Guest name */}
        {showName && (
          <span
            className={`truncate text-xs font-semibold px-1.5 ${colors.text} flex-1 min-w-0`}
          >
            {assignment.guestName}
          </span>
        )}

        {/* Unpaid indicator dot */}
        {showName && payDot && (
          <span
            className={`w-1.5 h-1.5 rounded-full ${payDot} flex-shrink-0 mr-1.5`}
            title={assignment.paymentStatus}
          />
        )}

        {/* Stretch handle on the right edge */}
        {(position === "end" || position === "single") && (
          <div
            ref={setExtendNodeRef}
            {...extendAttrs}
            {...extendListeners}
            className="absolute right-0 top-0 bottom-0 w-4 cursor-ew-resize hover:bg-black/10 z-10 rounded-r flex items-center justify-center opacity-20 hover:opacity-100 group-hover:opacity-80 transition-opacity"
            onPointerDown={(e) => {
              // Trigger dnd-kit listeners before stopping propagation
              extendListeners?.onPointerDown?.(e as any);
              e.stopPropagation();
            }}
          >
            <div className="w-1 h-3 rounded-full bg-slate-400/50" />
          </div>
        )}
      </div>

      {/* Tooltip — portalled to body to escape table overflow/stacking contexts */}
      {tooltipAnchor && createPortal(
        <div
          className="pointer-events-none"
          style={{
            position: "fixed",
            left: tooltipAnchor.x,
            top: tooltipAnchor.y - 8,
            transform: "translate(-50%, -100%)",
            zIndex: 9999,
          }}
        >
          <div className="relative bg-slate-900 text-white text-[11px] rounded-lg px-3 py-2.5 shadow-xl whitespace-nowrap min-w-[170px]">
            <div className="font-semibold text-xs mb-1.5">{assignment.guestName}</div>
            <div className="space-y-1 text-slate-300">
              <TRow label="Dates" value={`${assignment.checkIn} → ${assignment.checkOut}`} />
              <TRow
                label="Status"
                value={
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                      assignment.status === "checked_in"
                        ? "bg-emerald-700 text-emerald-100"
                        : assignment.status === "checked_out"
                          ? "bg-slate-600 text-slate-200"
                          : assignment.status === "no_show"
                            ? "bg-red-800 text-red-100"
                            : "bg-indigo-700 text-indigo-200"
                    }`}
                  >
                    {assignment.status === "checked_in"
                      ? "Checked In"
                      : assignment.status === "checked_out"
                        ? "Checked Out"
                        : assignment.status === "no_show"
                          ? "No Show"
                          : "Expected"}
                  </span>
                }
              />
              <TRow
                label="Payment"
                value={
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                      assignment.paymentStatus === "paid"
                        ? "bg-emerald-700 text-emerald-100"
                        : assignment.paymentStatus === "partial"
                          ? "bg-amber-700 text-amber-100"
                          : "bg-red-800 text-red-100"
                    }`}
                  >
                    {assignment.paymentStatus}
                  </span>
                }
              />
              <TRow label="Source" value={assignment.source} />
              <TRow label="Bed" value={assignment.bedId} />
              {assignment.isManual ? (
                <div className="text-amber-300 text-[10px] mt-1 pt-1 border-t border-slate-700">
                  ✋ Manually assigned
                </div>
              ) : null}
            </div>
            <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px">
              <div className="w-2 h-2 bg-slate-900 rotate-45" />
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function TRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-slate-500 w-14 shrink-0 text-[10px]">{label}</span>
      <span>{value}</span>
    </div>
  );
}
