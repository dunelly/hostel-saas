import { defaultDropAnimationSideEffects } from "@dnd-kit/core";
import type { Assignment } from "./BedGrid";

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
export function GuestCellClone({ assignment, width }: { assignment: Assignment; width?: number }) {
  const sourceBarColors: Record<string, string> = {
    "booking.com": "bg-blue-500",
    hostelworld: "bg-orange-500",
    manual: "bg-emerald-500",
  };
  const barColor = sourceBarColors[assignment.source] || "bg-slate-400";

  const colors = (() => {
    switch (assignment.status) {
      case "checked_in":  return { bg: "bg-emerald-100", border: "border-emerald-300", text: "text-emerald-900" };
      case "confirmed":   return { bg: "bg-blue-100",    border: "border-blue-300",    text: "text-blue-900"    };
      case "checked_out": return { bg: "bg-slate-100",   border: "border-slate-200",   text: "text-slate-400"   };
      case "no_show":     return { bg: "bg-red-100",     border: "border-red-300",     text: "text-red-700"     };
      case "cancelled":   return { bg: "bg-slate-50",    border: "border-slate-200",   text: "text-slate-300"   };
      default:            return { bg: "bg-blue-100",    border: "border-blue-300",    text: "text-blue-900"    };
    }
  })();

  const payDot =
    assignment.status !== "checked_out" &&
    assignment.status !== "cancelled" &&
    assignment.paymentStatus !== "paid" &&
    assignment.paymentStatus !== "refunded"
      ? assignment.paymentStatus === "partial" ? "bg-amber-400" : "bg-red-400"
      : null;

  return (
    <div
      className="h-9 flex items-center py-1 cursor-grabbing opacity-95 drop-shadow-xl"
      style={width ? { width } : { minWidth: 90 }}
    >
      <div
        className={`w-full h-7 flex items-center rounded ml-1 mr-1 ${colors.bg} border ${colors.border} border-solid`}
      >
        <div className={`w-1 h-full ${barColor} opacity-90 rounded-l flex-shrink-0`} />
        <span className={`truncate text-xs font-semibold px-1.5 ${colors.text} flex-1 min-w-0`}>
          {assignment.guestName}
        </span>
        {payDot && (
          <span className={`w-1.5 h-1.5 rounded-full ${payDot} flex-shrink-0 mr-1.5`} />
        )}
      </div>
    </div>
  );
}
