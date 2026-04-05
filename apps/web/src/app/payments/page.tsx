"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DollarSign, AlertCircle, Download } from "lucide-react";
import { GuestDetailPanel } from "@/components/GuestDetailPanel";

interface Reservation {
  id: number;
  guestId: number;
  guestName: string;
  checkIn: string;
  checkOut: string;
  status: string;
  paymentStatus: string;
  totalPrice: number | null;
  amountPaid: number | null;
  source: string;
  bedId?: string | null;
  numGuests: number;
  roomTypeReq: string;
  currency: string | null;
  externalId?: string | null;
  importedAt: string;
}

export default function PaymentsPage() {
  const queryClient = useQueryClient();
  const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null);
  const [filter, setFilter] = useState<"all" | "unpaid" | "partial">("unpaid");

  const { data: reservations = [] } = useQuery<Reservation[]>({
    queryKey: ["reservations"],
    queryFn: () => fetch("/api/reservations").then(r => r.json()),
  });

  const activeReservations = reservations.filter(r =>
    r.status !== "cancelled" && r.status !== "no_show"
  );

  const unpaid = activeReservations.filter(r => {
    const owed = (r.totalPrice ?? 0) - (r.amountPaid ?? 0);
    if (filter === "unpaid") return r.paymentStatus === "unpaid" && owed > 0;
    if (filter === "partial") return r.paymentStatus === "partial" && owed > 0;
    return owed > 0;
  }).sort((a, b) => {
    const owedA = (a.totalPrice ?? 0) - (a.amountPaid ?? 0);
    const owedB = (b.totalPrice ?? 0) - (b.amountPaid ?? 0);
    return owedB - owedA; // highest debt first
  });

  const totalOutstanding = unpaid.reduce((sum, r) =>
    sum + Math.max(0, (r.totalPrice ?? 0) - (r.amountPaid ?? 0)), 0
  );
  const totalRevenue = activeReservations.reduce((sum, r) => sum + (r.totalPrice ?? 0), 0);
  const totalCollected = activeReservations.reduce((sum, r) => sum + (r.amountPaid ?? 0), 0);

  function handleExportCSV() {
    const headers = ["Guest", "Check-in", "Check-out", "Status", "Total", "Paid", "Owed", "Source"];
    const rows = unpaid.map(r => [
      r.guestName, r.checkIn, r.checkOut, r.status,
      (r.totalPrice ?? 0).toString(), (r.amountPaid ?? 0).toString(),
      Math.max(0, (r.totalPrice ?? 0) - (r.amountPaid ?? 0)).toString(),
      r.source,
    ]);
    const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `outstanding-payments-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
  }

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Payments</h1>
          <p className="text-sm text-slate-500 mt-0.5">Outstanding balances and revenue</p>
        </div>
        <button
          onClick={handleExportCSV}
          className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-200 transition-colors"
        >
          <Download size={14} />
          Export
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Revenue</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">
            {totalRevenue.toLocaleString()} <span className="text-sm font-normal text-slate-400">VND</span>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-emerald-200 p-5">
          <div className="text-xs font-medium text-emerald-600 uppercase tracking-wider">Collected</div>
          <div className="text-2xl font-bold text-emerald-700 mt-1">
            {totalCollected.toLocaleString()} <span className="text-sm font-normal text-emerald-400">VND</span>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-red-200 p-5">
          <div className="text-xs font-medium text-red-600 uppercase tracking-wider">Outstanding</div>
          <div className="text-2xl font-bold text-red-700 mt-1">
            {totalOutstanding.toLocaleString()} <span className="text-sm font-normal text-red-400">VND</span>
          </div>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        {(["all", "unpaid", "partial"] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              filter === f
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {f === "all" ? "All Owed" : f === "unpaid" ? "Unpaid" : "Partial"}
          </button>
        ))}
        <span className="text-xs text-slate-400 self-center ml-2">{unpaid.length} reservations</span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Guest</th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Stay</th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Status</th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total</th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Paid</th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Owed</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {unpaid.map(r => {
              const owed = Math.max(0, (r.totalPrice ?? 0) - (r.amountPaid ?? 0));
              return (
                <tr
                  key={r.id}
                  className="hover:bg-slate-50/50 cursor-pointer transition-colors"
                  onClick={() => setSelectedReservation(r)}
                >
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-slate-800">{r.guestName}</div>
                    {r.bedId && <div className="text-[10px] font-mono text-slate-400">{r.bedId}</div>}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {r.checkIn} → {r.checkOut}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      r.status === "checked_in" ? "bg-emerald-100 text-emerald-700"
                        : r.status === "confirmed" ? "bg-blue-100 text-blue-700"
                        : "bg-slate-100 text-slate-600"
                    }`}>
                      {r.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-slate-600 tabular-nums">
                    {(r.totalPrice ?? 0).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-emerald-600 tabular-nums">
                    {(r.amountPaid ?? 0).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm font-bold text-red-600 tabular-nums">
                      {owed.toLocaleString()}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {unpaid.length === 0 && (
          <div className="text-center py-12 text-slate-400">
            <DollarSign size={24} className="mx-auto mb-2 text-slate-200" />
            <p className="text-sm">All settled up</p>
          </div>
        )}
      </div>

      {selectedReservation && (
        <GuestDetailPanel
          reservation={selectedReservation}
          onClose={() => setSelectedReservation(null)}
        />
      )}
    </div>
  );
}
