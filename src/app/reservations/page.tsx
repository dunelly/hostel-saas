"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { format } from "date-fns";
import { GuestDetailPanel } from "@/components/GuestDetailPanel";
import {
  Plus,
  Search,
  UserPlus,
  X,
  CalendarDays,
  Users,
  BedDouble,
  Hash,
} from "lucide-react";

interface Reservation {
  id: number;
  externalId: string | null;
  source: string;
  guestId: number;
  guestName: string;
  checkIn: string;
  checkOut: string;
  roomTypeReq: string;
  numGuests: number;
  totalPrice: number | null;
  currency: string | null;
  paymentStatus: string;
  amountPaid: number | null;
  status: string;
  importedAt: string;
}

export default function ReservationsPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedReservation, setSelectedReservation] =
    useState<Reservation | null>(null);

  const resetMutation = useMutation({
    mutationFn: () =>
      fetch("/api/reset", { method: "DELETE" }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
      queryClient.invalidateQueries({ queryKey: ["assignments"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
    },
  });

  const { data: reservations = [], isLoading } = useQuery<Reservation[]>({
    queryKey: ["reservations"],
    queryFn: () => fetch("/api/reservations").then((r) => r.json()),
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      ...data
    }: {
      id: number;
      paymentStatus?: string;
      status?: string;
    }) =>
      fetch(`/api/reservations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: {
      guestName: string;
      checkIn: string;
      checkOut: string;
      roomTypeReq: string;
      numGuests: number;
    }) =>
      fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
      queryClient.invalidateQueries({ queryKey: ["assignments"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      setShowForm(false);
    },
  });

  const filtered = reservations.filter((r) =>
    r.guestName.toLowerCase().includes(search.toLowerCase())
  );

  const sourceConfig: Record<
    string,
    { dot: string; bg: string; text: string; label: string }
  > = {
    "booking.com": {
      dot: "bg-blue-400",
      bg: "bg-blue-50",
      text: "text-blue-700",
      label: "Booking.com",
    },
    hostelworld: {
      dot: "bg-orange-400",
      bg: "bg-orange-50",
      text: "text-orange-700",
      label: "Hostelworld",
    },
    manual: {
      dot: "bg-emerald-400",
      bg: "bg-emerald-50",
      text: "text-emerald-700",
      label: "Walk-in",
    },
  };

  const statusConfig: Record<
    string,
    { bg: string; text: string; label: string }
  > = {
    confirmed: {
      bg: "bg-emerald-50",
      text: "text-emerald-700",
      label: "Confirmed",
    },
    cancelled: { bg: "bg-red-50", text: "text-red-700", label: "Cancelled" },
    checked_in: {
      bg: "bg-indigo-50",
      text: "text-indigo-700",
      label: "Checked In",
    },
    checked_out: {
      bg: "bg-slate-100",
      text: "text-slate-600",
      label: "Checked Out",
    },
    no_show: {
      bg: "bg-amber-50",
      text: "text-amber-700",
      label: "No Show",
    },
  };

  const paymentConfig: Record<
    string,
    { bg: string; text: string; label: string; icon: string }
  > = {
    paid: {
      bg: "bg-emerald-50",
      text: "text-emerald-700",
      label: "Paid",
      icon: "text-emerald-500",
    },
    unpaid: {
      bg: "bg-red-50",
      text: "text-red-600",
      label: "Unpaid",
      icon: "text-red-400",
    },
    partial: {
      bg: "bg-amber-50",
      text: "text-amber-700",
      label: "Partial",
      icon: "text-amber-500",
    },
    refunded: {
      bg: "bg-slate-100",
      text: "text-slate-600",
      label: "Refunded",
      icon: "text-slate-400",
    },
  };

  return (
    <div className="space-y-5 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Reservations</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {reservations.length} total reservations
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (confirm("Clear ALL reservations, guests, and bed assignments? This cannot be undone.")) {
                resetMutation.mutate();
              }
            }}
            disabled={resetMutation.isPending}
            className="flex items-center gap-2 px-4 py-2.5 bg-red-50 text-red-600 text-sm font-medium rounded-lg hover:bg-red-100 border border-red-200 transition-colors shadow-sm disabled:opacity-50"
          >
            {resetMutation.isPending ? "Clearing..." : "Clear All Data"}
          </button>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 transition-colors shadow-sm"
          >
            <UserPlus size={16} />
            Add Walk-in
          </button>
        </div>
      </div>

      {/* Add Form */}
      {showForm && (
        <ManualEntryForm
          onSubmit={(data) => createMutation.mutate(data)}
          onCancel={() => setShowForm(false)}
          isLoading={createMutation.isPending}
        />
      )}

      {/* Search & Filter Bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="text"
            placeholder="Search by guest name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 shadow-sm transition-shadow"
          />
        </div>
        <div className="text-xs text-slate-400">
          {filtered.length} of {reservations.length} shown
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Guest
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Dates
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Room Type
              </th>
              <th className="px-4 py-3 text-center text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Guests
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Source
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Payment
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filtered.map((r) => {
              const source =
                sourceConfig[r.source] || sourceConfig.manual;
              const status =
                statusConfig[r.status] || statusConfig.confirmed;

              // Calculate nights
              const nights = Math.max(
                1,
                Math.round(
                  (new Date(r.checkOut).getTime() -
                    new Date(r.checkIn).getTime()) /
                    86400000
                )
              );

              return (
                <tr
                  key={r.id}
                  onClick={() => setSelectedReservation(r)}
                  className="hover:bg-slate-50/50 transition-colors cursor-pointer"
                >
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-semibold text-slate-500">
                        {r.guestName
                          .split(" ")
                          .map((n) => n[0])
                          .slice(0, 2)
                          .join("")
                          .toUpperCase()}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-slate-900">
                          {r.guestName}
                        </div>
                        {r.externalId && (
                          <div className="text-[10px] text-slate-400 font-mono">
                            #{r.externalId}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="text-sm text-slate-800">
                      {format(new Date(r.checkIn + "T00:00:00"), "MMM d")} →{" "}
                      {format(new Date(r.checkOut + "T00:00:00"), "MMM d")}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {nights} night{nights > 1 ? "s" : ""}
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <span
                      className={`inline-flex items-center gap-1.5 text-xs font-medium capitalize ${
                        r.roomTypeReq === "female"
                          ? "text-pink-600"
                          : "text-slate-600"
                      }`}
                    >
                      <BedDouble size={12} />
                      {r.roomTypeReq} dorm
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    <span className="text-sm text-slate-700 font-medium">
                      {r.numGuests}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium ${source.bg} ${source.text}`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${source.dot}`}
                      />
                      {source.label}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    {(() => {
                      const payment =
                        paymentConfig[r.paymentStatus] ||
                        paymentConfig.unpaid;
                      return (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            // Cycle through: unpaid -> paid -> partial -> unpaid
                            const next =
                              r.paymentStatus === "unpaid"
                                ? "paid"
                                : r.paymentStatus === "paid"
                                  ? "partial"
                                  : "unpaid";
                            updateMutation.mutate({
                              id: r.id,
                              paymentStatus: next,
                            });
                          }}
                          className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium ${payment.bg} ${payment.text} hover:opacity-80 transition-opacity cursor-pointer`}
                          title="Click to change payment status"
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              r.paymentStatus === "paid"
                                ? "bg-emerald-500"
                                : r.paymentStatus === "partial"
                                  ? "bg-amber-500"
                                  : "bg-red-400"
                            }`}
                          />
                          {payment.label}
                        </button>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3.5">
                    <span
                      className={`inline-flex items-center px-2 py-1 rounded-md text-[11px] font-medium ${status.bg} ${status.text}`}
                    >
                      {status.label}
                    </span>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="py-16 text-center">
                  <Users size={32} className="text-slate-200 mx-auto mb-3" />
                  <p className="text-sm text-slate-400">
                    {search
                      ? "No guests match your search"
                      : "No reservations yet"}
                  </p>
                  <p className="text-xs text-slate-300 mt-1">
                    {search
                      ? "Try a different search term"
                      : "Import from Booking.com or add a walk-in"}
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Guest Detail Panel */}
      {selectedReservation && (
        <GuestDetailPanel
          reservation={selectedReservation}
          onClose={() => setSelectedReservation(null)}
        />
      )}
    </div>
  );
}

function ManualEntryForm({
  onSubmit,
  onCancel,
  isLoading,
}: {
  onSubmit: (data: {
    guestName: string;
    checkIn: string;
    checkOut: string;
    roomTypeReq: string;
    numGuests: number;
  }) => void;
  onCancel: () => void;
  isLoading: boolean;
}) {
  const [form, setForm] = useState({
    guestName: "",
    checkIn: format(new Date(), "yyyy-MM-dd"),
    checkOut: "",
    roomTypeReq: "mixed",
    numGuests: 1,
  });

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
          <UserPlus size={16} className="text-slate-400" />
          New Walk-in Reservation
        </h2>
        <button
          onClick={onCancel}
          className="p-1 rounded hover:bg-slate-100 text-slate-400"
        >
          <X size={16} />
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
        <div className="md:col-span-2">
          <label className="block text-[11px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">
            Guest Name
          </label>
          <input
            type="text"
            placeholder="Full name"
            value={form.guestName}
            onChange={(e) => setForm({ ...form, guestName: e.target.value })}
            className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
            autoFocus
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">
            Check-in
          </label>
          <input
            type="date"
            value={form.checkIn}
            onChange={(e) => setForm({ ...form, checkIn: e.target.value })}
            className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">
            Check-out
          </label>
          <input
            type="date"
            value={form.checkOut}
            onChange={(e) => setForm({ ...form, checkOut: e.target.value })}
            className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">
            Room Type
          </label>
          <select
            value={form.roomTypeReq}
            onChange={(e) => setForm({ ...form, roomTypeReq: e.target.value })}
            className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 bg-white"
          >
            <option value="mixed">Mixed Dorm</option>
            <option value="female">Female Dorm</option>
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">
            Guests
          </label>
          <input
            type="number"
            min={1}
            max={10}
            value={form.numGuests}
            onChange={(e) =>
              setForm({ ...form, numGuests: parseInt(e.target.value) || 1 })
            }
            className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
          />
        </div>
      </div>
      <div className="flex gap-2 mt-4 pt-4 border-t border-slate-100">
        <button
          onClick={() => onSubmit(form)}
          disabled={isLoading || !form.guestName || !form.checkOut}
          className="px-5 py-2.5 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-colors shadow-sm"
        >
          {isLoading ? "Creating..." : "Create Reservation"}
        </button>
        <button
          onClick={onCancel}
          className="px-5 py-2.5 bg-slate-100 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-200 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
