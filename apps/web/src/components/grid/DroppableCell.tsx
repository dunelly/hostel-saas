"use client";

import { useDroppable } from "@dnd-kit/core";
import { useState } from "react";
import { QuickAddPopover } from "./QuickAddPopover";

export function DroppableCell({
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

  return (
    <div
      ref={setNodeRef}
      className={`relative h-full min-h-[36px] transition-colors cursor-pointer group/empty ${
        isOver
          ? "bg-indigo-100/60 outline-2 outline-dashed outline-indigo-400 outline-offset-[-2px] rounded"
          : "hover:bg-indigo-50/40"
      }`}
      onClick={() => setShowAdd(true)}
    >
      {/* Plus hint on hover */}
      {!isOver && !showAdd && (
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/empty:opacity-100 transition-opacity">
          <span className="text-indigo-300 text-sm font-light leading-none">+</span>
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
}
