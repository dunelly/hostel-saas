import { useState, useCallback, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format, addDays, parseISO } from "date-fns";
import type { DragStartEvent, DragEndEvent } from "@dnd-kit/core";
import { useToast } from "@/components/Toast";
import type { Assignment } from "./BedGrid";

type UndoEntry =
  | { type: "move"; reservationId: number; fromBedId: string; singleDate?: string }
  | { type: "extend"; reservationId: number; oldCheckOut: string; bedId: string };

interface UseBedGridDragOptions {
  assignments: Assignment[];
  fromStr: string;
  toStr: string;
}

export function useBedGridDrag({ assignments, fromStr, toStr }: UseBedGridDragOptions) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [draggedAssignment, setDraggedAssignment] = useState<Assignment | null>(null);
  const [dragCellWidth, setDragCellWidth] = useState<number | null>(null);
  const [isExtendingOverlay, setIsExtendingOverlay] = useState(false);
  const [dragMode, setDragMode] = useState<"stay" | "night">("stay");
  const [dragBedDates, setDragBedDates] = useState<string[]>([]);
  const [undoHistory, setUndoHistory] = useState<UndoEntry[]>([]);

  const pushUndo = useCallback((entry: UndoEntry) => {
    setUndoHistory((prev) => [...prev.slice(-9), entry]);
  }, []);

  const moveMutation = useMutation({
    mutationFn: (data: { reservationId: number; newBedId: string; fromBedId?: string; singleDate?: string }) =>
      fetch("/api/assignments/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => {
        if (!r.ok) return r.json().then((err) => { throw new Error(err.error || "Failed to move"); });
        return r.json();
      }),
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: ["assignments"] });
      const qk = ["assignments", fromStr, toStr];
      const prev = queryClient.getQueryData<Assignment[]>(qk);
      queryClient.setQueryData<Assignment[]>(qk, (old = []) =>
        old.map(a => {
          if (a.reservationId !== data.reservationId) return a;
          if (data.fromBedId && a.bedId !== data.fromBedId) return a;
          if (data.singleDate && a.date !== data.singleDate) return a;
          return { ...a, bedId: data.newBedId };
        })
      );
      return { prev, qk };
    },
    onError: (_err, _data, ctx: any) => {
      if (ctx?.prev) queryClient.setQueryData(ctx.qk, ctx.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["assignments"] }),
  });

  const swapMutation = useMutation({
    mutationFn: (data: { reservationIdA: number; reservationIdB: number; bedIdA: string; bedIdB: string; singleDate?: string }) =>
      fetch("/api/assignments/swap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => {
        if (!r.ok) return r.json().then((err) => { throw new Error(err.error || "Failed to swap"); });
        return r.json();
      }),
  });

  const extendMutation = useMutation({
    mutationFn: (data: { reservationId: number; newCheckOut: string; targetBedId: string }) =>
      fetch("/api/assignments/extend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => {
        if (!r.ok) return r.json().then((err) => { throw new Error(err.error || "Failed to extend"); });
        return r.json();
      }),
  });

  const statusMutation = useMutation({
    mutationFn: (data: { reservationId: number; status?: string; paymentStatus?: string }) =>
      fetch(`/api/reservations/${data.reservationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: data.status, paymentStatus: data.paymentStatus }),
      }).then((r) => {
        if (!r.ok) return r.json().then((err) => { throw new Error(err.error || "Failed to update"); });
        return r.json();
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["assignments"] }),
  });

  const performUndo = useCallback(() => {
    setUndoHistory((prev) => {
      const entry = prev[prev.length - 1];
      if (!entry) return prev;
      if (entry.type === "move") {
        moveMutation.mutate(
          { reservationId: entry.reservationId, newBedId: entry.fromBedId, singleDate: entry.singleDate },
          {
            onSuccess: () => queryClient.invalidateQueries({ queryKey: ["assignments"] }),
            onError: (err: Error) => toast(err.message, "error"),
          }
        );
      } else {
        extendMutation.mutate(
          { reservationId: entry.reservationId, newCheckOut: entry.oldCheckOut, targetBedId: entry.bedId },
          {
            onSuccess: () => queryClient.invalidateQueries({ queryKey: ["assignments"] }),
            onError: (err: Error) => toast(err.message, "error"),
          }
        );
      }
      return prev.slice(0, -1);
    });
  }, [moveMutation, extendMutation, queryClient, toast]);

  // Cmd/Ctrl+Z → undo
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        performUndo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [performUndo]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current;
    // Measure a date column header — reliable way to get actual rendered column width
    const dateHeader = document.querySelector("thead th:nth-child(2)");
    const cellW = dateHeader ? dateHeader.getBoundingClientRect().width : null;
    setDragCellWidth(cellW);
    if (data?.type === "extend") {
      setDraggedAssignment(data.assignment);
      setIsExtendingOverlay(true);
    } else if (data) {
      const a = data as Assignment;
      setDraggedAssignment(a);
      setIsExtendingOverlay(false);
      if (data.dragMode) setDragMode(data.dragMode as "stay" | "night");
      // Compute bed-specific dates for this reservation segment
      const bedDates = assignments
        .filter(x => x.reservationId === a.reservationId && x.bedId === a.bedId && x.status !== "cancelled" && x.status !== "no_show")
        .map(x => x.date)
        .sort();
      setDragBedDates(bedDates);
    }
  }, [assignments]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setDraggedAssignment(null);
    setDragCellWidth(null);
    setIsExtendingOverlay(false);
    setDragBedDates([]);

    if (!event.over || !event.active.data.current) return;

    const targetBedId = event.over.data.current?.bedId as string;
    const targetDate = event.over.data.current?.date as string;
    if (!targetBedId || !targetDate) return;

    // Extend drag — must stay on same bed
    if (event.active.data.current.type === "extend") {
      const assignment = event.active.data.current.assignment as Assignment;
      if (targetBedId !== assignment.bedId) {
        toast("Can only extend on the same bed", "error");
        return;
      }

      const newCheckOut = format(addDays(parseISO(targetDate), 1), "yyyy-MM-dd");
      if (newCheckOut === assignment.checkOut) return; // no change

      if (newCheckOut <= assignment.checkIn) {
        toast("Must keep at least one night", "error");
        return;
      }

      const extending = newCheckOut > assignment.checkOut;
      const oldCheckOut = assignment.checkOut;
      extendMutation.mutate(
        { reservationId: assignment.reservationId, newCheckOut, targetBedId },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["assignments"] });
            pushUndo({ type: "extend", reservationId: assignment.reservationId, oldCheckOut, bedId: assignment.bedId });
            toast(extending ? "Stay extended" : "Stay shortened", "success");
          },
          onError: (error: Error) => toast(error.message, "error"),
        }
      );
      return;
    }

    // Normal move or swap
    const actData = event.active.data.current as Assignment & { dragMode?: "stay" | "night" };
    if (targetBedId === actData.bedId) return;

    // Swap: dragging onto an occupied cell
    if (event.over.data.current?.type === "guest") {
      const targetReservationId = event.over.data.current.reservationId as number;
      if (targetReservationId === actData.reservationId) return;

      const effectiveDragMode = actData.dragMode ?? dragMode;
      swapMutation.mutate(
        {
          reservationIdA: actData.reservationId,
          reservationIdB: targetReservationId,
          bedIdA: actData.bedId,
          bedIdB: targetBedId,
          singleDate: effectiveDragMode === "night" ? actData.date : undefined,
        },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["assignments"] });
            toast("Guests swapped", "success");
          },
          onError: (error: Error) => toast(error.message, "error"),
        }
      );
      return;
    }

    const originalBedId = actData.bedId;
    const effectiveDragMode = actData.dragMode ?? dragMode;
    const moveData = {
      reservationId: actData.reservationId,
      newBedId: targetBedId,
      fromBedId: actData.bedId,
      singleDate: effectiveDragMode === "night" ? actData.date : undefined,
    };

    moveMutation.mutate(moveData, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["assignments"] });
        pushUndo({ type: "move", reservationId: actData.reservationId, fromBedId: originalBedId, singleDate: moveData.singleDate });
        toast("Guest moved", "success");
      },
      onError: (error: Error) => {
        // Check if the conflicting date is before the visible grid range
        const dateMatch = error.message.match(/(\d{4}-\d{2}-\d{2})$/);
        if (dateMatch && dateMatch[1] < fromStr) {
          const conflictDate = format(parseISO(dateMatch[1]), "MMM d");
          toast(`${error.message} (not visible — navigate back to ${conflictDate})`, "error");
        } else {
          toast(error.message, "error");
        }
      },
    });
  }, [assignments, dragMode, extendMutation, fromStr, moveMutation, pushUndo, queryClient, swapMutation, toast]);

  return {
    draggedAssignment,
    dragCellWidth,
    isExtendingOverlay,
    dragMode,
    dragBedDates,
    undoHistory,
    performUndo,
    handleDragStart,
    handleDragEnd,
    statusMutation,
  };
}
