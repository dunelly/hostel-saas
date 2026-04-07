"use client";

import { useDroppable, useDndContext } from "@dnd-kit/core";
import React, { useState } from "react";
import { QuickAddPopover } from "./QuickAddPopover";
import type { Assignment } from "./BedGrid";

export const DroppableCell = React.memo(function DroppableCell({
  bedId,
  date,
  roomType,
}: {
  bedId: string;
  date: string;
  roomType: string;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const { setNodeRef, isOver } = useDroppable({
    id: `cell-${bedId}-${date}`,
    data: { bedId, date },
  });
  const { active, over } = useDndContext();

  const isExtendDrag = active?.data?.current?.type === "extend";
  const extendAssignment = isExtendDrag
    ? (active?.data?.current?.assignment as Assignment)
    : null;
  const hoverDate = isExtendDrag ? (over?.data?.current?.date as string | undefined) : undefined;

  // This cell is in the ghost preview range if:
  // same bed, date >= checkOut (first new night), date <= cursor date
  const inExtendPreview =
    isExtendDrag &&
    extendAssignment?.bedId === bedId &&
    hoverDate !== undefined &&
    date >= extendAssignment!.checkOut &&
    date <= hoverDate;

  let cellClass = "hover:bg-indigo-50/40";
  if (!isExtendDrag && isOver) {
    cellClass =
      "bg-indigo-100 rounded";
  } else if (inExtendPreview) {
    // Ghost block — brighter on the cell under the cursor
    cellClass = isOver ? "bg-indigo-400/70 rounded" : "bg-indigo-200/80 rounded";
  }

  return (
    <div
      ref={setNodeRef}
      className={`relative h-full min-h-[36px] transition-colors cursor-pointer group/empty ${cellClass}`}
      onClick={() => setShowAdd(true)}
    >
      {/* Plus hint on hover (not during extend drags) */}
      {!isOver && !showAdd && !isExtendDrag && (
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/empty:opacity-100 transition-opacity">
          <span className="text-indigo-300 text-sm font-light leading-none">+</span>
        </div>
      )}

      {/* Arrow only on the cursor cell */}
      {isOver && isExtendDrag && inExtendPreview && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-indigo-600 text-xs font-semibold">→</span>
        </div>
      )}

      {showAdd && (
        <QuickAddPopover
          bedId={bedId}
          date={date}
          roomType={roomType}
          onClose={() => setShowAdd(false)}
        />
      )}
    </div>
  );
});
