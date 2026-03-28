"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { format } from "date-fns";
import {
  Plus,
  Search,
  X,
  Trash2,
  CheckCircle2,
  CreditCard,
  Shirt,
  Clock,
  Droplets,
  Package,
} from "lucide-react";

interface LaundryOrder {
  id: number;
  guestId: number;
  guestName: string;
  items: string | null;
  weight: number | null;
  price: number;
  currency: string | null;
  paymentStatus: string;
  amountPaid: number | null;
  status: string;
  droppedOffAt: string;
  completedAt: string | null;
}

interface Guest {
  id: number;
  name: string;
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; icon: typeof Clock }> = {
  pending: { label: "Pending", bg: "bg-amber-50", text: "text-amber-700", icon: Clock },
  washing: { label: "Washing", bg: "bg-blue-50", text: "text-blue-700", icon: Droplets },
  done: { label: "Done", bg: "bg-emerald-50", text: "text-emerald-700", icon: CheckCircle2 },
  collected: { label: "Collected", bg: "bg-slate-100", text: "text-slate-600", icon: Package },
};

export default function LaundryPage() {
  const queryClient = useQueryClient();
  const [showAddOrder, setShowAddOrder] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("all");

  const { data: orders = [] } = useQuery<LaundryOrder[]>({
    queryKey: ["laundry"],
    queryFn: () => fetch("/api/laundry").then((r) => r.json()),
  });

  const { data: guests = [] } = useQuery<Guest[]>({
    queryKey: ["guests"],
    queryFn: () => fetch("/api/guests").then((r) => r.json()),
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["laundry"] });
  };

  const createOrderMutation = useMutation({
    mutationFn: (data: { guestId: number; guestName: string; weight?: number; price: number }) =>
      fetch("/api/laundry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => r.json()),
    onSuccess: () => {
      invalidateAll();
      setShowAddOrder(false);
    },
  });

  const updateOrderMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: number; status?: string; paymentStatus?: string; amountPaid?: number }) =>
      fetch(`/api/laundry/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => r.json()),
    onSuccess: invalidateAll,
  });

  const deleteOrderMutation = useMutation({
    mutationFn: (id: number) => fetch(`/api/laundry/${id}`, { method: "DELETE" }).then((r) => r.json()),
    onSuccess: invalidateAll,
  });

  const filtered = orders.filter((o) => {
    const matchSearch = o.guestName.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === "all" || o.status === filter;
    return matchSearch && matchFilter;
  });

  const totalRevenue = orders.reduce((sum, o) => sum + o.price, 0);
  const totalPaid = orders.reduce((sum, o) => sum + (o.amountPaid || 0), 0);
  const pendingCount = orders.filter((o) => o.status === "pending" || o.status === "washing").length;

  return (
    <div className="space-y-5 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Laundry</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {orders.length} orders · {pendingCount} in progress
          </p>
        </div>
        <button
          onClick={() => setShowAddOrder(!showAddOrder)}
          className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 transition-colors shadow-sm"
        >
          <Plus size={16} />
          New Order
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Total Revenue</div>
          <div className="text-xl font-bold text-slate-800 mt-1">VND {totalRevenue.toLocaleString()}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Collected</div>
          <div className="text-xl font-bold text-emerald-600 mt-1">VND {totalPaid.toLocaleString()}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Outstanding</div>
          <div className={`text-xl font-bold mt-1 ${totalRevenue - totalPaid > 0 ? "text-red-600" : "text-slate-400"}`}>
            VND {(totalRevenue - totalPaid).toLocaleString()}
          </div>
        </div>
      </div>

      {/* Add Order Form */}
      {showAddOrder && (
        <AddOrderForm
          guests={guests}
          onSubmit={(data) => createOrderMutation.mutate(data)}
          onCancel={() => setShowAddOrder(false)}
          isLoading={createOrderMutation.isPending}
        />
      )}

      {/* Search & Filter */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by guest name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 shadow-sm"
          />
        </div>
        <div className="flex gap-1 bg-white border border-slate-200 rounded-lg p-1 shadow-sm">
          {["all", "pending", "washing", "done", "collected"].map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors capitalize ${
                filter === s ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-50"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="px-4 py-3 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Guest</th>
              <th className="px-4 py-3 text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Weight</th>
              <th className="px-4 py-3 text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Price</th>
              <th className="px-4 py-3 text-center text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Status</th>
              <th className="px-4 py-3 text-center text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Payment</th>
              <th className="px-4 py-3 text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wider"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filtered.map((order) => {
              const statusCfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending;
              const StatusIcon = statusCfg.icon;
              const nextStatus = order.status === "pending" ? "washing" : order.status === "washing" ? "done" : order.status === "done" ? "collected" : null;

              return (
                <tr key={order.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-3.5">
                    <div className="text-sm font-medium text-slate-800">{order.guestName}</div>
                    <div className="text-[10px] text-slate-400">
                      {order.droppedOffAt && !isNaN(new Date(order.droppedOffAt).getTime())
                        ? format(new Date(order.droppedOffAt), "MMM d, h:mm a")
                        : "—"}
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <div className="text-sm font-medium text-slate-700">{order.weight ? `${order.weight} kg` : "—"}</div>
                  </td>
                  <td className="px-4 py-3.5 text-right text-sm font-medium text-slate-700">
                    {(order.currency || "VND")} {order.price.toLocaleString()}
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    <button
                      onClick={() => {
                        if (nextStatus) {
                          updateOrderMutation.mutate({ id: order.id, status: nextStatus });
                        }
                      }}
                      disabled={!nextStatus}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium ${statusCfg.bg} ${statusCfg.text} ${nextStatus ? "cursor-pointer hover:opacity-80" : "cursor-default"} transition-opacity`}
                      title={nextStatus ? `Click to move to: ${nextStatus}` : "Final status"}
                    >
                      <StatusIcon size={11} />
                      {statusCfg.label}
                    </button>
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    <button
                      onClick={() => {
                        if (order.paymentStatus === "unpaid") {
                          updateOrderMutation.mutate({
                            id: order.id,
                            paymentStatus: "paid",
                            amountPaid: order.price,
                          });
                        } else {
                          updateOrderMutation.mutate({
                            id: order.id,
                            paymentStatus: "unpaid",
                            amountPaid: 0,
                          });
                        }
                      }}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium cursor-pointer transition-colors ${
                        order.paymentStatus === "paid"
                          ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                          : "bg-red-50 text-red-600 hover:bg-red-100"
                      }`}
                    >
                      {order.paymentStatus === "paid" ? (
                        <><CheckCircle2 size={11} /> Paid</>
                      ) : (
                        <><CreditCard size={11} /> Unpaid</>
                      )}
                    </button>
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <button
                      onClick={() => {
                        if (confirm(`Delete laundry order for ${order.guestName}?`)) {
                          deleteOrderMutation.mutate(order.id);
                        }
                      }}
                      className="p-1 rounded hover:bg-red-50 text-slate-300 hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="py-16 text-center">
                  <Shirt size={32} className="text-slate-200 mx-auto mb-3" />
                  <p className="text-sm text-slate-400">{search ? "No orders match" : "No laundry orders yet"}</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Add Order Form ──────────────────────────────────────────────────────────

function AddOrderForm({
  guests,
  onSubmit,
  onCancel,
  isLoading,
}: {
  guests: Guest[];
  onSubmit: (data: { guestId: number; guestName: string; weight?: number; price: number }) => void;
  onCancel: () => void;
  isLoading: boolean;
}) {
  const [form, setForm] = useState({ guestId: "", weight: "", price: "" });
  const selectedGuest = guests.find((g) => g.id === parseInt(form.guestId));

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
          <Shirt size={16} className="text-slate-400" /> New Laundry Order
        </h2>
        <button onClick={onCancel} className="p-1 rounded hover:bg-slate-100 text-slate-400"><X size={16} /></button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="block text-[11px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">Guest</label>
          <select
            value={form.guestId}
            onChange={(e) => setForm({ ...form, guestId: e.target.value })}
            className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10"
          >
            <option value="">Select guest...</option>
            {guests.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">Weight (kg)</label>
          <input
            type="number"
            step="0.1"
            placeholder="2.5"
            value={form.weight}
            onChange={(e) => setForm({ ...form, weight: e.target.value })}
            className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">Price (VND)</label>
          <input
            type="number"
            placeholder="50000"
            value={form.price}
            onChange={(e) => setForm({ ...form, price: e.target.value })}
            className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
          />
        </div>
      </div>
      <div className="flex gap-2 mt-4 pt-4 border-t border-slate-100">
        <button
          onClick={() => {
            if (!selectedGuest || !form.price) return;
            onSubmit({
              guestId: parseInt(form.guestId),
              guestName: selectedGuest.name,
              weight: form.weight ? parseFloat(form.weight) : undefined,
              price: parseFloat(form.price),
            });
          }}
          disabled={isLoading || !form.guestId || !form.price}
          className="px-5 py-2.5 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-colors shadow-sm"
        >
          {isLoading ? "Creating..." : "Create Order"}
        </button>
        <button onClick={onCancel} className="px-5 py-2.5 bg-slate-100 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-200 transition-colors">Cancel</button>
      </div>
    </div>
  );
}
