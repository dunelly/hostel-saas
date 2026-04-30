import { defaultDropAnimationSideEffects } from "@dnd-kit/core";
import type { Assignment } from "./BedGrid";
import { formatCompactGuestName, formatStayNights } from "./nameFormat";

export const dropAnimationConfig = {
  duration: 180,
  easing: "cubic-bezier(0.2, 0, 0, 1)",
  sideEffects: defaultDropAnimationSideEffects({
    styles: {
      active: { opacity: "0" },
    },
  }),
};

// Pure visual clone of a GuestCell for the DragOverlay
export function GuestCellClone({ assignment, width, guestIndex }: { assignment: Assignment; width?: number; guestIndex?: number | null }) {
  const displayName = formatCompactGuestName(assignment.guestName, guestIndex);
  const stayNights = formatStayNights(assignment.checkIn, assignment.checkOut);
  const colors = (() => {
    switch (assignment.status) {
      case "checked_in":  return { bg: "bg-[#14b8a6]", border: "border-[#0d9488]/30", text: "text-white" };
      case "confirmed":   return { bg: "bg-[#d1fae5]", border: "border-[#a7f3d0]", text: "text-[#0f766e]" };
      case "checked_out": return { bg: "bg-[#dbeafe]", border: "border-[#93c5fd]", text: "text-[#1d4ed8]" };
      case "no_show":     return { bg: "bg-[#fee2e2]", border: "border-[#fca5a5]", text: "text-[#b91c1c]" };
      case "cancelled":   return { bg: "bg-[#f8fafc]", border: "border-[#e2e8f0]", text: "text-[#94a3b8]" };
      default:            return { bg: "bg-[#ede9fe]", border: "border-[#c4b5fd]", text: "text-[#6d28d9]" };
    }
  })();

  return (
    <div
      className="h-9 flex items-center cursor-grabbing opacity-95 drop-shadow-xl"
      style={width ? { width } : { minWidth: 90 }}
    >
      <div
        className={`w-full h-9 flex items-center rounded-sm mx-0 ${colors.bg} border ${colors.border} border-solid`}
      >
        <span className={`flex min-w-0 flex-1 flex-col px-2 ${colors.text}`}>
          <span className="truncate text-[13px] font-semibold leading-[14px]">{displayName}</span>
          <span className="truncate text-[9px] font-semibold leading-[10px] opacity-75">{stayNights}</span>
        </span>
      </div>
    </div>
  );
}
