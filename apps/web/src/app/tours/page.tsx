"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { format } from "date-fns";
import {
  Plus,
  Search,
  MapPin,
  Users,
  X,
  ChevronDown,
  ChevronUp,
  Trash2,
  CheckCircle2,
  CreditCard,
  UserPlus,
} from "lucide-react";
import { useLang } from "@/contexts/LanguageContext";

interface Tour {
  id: number;
  name: string;
  description: string | null;
  price: number;
  currency: string | null;
  date: string | null;
  createdAt: string;
}

interface TourSignup {
  id: number;
  tourId: number;
  guestId: number;
  guestName: string;
  numPeople: number;
  totalPrice: number;
  currency: string | null;
  paymentStatus: string;
  amountPaid: number | null;
  notes: string | null;
  signedUpAt: string;
}

interface Guest {
  id: number;
  name: string;
}

export default function ToursPage() {
  const queryClient = useQueryClient();
  const { t } = useLang();
  const [showAddTour, setShowAddTour] = useState(false);
  const [expandedTour, setExpandedTour] = useState<number | null>(null);
  const [showAddSignup, setShowAddSignup] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  const { data: tours = [] } = useQuery<Tour[]>({
    queryKey: ["tours"],
    queryFn: () => fetch("/api/tours").then((r) => r.json()),
  });

  const { data: allSignups = [] } = useQuery<TourSignup[]>({
    queryKey: ["tour-signups"],
    queryFn: () => fetch("/api/tour-signups").then((r) => r.json()),
  });

  const { data: guests = [] } = useQuery<Guest[]>({
    queryKey: ["guests"],
    queryFn: () => fetch("/api/guests").then((r) => r.json()),
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["tours"] });
    queryClient.invalidateQueries({ queryKey: ["tour-signups"] });
    queryClient.invalidateQueries({ queryKey: ["guest-profile"] });
  };

  const createTourMutation = useMutation({
    mutationFn: (data: { name: string; price: number; description?: string; date?: string }) =>
      fetch("/api/tours", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => r.json()),
    onSuccess: () => {
      invalidateAll();
      setShowAddTour(false);
    },
  });

  const deleteTourMutation = useMutation({
    mutationFn: (id: number) => fetch(`/api/tours/${id}`, { method: "DELETE" }).then((r) => r.json()),
    onSuccess: invalidateAll,
  });

  const addSignupMutation = useMutation({
    mutationFn: (data: { tourId: number; guestId: number; guestName: string; numPeople: number; notes?: string }) =>
      fetch("/api/tour-signups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => r.json()),
    onSuccess: () => {
      invalidateAll();
      setShowAddSignup(null);
    },
  });

  const updateSignupMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: number; paymentStatus?: string; amountPaid?: number }) =>
      fetch(`/api/tour-signups/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => r.json()),
    onSuccess: invalidateAll,
  });

  const deleteSignupMutation = useMutation({
    mutationFn: (id: number) => fetch(`/api/tour-signups/${id}`, { method: "DELETE" }).then((r) => r.json()),
    onSuccess: invalidateAll,
  });

  const filtered = tours.filter(
    (t) =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.description?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-5 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Tours</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {tours.length} tours · {allSignups.length} signups
          </p>
        </div>
        <button
          onClick={() => setShowAddTour(!showAddTour)}
          className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 transition-colors shadow-sm"
        >
          <Plus size={16} />
          Add Tour
        </button>
      </div>

      {/* Add Tour Form */}
      {showAddTour && (
        <AddTourForm
          onSubmit={(data) => createTourMutation.mutate(data)}
          onCancel={() => setShowAddTour(false)}
          isLoading={createTourMutation.isPending}
        />
      )}

      {/* Search */}
      <div className="relative max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Search tours..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 shadow-sm"
        />
      </div>

      {/* Tour Cards */}
      <div className="space-y-3">
        {filtered.map((tour) => {
          const signups = allSignups.filter((s) => s.tourId === tour.id);
          const totalRevenue = signups.reduce((sum, s) => sum + s.totalPrice, 0);
          const totalPaid = signups.reduce((sum, s) => sum + (s.amountPaid || 0), 0);
          const totalPeople = signups.reduce((sum, s) => sum + s.numPeople, 0);
          const isExpanded = expandedTour === tour.id;

          return (
            <div key={tour.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              {/* Tour Header */}
              <button
                onClick={() => setExpandedTour(isExpanded ? null : tour.id)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50/50 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center">
                    <MapPin size={18} className="text-indigo-500" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{tour.name}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {tour.date && (
                        <span className="text-[11px] text-slate-400">
                          {format(new Date(tour.date + "T12:00:00"), "MMM d, yyyy")}
                        </span>
                      )}
                      <span className="text-[11px] font-medium text-indigo-600">
                        {(tour.currency || "VND")} {tour.price.toLocaleString()}/person
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="flex items-center gap-1 text-xs text-slate-500">
                      <Users size={12} />
                      {totalPeople} people
                    </div>
                    <div className="text-xs mt-0.5">
                      <span className="font-medium text-slate-700">
                        {(tour.currency || "VND")} {totalRevenue.toLocaleString()}
                      </span>
                      {totalRevenue > totalPaid && (
                        <span className="text-red-500 ml-1">
                          ({(tour.currency || "VND")} {(totalRevenue - totalPaid).toLocaleString()} owed)
                        </span>
                      )}
                    </div>
                  </div>
                  {isExpanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                </div>
              </button>

              {/* Expanded: Signups */}
              {isExpanded && (
                <div className="border-t border-slate-100">
                  {tour.description && (
                    <div className="px-5 py-2 text-xs text-slate-500 bg-slate-50/50 border-b border-slate-100">
                      {tour.description}
                    </div>
                  )}

                  {/* Signup List */}
                  {signups.length > 0 ? (
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-slate-100 bg-slate-50/50">
                          <th className="px-5 py-2 text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Guest</th>
                          <th className="px-3 py-2 text-center text-[10px] font-semibold text-slate-400 uppercase tracking-wider">People</th>
                          <th className="px-3 py-2 text-right text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Total</th>
                          <th className="px-3 py-2 text-center text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Payment</th>
                          <th className="px-3 py-2 text-right text-[10px] font-semibold text-slate-400 uppercase tracking-wider"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {signups.map((signup) => {
                          const owed = signup.totalPrice - (signup.amountPaid || 0);
                          return (
                            <tr key={signup.id} className="hover:bg-slate-50/50">
                              <td className="px-5 py-3">
                                <div className="text-sm font-medium text-slate-800">{signup.guestName}</div>
                                {signup.notes && <div className="text-[10px] text-slate-400">{signup.notes}</div>}
                              </td>
                              <td className="px-3 py-3 text-center text-sm text-slate-600">{signup.numPeople}</td>
                              <td className="px-3 py-3 text-right text-sm font-medium text-slate-700">
                                {(signup.currency || "VND")} {signup.totalPrice.toLocaleString()}
                              </td>
                              <td className="px-3 py-3 text-center">
                                <button
                                  onClick={() => {
                                    if (signup.paymentStatus === "unpaid") {
                                      updateSignupMutation.mutate({
                                        id: signup.id,
                                        paymentStatus: "paid",
                                        amountPaid: signup.totalPrice,
                                      });
                                    } else if (signup.paymentStatus === "paid") {
                                      updateSignupMutation.mutate({
                                        id: signup.id,
                                        paymentStatus: "unpaid",
                                        amountPaid: 0,
                                      });
                                    }
                                  }}
                                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                                    signup.paymentStatus === "paid"
                                      ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                      : signup.paymentStatus === "partial"
                                        ? "bg-amber-50 text-amber-700 hover:bg-amber-100"
                                        : "bg-red-50 text-red-600 hover:bg-red-100"
                                  }`}
                                >
                                  {signup.paymentStatus === "paid" ? (
                                    <><CheckCircle2 size={11} /> Paid</>
                                  ) : signup.paymentStatus === "partial" ? (
                                    <><CreditCard size={11} /> Partial</>
                                  ) : (
                                    <><CreditCard size={11} /> Unpaid</>
                                  )}
                                </button>
                              </td>
                              <td className="px-3 py-3 text-right">
                                <button
                                  onClick={() => {
                                    if (confirm(`Remove ${signup.guestName} from this tour?`)) {
                                      deleteSignupMutation.mutate(signup.id);
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
                      </tbody>
                    </table>
                  ) : (
                    <div className="px-5 py-6 text-center text-sm text-slate-400">
                      No signups yet
                    </div>
                  )}

                  {/* Add Signup / Actions */}
                  <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/30 flex items-center gap-2">
                    {showAddSignup === tour.id ? (
                      <AddSignupForm
                        tourId={tour.id}
                        guests={guests}
                        onSubmit={(data) => addSignupMutation.mutate(data)}
                        onCancel={() => setShowAddSignup(null)}
                        isLoading={addSignupMutation.isPending}
                      />
                    ) : (
                      <>
                        <button
                          onClick={() => setShowAddSignup(tour.id)}
                          className="flex items-center gap-1.5 px-3 py-2 bg-indigo-50 text-indigo-700 text-xs font-semibold rounded-lg hover:bg-indigo-100 transition-colors"
                        >
                          <UserPlus size={13} /> Add Guest
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Delete "${tour.name}" and all its signups?`)) {
                              deleteTourMutation.mutate(tour.id);
                            }
                          }}
                          className="flex items-center gap-1.5 px-3 py-2 text-slate-400 text-xs font-medium rounded-lg hover:bg-red-50 hover:text-red-600 transition-colors ml-auto"
                        >
                          <Trash2 size={13} /> Delete Tour
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm py-16 text-center">
            <MapPin size={32} className="text-slate-200 mx-auto mb-3" />
            <p className="text-sm text-slate-400">{search ? "No tours match your search" : "No tours yet"}</p>
            <p className="text-xs text-slate-300 mt-1">Click &quot;Add Tour&quot; to create one</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Add Tour Form ───────────────────────────────────────────────────────────

function AddTourForm({
  onSubmit,
  onCancel,
  isLoading,
}: {
  onSubmit: (data: { name: string; price: number; description?: string; date?: string }) => void;
  onCancel: () => void;
  isLoading: boolean;
}) {
  const [form, setForm] = useState({ name: "", price: "", description: "", date: "" });

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
          <MapPin size={16} className="text-slate-400" /> New Tour
        </h2>
        <button onClick={onCancel} className="p-1 rounded hover:bg-slate-100 text-slate-400"><X size={16} /></button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="md:col-span-2">
          <label className="block text-[11px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">Tour Name</label>
          <input
            type="text"
            placeholder="e.g. Ha Long Bay Day Trip"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            autoFocus
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">Price per Person (VND)</label>
          <input
            type="number"
            placeholder="500000"
            value={form.price}
            onChange={(e) => setForm({ ...form, price: e.target.value })}
            className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">Date (optional)</label>
          <input
            type="date"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
          />
        </div>
      </div>
      <div className="mt-3">
        <label className="block text-[11px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">Description (optional)</label>
        <input
          type="text"
          placeholder="Pick-up 7am, full-day boat cruise..."
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
        />
      </div>
      <div className="flex gap-2 mt-4 pt-4 border-t border-slate-100">
        <button
          onClick={() => onSubmit({ name: form.name, price: parseFloat(form.price), description: form.description || undefined, date: form.date || undefined })}
          disabled={isLoading || !form.name || !form.price}
          className="px-5 py-2.5 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-colors shadow-sm"
        >
          {isLoading ? "Creating..." : "Create Tour"}
        </button>
        <button onClick={onCancel} className="px-5 py-2.5 bg-slate-100 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-200 transition-colors">Cancel</button>
      </div>
    </div>
  );
}

// ─── Add Signup Form (inline) ────────────────────────────────────────────────

function AddSignupForm({
  tourId,
  guests,
  onSubmit,
  onCancel,
  isLoading,
}: {
  tourId: number;
  guests: Guest[];
  onSubmit: (data: { tourId: number; guestId: number; guestName: string; numPeople: number; notes?: string }) => void;
  onCancel: () => void;
  isLoading: boolean;
}) {
  const [guestId, setGuestId] = useState("");
  const [numPeople, setNumPeople] = useState(1);
  const [notes, setNotes] = useState("");
  const [customName, setCustomName] = useState("");

  const selectedGuest = guests.find((g) => g.id === parseInt(guestId));

  return (
    <div className="flex items-center gap-2 flex-1 flex-wrap">
      <select
        value={guestId}
        onChange={(e) => {
          setGuestId(e.target.value);
          setCustomName("");
        }}
        className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 min-w-[140px]"
      >
        <option value="">Select guest...</option>
        {guests.map((g) => (
          <option key={g.id} value={g.id}>{g.name}</option>
        ))}
      </select>
      <input
        type="number"
        min={1}
        max={20}
        value={numPeople}
        onChange={(e) => setNumPeople(parseInt(e.target.value) || 1)}
        className="w-16 border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-slate-900/10"
        title="Number of people"
      />
      <span className="text-[10px] text-slate-400">people</span>
      <input
        type="text"
        placeholder="Notes (optional)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        className="flex-1 min-w-[100px] border border-slate-200 rounded-lg px-2 py-1.5 text-xs placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
      />
      <button
        onClick={() => {
          if (!guestId || !selectedGuest) return;
          onSubmit({ tourId, guestId: parseInt(guestId), guestName: selectedGuest.name, numPeople, notes: notes || undefined });
        }}
        disabled={isLoading || !guestId}
        className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
      >
        {isLoading ? "..." : "Add"}
      </button>
      <button onClick={onCancel} className="px-2 py-1.5 text-slate-400 text-xs rounded-lg hover:bg-slate-100">
        Cancel
      </button>
    </div>
  );
}
