"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, addDays, parseISO } from "date-fns";
import { useLang } from "@/contexts/LanguageContext";
import { X, LogIn, LogOut, AlertCircle, CalendarPlus, Moon, Ban, UserX, Undo2, ChevronDown, Printer, Receipt, Pencil, StickyNote, Phone, Globe, CreditCard } from "lucide-react";

interface TourItem {
  id: number;
  tourName: string | null;
  tourDate: string | null;
  numPeople: number;
  totalPrice: number;
  currency: string | null;
  paymentStatus: string;
  amountPaid: number | null;
}

interface LaundryItem {
  id: number;
  items: string | null;
  weight: number | null;
  price: number;
  currency: string | null;
  paymentStatus: string;
  amountPaid: number | null;
  droppedOffAt: string;
}

interface ResItem {
  id: number;
  checkIn: string;
  checkOut: string;
  numGuests: number;
  totalPrice: number | null;
  currency: string | null;
  amountPaid: number | null;
  source: string;
}

interface GuestProfile {
  id: number;
  name: string;
  idNumber: string | null;
  phone: string | null;
  nationality: string | null;
  notes: string | null;
  reservations: ResItem[];
  tours: TourItem[];
  laundry: LaundryItem[];
  totals: {
    room: { total: number; paid: number; owed: number };
    tours: { total: number; paid: number; owed: number };
    laundry: { total: number; paid: number; owed: number };
    grand: { total: number; paid: number; owed: number };
  };
}

interface Reservation {
  id: number;
  externalId?: string | null;
  source: string;
  guestId?: number;
  guestName: string;
  checkIn: string;
  checkOut: string;
  roomTypeReq: string;
  numGuests: number;
  totalPrice: number | null;
  currency: string | null;
  paymentStatus: string;
  amountPaid: number | null;
  paymentMethod?: string | null;
  status: string;
  bedId?: string | null;
}

interface Props {
  reservation: Reservation;
  onClose: () => void;
}

const STATUS_CFG = {
  confirmed:   { color: "#2563eb", bg: "bg-blue-600",    label: "Arriving",    Icon: LogIn  },
  checked_in:  { color: "#059669", bg: "bg-emerald-600", label: "Checked In",  Icon: LogIn  },
  checked_out: { color: "#78716c", bg: "bg-stone-500",   label: "Checked Out", Icon: LogOut },
  cancelled:   { color: "#dc2626", bg: "bg-red-600",     label: "Cancelled",   Icon: Ban    },
  no_show:     { color: "#d97706", bg: "bg-amber-600",   label: "No Show",     Icon: UserX  },
} as const;

const SOURCE_LABEL: Record<string, string> = {
  "booking.com": "Booking.com",
  hostelworld: "Hostelworld",
  manual: "Walk-in",
};

export function GuestDetailPanel({ reservation, onClose }: Props) {
  const queryClient = useQueryClient();
  const { t } = useLang();
  const payInputRef = useRef<HTMLInputElement>(null);
  const [payAmount, setPayAmount] = useState("");
  const [showPriceEdit, setShowPriceEdit] = useState(false);
  const [priceInput, setPriceInput] = useState(reservation.totalPrice?.toString() || "");
  const [showExtend, setShowExtend] = useState(false);
  const [extendNights, setExtendNights] = useState(1);
  const [extendError, setExtendError] = useState("");
  const [showBill, setShowBill] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  // Check-in flow
  const [showCheckinForm, setShowCheckinForm] = useState(false);
  const [checkinId, setCheckinId] = useState("");
  const [checkinNat, setCheckinNat] = useState("");
  const [checkinPhone, setCheckinPhone] = useState("");
  // Guest info edit
  const [showGuestEdit, setShowGuestEdit] = useState(false);
  const [editPhone, setEditPhone] = useState("");
  const [editNat, setEditNat] = useState("");
  const [editIdNum, setEditIdNum] = useState("");
  const [editNotes, setEditNotes] = useState("");
  // Checkout confirmation
  const [showCheckoutConfirm, setShowCheckoutConfirm] = useState(false);
  // Notes quick edit
  const [showNotesEdit, setShowNotesEdit] = useState(false);
  const [notesInput, setNotesInput] = useState("");

  useEffect(() => {
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setMounted(true)));
    return () => cancelAnimationFrame(raf);
  }, []);

  function handleClose() {
    setIsClosing(true);
    setTimeout(() => onClose(), 200);
  }

  function handlePrintBill() {
    if (!guestProfile) return;
    const g = guestProfile;
    const c = cur;
    const fmt = (n: number) => n.toLocaleString();

    let html = `<!DOCTYPE html><html><head><title>Bill - ${g.name}</title>
<style>
  body{font-family:system-ui,-apple-system,sans-serif;max-width:400px;margin:0 auto;padding:24px;color:#1c1917}
  h1{font-size:18px;margin:0 0 4px}
  .sub{color:#78716c;font-size:12px;margin-bottom:20px}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#78716c;padding:6px 0;border-bottom:2px solid #e7e5e4}
  td{padding:6px 0;border-bottom:1px solid #f5f5f4}
  td:last-child,th:last-child{text-align:right}
  .section{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#a8a29e;padding:16px 0 6px;border:none}
  .total-row td{border-top:2px solid #1c1917;border-bottom:none;font-weight:700;font-size:15px;padding-top:12px}
  .paid-row td{color:#059669;font-size:13px;border:none;padding-top:4px}
  .owed-row td{color:#dc2626;font-size:16px;font-weight:800;border:none;padding-top:4px}
  .zero td{color:#059669}
  @media print{body{padding:12px}}
</style></head><body>
<h1>${g.name}</h1>
<div class="sub">${g.idNumber ? "ID: " + g.idNumber + " · " : ""}${new Date().toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"})}</div>
<table>
<tr><th>Item</th><th>Amount</th></tr>`;

    // Room nights
    if (g.reservations?.length) {
      html += `<tr><td colspan="2" class="section">Accommodation</td></tr>`;
      for (const r of g.reservations) {
        const n = Math.max(1, Math.round((new Date(r.checkOut).getTime() - new Date(r.checkIn).getTime()) / 86400000));
        const perN = (r.totalPrice || 0) > 0 ? (r.totalPrice! / n) : 0;
        html += `<tr><td>${n} night${n!==1?"s":""} (${r.checkIn} → ${r.checkOut})${perN > 0 ? `<br><span style="color:#a8a29e;font-size:11px">${c} ${fmt(perN)}/night</span>` : ""}</td><td>${c} ${fmt(r.totalPrice||0)}</td></tr>`;
      }
    }

    // Tours
    if (g.tours?.length) {
      html += `<tr><td colspan="2" class="section">Tours</td></tr>`;
      for (const t of g.tours) {
        html += `<tr><td>${t.tourName || "Tour"}${t.numPeople > 1 ? ` × ${t.numPeople}` : ""}${t.tourDate ? `<br><span style="color:#a8a29e;font-size:11px">${t.tourDate}</span>` : ""}</td><td>${c} ${fmt(t.totalPrice)}</td></tr>`;
      }
    }

    // Laundry
    if (g.laundry?.length) {
      html += `<tr><td colspan="2" class="section">Laundry</td></tr>`;
      for (const l of g.laundry) {
        html += `<tr><td>${l.items || "Laundry"}${l.weight ? ` (${l.weight}kg)` : ""}</td><td>${c} ${fmt(l.price)}</td></tr>`;
      }
    }

    const gt = g.totals.grand;
    html += `<tr class="total-row"><td>Total</td><td>${c} ${fmt(gt.total)}</td></tr>`;
    if (gt.paid > 0) html += `<tr class="paid-row"><td>Paid</td><td>− ${c} ${fmt(gt.paid)}</td></tr>`;
    html += `<tr class="${gt.owed > 0 ? "owed-row" : "zero"}"><td>${gt.owed > 0 ? "Balance Due" : "Balance"}</td><td>${gt.owed > 0 ? `${c} ${fmt(gt.owed)}` : "Paid ✓"}</td></tr>`;

    html += `</table></body></html>`;

    const w = window.open("", "_blank", "width=500,height=700");
    if (w) {
      w.document.write(html);
      w.document.close();
      w.onload = () => w.print();
    }
  }

  const { data: guestProfile } = useQuery<GuestProfile>({
    queryKey: ["guest-profile", reservation.guestId],
    queryFn: () => fetch(`/api/guests/${reservation.guestId}`).then((r) => r.json()),
    enabled: !!reservation.guestId,
  });

  useEffect(() => {
    setPriceInput(reservation.totalPrice?.toString() || "");
  }, [reservation.totalPrice]);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["reservations"] });
    queryClient.invalidateQueries({ queryKey: ["assignments"] });
    queryClient.invalidateQueries({ queryKey: ["stats"] });
  };

  const updateMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch(`/api/reservations/${reservation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => r.json()),
    onSuccess: invalidateAll,
  });

  const extendMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch("/api/assignments/extend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error || "Failed to extend");
        return json;
      }),
    onSuccess: () => { setShowExtend(false); setExtendError(""); invalidateAll(); },
    onError: (err: Error) => setExtendError(err.message),
  });

  const guestUpdateMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch(`/api/guests/${reservation.guestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["guest-profile"] });
      invalidateAll();
    },
  });

  const nights = Math.max(1, Math.round(
    (new Date(reservation.checkOut).getTime() - new Date(reservation.checkIn).getTime()) / 86400000
  ));
  const totalPrice = reservation.totalPrice ?? 0;
  const amountPaid = reservation.amountPaid ?? 0;
  const debt = Math.max(0, totalPrice - amountPaid);
  const perNight = totalPrice > 0 && nights > 0 ? totalPrice / nights : 0;
  const cur = reservation.currency || "VND";

  const isConfirmed  = reservation.status === "confirmed";
  const isCheckedIn  = reservation.status === "checked_in";
  const isCheckedOut = reservation.status === "checked_out";
  const isCancelled  = reservation.status === "cancelled";
  const isNoShow     = reservation.status === "no_show";
  const isActive     = isConfirmed || isCheckedIn;

  const cfg = STATUS_CFG[reservation.status as keyof typeof STATUS_CFG] ?? STATUS_CFG.confirmed;
  const StatusIcon = cfg.Icon;
  const extendDate = format(addDays(parseISO(reservation.checkOut), extendNights), "yyyy-MM-dd");

  const initials = reservation.guestName.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
  const grandOwed = guestProfile?.totals.grand.owed ?? 0;

  function handleAddPayment() {
    const adding = parseFloat(payAmount);
    if (isNaN(adding) || adding <= 0) return;
    const newPaid = amountPaid + adding;
    const ps = newPaid >= totalPrice && totalPrice > 0 ? "paid" : "partial";
    updateMutation.mutate({ amountPaid: newPaid, paymentStatus: ps });
    setPayAmount("");
  }

  function handleSavePrice() {
    const price = parseFloat(priceInput);
    if (isNaN(price) || price < 0) return;
    const ps = amountPaid >= price && price > 0 ? "paid" : amountPaid > 0 ? "partial" : "unpaid";
    updateMutation.mutate({ totalPrice: price, paymentStatus: ps });
    setShowPriceEdit(false);
  }

  const isBusy = updateMutation.isPending || extendMutation.isPending;


  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 transition-all duration-200 ${
          isClosing || !mounted ? "bg-transparent" : "bg-transparent"
        }`}
        onClick={handleClose}
      />

      {/* Panel */}
      <div
        className={`fixed left-16 top-0 bottom-0 z-50 flex flex-col bg-white shadow-2xl overflow-hidden
          transition-transform duration-200 ease-out w-[460px]
          ${isClosing || !mounted ? "-translate-x-full" : "translate-x-0"}`}
      >
        {/* Top loading bar */}
        {isBusy && (
          <div className="absolute top-0 left-0 right-0 h-0.5 z-10 overflow-hidden">
            <div className="h-full bg-blue-500 opacity-60"
              style={{ animation: "slide 1.2s ease-in-out infinite" }}
            />
          </div>
        )}

        {/* ── TITLE BAR ── */}
        <div className="shrink-0 px-4 py-2.5 flex items-center justify-between"
          style={{ background: "#1e3a5f" }}
        >
          <span className="text-white font-bold text-[13px]">{reservation.guestName}</span>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded"
              style={{ background: "rgba(255,255,255,0.2)", color: "rgba(255,255,255,0.85)", letterSpacing: "0.3px" }}
            >
              {cfg.label}
            </span>
            <button
              onClick={handleClose}
              className="w-6 h-6 rounded flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">

          {/* ── FORM GRID ── */}
          <div className="grid grid-cols-[80px_1fr_80px_1fr] text-[12px] border-b border-slate-200">
            <div className="px-2 py-1.5 bg-slate-50 text-slate-500 font-bold text-[10px] uppercase tracking-wide border-b border-r border-slate-200">Bed</div>
            <div className="px-2 py-1.5 text-slate-900 font-medium border-b border-r border-slate-200">{reservation.bedId || "—"}</div>
            <div className="px-2 py-1.5 bg-slate-50 text-slate-500 font-bold text-[10px] uppercase tracking-wide border-b border-r border-slate-200">Source</div>
            <div className="px-2 py-1.5 text-slate-900 font-medium border-b border-slate-200">{SOURCE_LABEL[reservation.source] || reservation.source}</div>

            <div className="px-2 py-1.5 bg-slate-50 text-slate-500 font-bold text-[10px] uppercase tracking-wide border-b border-r border-slate-200">Check-in</div>
            <div className="px-2 py-1.5 text-slate-900 font-medium border-b border-r border-slate-200">{format(new Date(reservation.checkIn + "T12:00:00"), "d MMM yyyy")}</div>
            <div className="px-2 py-1.5 bg-slate-50 text-slate-500 font-bold text-[10px] uppercase tracking-wide border-b border-r border-slate-200">Check-out</div>
            <div className="px-2 py-1.5 text-slate-900 font-medium border-b border-slate-200">{format(new Date(reservation.checkOut + "T12:00:00"), "d MMM yyyy")}</div>

            <div className="px-2 py-1.5 bg-slate-50 text-slate-500 font-bold text-[10px] uppercase tracking-wide border-b border-r border-slate-200">Nights</div>
            <div className="px-2 py-1.5 text-slate-900 font-medium border-b border-r border-slate-200">{nights}</div>
            <div className="px-2 py-1.5 bg-slate-50 text-slate-500 font-bold text-[10px] uppercase tracking-wide border-b border-r border-slate-200">Guests</div>
            <div className="px-2 py-1.5 text-slate-900 font-medium border-b border-slate-200">{reservation.numGuests}</div>

            <div className="px-2 py-1.5 bg-slate-50 text-slate-500 font-bold text-[10px] uppercase tracking-wide border-b border-r border-slate-200">Total</div>
            <div className="px-2 py-1.5 text-slate-900 font-semibold border-b border-r border-slate-200">{totalPrice > 0 ? `${cur} ${totalPrice.toLocaleString()}` : "—"}</div>
            <div className="px-2 py-1.5 bg-slate-50 text-slate-500 font-bold text-[10px] uppercase tracking-wide border-b border-r border-slate-200">{debt > 0 ? "Balance" : "Paid"}</div>
            <div className={`px-2 py-1.5 font-bold border-b border-slate-200 ${debt > 0 ? "text-red-600" : "text-emerald-600"}`}>
              {totalPrice > 0
                ? debt > 0
                  ? `${cur} ${debt.toLocaleString()}`
                  : `${cur} ${amountPaid.toLocaleString()} ✓`
                : "—"
              }
            </div>
          </div>

          {/* ── GUEST INFO (collapsed display) ── */}
          {guestProfile && !showGuestEdit && (
            <div className="px-3 py-2 border-b border-slate-200 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
              {guestProfile.nationality && (
                <span className="flex items-center gap-1"><Globe size={11} className="text-slate-400" />{guestProfile.nationality}</span>
              )}
              {guestProfile.phone && (
                <span className="flex items-center gap-1"><Phone size={11} className="text-slate-400" />{guestProfile.phone}</span>
              )}
              {guestProfile.idNumber && (
                <span className="text-slate-400 font-mono text-[11px]">ID: {guestProfile.idNumber}</span>
              )}
              {guestProfile.notes && (
                <span className="flex items-center gap-1"><StickyNote size={11} className="text-amber-400" /><span className="italic">{guestProfile.notes}</span></span>
              )}
            </div>
          )}

          {/* Guest edit form */}
          {guestProfile && showGuestEdit && (
            <div className="px-3 py-3 border-b border-slate-200 space-y-2">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Edit Guest Info</div>
              <div className="grid grid-cols-2 gap-1.5">
                <input type="text" value={editNat} onChange={(e) => setEditNat(e.target.value)} placeholder="Nationality" list="nationalities" className="px-2 py-1.5 text-xs border border-slate-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-500/30" />
                <input type="tel" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} placeholder="Phone" className="px-2 py-1.5 text-xs border border-slate-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-500/30" />
                <input type="text" value={editIdNum} onChange={(e) => setEditIdNum(e.target.value)} placeholder="Passport / ID" className="col-span-2 px-2 py-1.5 text-xs border border-slate-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-500/30" />
                <textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} placeholder="Notes" rows={2} className="col-span-2 px-2 py-1.5 text-xs border border-slate-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-500/30 resize-none" />
              </div>
              <datalist id="nationalities">
                {["Vietnam", "Australia", "UK", "USA", "Germany", "France", "Japan", "South Korea", "China", "Canada", "Netherlands", "Sweden", "Denmark", "Norway", "Italy", "Spain", "Brazil", "India", "Thailand", "Singapore", "Malaysia", "Indonesia", "Philippines", "New Zealand", "Ireland", "Belgium", "Switzerland", "Austria", "Poland", "Czech Republic", "Israel", "Russia", "Colombia", "Argentina", "Mexico", "Chile", "South Africa", "Taiwan", "Hong Kong"].map(n => (
                  <option key={n} value={n} />
                ))}
              </datalist>
              <div className="flex gap-1.5">
                <button
                  onClick={() => {
                    guestUpdateMutation.mutate({
                      nationality: editNat || null,
                      phone: editPhone || null,
                      idNumber: editIdNum || null,
                      notes: editNotes || null,
                    });
                    setShowGuestEdit(false);
                  }}
                  disabled={guestUpdateMutation.isPending}
                  className="px-3 py-1.5 text-[10px] font-bold rounded text-white disabled:opacity-50"
                  style={{ background: "#1e3a5f" }}
                >
                  Save
                </button>
                <button onClick={() => setShowGuestEdit(false)} className="px-2 py-1.5 text-[10px] text-slate-400 hover:text-slate-600">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Notes quick edit */}
          {showNotesEdit && (
            <div className="px-3 py-2 border-b border-slate-200 flex gap-1.5">
              <input
                type="text"
                value={notesInput}
                onChange={(e) => setNotesInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && notesInput.trim()) {
                    guestUpdateMutation.mutate({ notes: notesInput.trim() });
                    setShowNotesEdit(false);
                  }
                }}
                placeholder="Add a note..."
                autoFocus
                className="flex-1 px-2 py-1.5 text-xs border border-slate-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-500/30"
              />
              <button
                onClick={() => {
                  if (notesInput.trim()) guestUpdateMutation.mutate({ notes: notesInput.trim() });
                  setShowNotesEdit(false);
                }}
                className="text-xs font-semibold text-slate-600 px-2"
              >
                Save
              </button>
            </div>
          )}

          {/* ── PAYMENT STRIP ── */}
          {debt > 0 && isActive && (
            <div className="px-3 py-2 flex gap-1.5 items-center border-b border-slate-200">
              <input
                ref={payInputRef}
                type="number"
                min={0}
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddPayment()}
                placeholder="Payment amount"
                className="flex-1 border border-slate-300 rounded px-2 py-1.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-500/30"
              />
              <button
                onClick={handleAddPayment}
                disabled={isBusy || !payAmount}
                className="px-2.5 py-1.5 text-[10px] font-bold rounded text-white disabled:opacity-40"
                style={{ background: "#1e3a5f" }}
              >
                Add
              </button>
              <button
                onClick={() => updateMutation.mutate({ amountPaid: totalPrice, paymentStatus: "paid" })}
                disabled={isBusy}
                className="px-2.5 py-1.5 text-[10px] font-bold rounded text-white disabled:opacity-50"
                style={{ background: "#10b981" }}
              >
                Paid all
              </button>
            </div>
          )}

          {/* Edit price form */}
          {showPriceEdit && (
            <div className="px-3 py-2 flex gap-1.5 items-center border-b border-slate-200">
              <input
                type="number"
                min={0}
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSavePrice()}
                autoFocus={totalPrice === 0}
                placeholder={`Total price (${cur})`}
                className="flex-1 border border-slate-300 rounded px-2 py-1.5 text-[11px] font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500/30"
              />
              <button
                onClick={handleSavePrice}
                className="px-2.5 py-1.5 text-[10px] font-bold rounded text-white"
                style={{ background: "#1e3a5f" }}
              >
                Save
              </button>
              <button
                onClick={() => setShowPriceEdit(false)}
                className="px-2 py-1.5 text-[10px] text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>
          )}

          {/* Grand balance across services */}
          {guestProfile?.totals && grandOwed > 0 && grandOwed !== debt && (
            <div className="mx-3 my-2 flex items-center gap-2 px-3 py-2 bg-amber-50 rounded border border-amber-200">
              <AlertCircle size={12} className="text-amber-500 shrink-0" />
              <span className="text-[11px] font-semibold text-amber-700">
                Total balance incl. tours & laundry: {cur} {grandOwed.toLocaleString()}
              </span>
            </div>
          )}

          {/* ── CHECK-IN FORM ── */}
          {isConfirmed && showCheckinForm && (
            <div className="px-3 py-3 border-b border-slate-200 space-y-2 bg-emerald-50/50">
              <div className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">Guest Info — Check In</div>
              <div className="grid grid-cols-2 gap-1.5">
                <input
                  type="text"
                  value={checkinId}
                  onChange={(e) => setCheckinId(e.target.value)}
                  placeholder="Passport / ID"
                  autoFocus
                  className="col-span-2 px-2 py-1.5 text-xs border border-slate-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500/30"
                />
                <input
                  type="text"
                  value={checkinNat}
                  onChange={(e) => setCheckinNat(e.target.value)}
                  placeholder="Nationality"
                  list="nationalities"
                  className="px-2 py-1.5 text-xs border border-slate-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500/30"
                />
                <input
                  type="tel"
                  value={checkinPhone}
                  onChange={(e) => setCheckinPhone(e.target.value)}
                  placeholder="Phone"
                  className="px-2 py-1.5 text-xs border border-slate-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500/30"
                />
              </div>
              <datalist id="nationalities">
                {["Vietnam", "Australia", "UK", "USA", "Germany", "France", "Japan", "South Korea", "China", "Canada", "Netherlands", "Sweden", "Denmark", "Norway", "Italy", "Spain", "Brazil", "India", "Thailand", "Singapore", "Malaysia", "Indonesia", "Philippines", "New Zealand", "Ireland", "Belgium", "Switzerland", "Austria", "Poland", "Czech Republic", "Israel", "Russia", "Colombia", "Argentina", "Mexico", "Chile", "South Africa", "Taiwan", "Hong Kong"].map(n => (
                  <option key={n} value={n} />
                ))}
              </datalist>
              <div className="flex gap-1.5">
                <button
                  onClick={async () => {
                    if (reservation.guestId && (checkinId || checkinNat || checkinPhone)) {
                      await guestUpdateMutation.mutateAsync({
                        ...(checkinId && { idNumber: checkinId }),
                        ...(checkinNat && { nationality: checkinNat }),
                        ...(checkinPhone && { phone: checkinPhone }),
                      });
                    }
                    updateMutation.mutate({ status: "checked_in" });
                    setShowCheckinForm(false);
                  }}
                  disabled={isBusy}
                  className="px-3 py-1.5 rounded text-white text-[10px] font-bold disabled:opacity-50"
                  style={{ background: "#059669" }}
                >
                  Confirm Check In
                </button>
                <button
                  onClick={() => {
                    updateMutation.mutate({ status: "checked_in" });
                    setShowCheckinForm(false);
                  }}
                  disabled={isBusy}
                  className="px-3 py-1.5 text-[10px] text-slate-400 hover:text-slate-600"
                >
                  Skip
                </button>
              </div>
            </div>
          )}

          {/* ── CHECKOUT CONFIRMATION ── */}
          {isCheckedIn && showCheckoutConfirm && (
            <div className="px-3 py-3 border-b border-slate-200 space-y-2 bg-red-50/50">
              <div className="text-[10px] font-bold text-red-600">
                Guest owes {cur} {debt.toLocaleString()}
              </div>
              <div className="flex gap-1.5">
                <button
                  onClick={() => {
                    updateMutation.mutate({ amountPaid: totalPrice, paymentStatus: "paid", status: "checked_out" });
                    setShowCheckoutConfirm(false);
                    setShowBill(true);
                  }}
                  disabled={isBusy}
                  className="px-3 py-1.5 rounded text-white text-[10px] font-bold disabled:opacity-50"
                  style={{ background: "#059669" }}
                >
                  Settle & Check Out
                </button>
                <button
                  onClick={() => {
                    updateMutation.mutate({ status: "checked_out" });
                    setShowCheckoutConfirm(false);
                    setShowBill(true);
                  }}
                  disabled={isBusy}
                  className="px-3 py-1.5 rounded text-red-600 text-[10px] font-bold bg-red-100 hover:bg-red-200 disabled:opacity-50"
                >
                  Check Out Unpaid
                </button>
                <button
                  onClick={() => setShowCheckoutConfirm(false)}
                  className="px-2 py-1.5 text-[10px] text-slate-400 hover:text-slate-600"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* ── TOTAL BILL ── */}
          {guestProfile && showBill && (
            <div className="border-b border-slate-200">
              {/* Room nights */}
              {guestProfile.reservations?.length > 0 && (
                <div className="px-3 pt-3 pb-1">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Accommodation</div>
                  {guestProfile.reservations.map((r) => {
                    const n = Math.max(1, Math.round((new Date(r.checkOut).getTime() - new Date(r.checkIn).getTime()) / 86400000));
                    const perN = (r.totalPrice || 0) > 0 ? (r.totalPrice! / n) : 0;
                    return (
                      <div key={r.id} className="flex justify-between items-baseline py-1">
                        <div>
                          <span className="text-xs text-slate-700">{n} night{n !== 1 ? "s" : ""}</span>
                          <span className="text-[10px] text-slate-400 ml-1.5">
                            {format(new Date(r.checkIn + "T12:00:00"), "d MMM")} → {format(new Date(r.checkOut + "T12:00:00"), "d MMM")}
                          </span>
                          {perN > 0 && <span className="text-[10px] text-slate-400 ml-1">({cur} {perN.toLocaleString()}/n)</span>}
                        </div>
                        <span className="text-xs font-semibold text-slate-700 tabular-nums">{cur} {(r.totalPrice || 0).toLocaleString()}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Tours */}
              {guestProfile.tours?.length > 0 && (
                <div className="px-3 pt-2 pb-1 border-t border-slate-100">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Tours</div>
                  {guestProfile.tours.map((tour) => (
                    <div key={tour.id} className="flex justify-between items-baseline py-1">
                      <div>
                        <span className="text-xs text-slate-700">{tour.tourName || "Tour"}</span>
                        {tour.numPeople > 1 && <span className="text-[10px] text-slate-400 ml-1">× {tour.numPeople}</span>}
                        {tour.tourDate && <span className="text-[10px] text-slate-400 ml-1.5">{format(new Date(tour.tourDate + "T12:00:00"), "d MMM")}</span>}
                      </div>
                      <span className="text-xs font-semibold text-slate-700 tabular-nums">{cur} {tour.totalPrice.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Laundry */}
              {guestProfile.laundry?.length > 0 && (
                <div className="px-3 pt-2 pb-1 border-t border-slate-100">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Laundry</div>
                  {guestProfile.laundry.map((l) => (
                    <div key={l.id} className="flex justify-between items-baseline py-1">
                      <div>
                        <span className="text-xs text-slate-700">{l.items || "Laundry"}</span>
                        {l.weight && <span className="text-[10px] text-slate-400 ml-1">({l.weight}kg)</span>}
                      </div>
                      <span className="text-xs font-semibold text-slate-700 tabular-nums">{cur} {l.price.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Grand totals */}
              <div className="px-3 pt-2 pb-2.5 border-t-2 border-slate-300 bg-slate-50">
                <div className="flex justify-between items-baseline">
                  <span className="text-xs font-bold text-slate-800">Grand Total</span>
                  <span className="text-sm font-extrabold text-slate-800 tabular-nums">
                    {cur} {guestProfile.totals.grand.total.toLocaleString()}
                  </span>
                </div>
                {guestProfile.totals.grand.paid > 0 && (
                  <div className="flex justify-between items-baseline mt-0.5">
                    <span className="text-xs text-emerald-600">Paid</span>
                    <span className="text-xs font-semibold text-emerald-600 tabular-nums">
                      − {cur} {guestProfile.totals.grand.paid.toLocaleString()}
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-baseline mt-0.5">
                  <span className="text-xs font-bold" style={{ color: guestProfile.totals.grand.owed > 0 ? "#dc2626" : "#059669" }}>
                    {guestProfile.totals.grand.owed > 0 ? "Balance Due" : "Balance"}
                  </span>
                  <span className="text-sm font-extrabold tabular-nums" style={{ color: guestProfile.totals.grand.owed > 0 ? "#dc2626" : "#059669" }}>
                    {guestProfile.totals.grand.owed > 0
                      ? `${cur} ${guestProfile.totals.grand.owed.toLocaleString()}`
                      : "Paid ✓"}
                  </span>
                </div>
              </div>

              {/* Print button */}
              <div className="px-3 py-2 border-t border-slate-200 bg-slate-50">
                <button
                  onClick={handlePrintBill}
                  className="w-full py-1.5 rounded text-[10px] font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Printer size={12} />
                  Print Bill
                </button>
              </div>
            </div>
          )}

          {/* ── EXTEND STAY ── */}
          {showExtend && !isCancelled && !isNoShow && (
            <div className="px-3 py-3 border-b border-slate-200 space-y-3 bg-blue-50/50">
              {/* Night selector */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <Moon size={12} className="text-blue-400" />
                  Extra nights
                </div>
                <div className="flex gap-1">
                  {[1, 2, 3, 5, 7].map((n) => (
                    <button
                      key={n}
                      onClick={() => setExtendNights(n)}
                      className={`w-7 h-7 rounded text-[11px] font-bold transition-all ${
                        extendNights === n
                          ? "bg-blue-600 text-white"
                          : "bg-white text-slate-600 border border-slate-200 hover:border-blue-300"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              {/* Summary */}
              <div className="text-xs text-center text-slate-500">
                New checkout:{" "}
                <span className="font-bold text-slate-800">
                  {format(addDays(parseISO(reservation.checkOut), extendNights), "EEE, d MMM")}
                </span>
                {perNight > 0 && (
                  <span className="text-slate-400 ml-1.5">
                    +{cur} {(perNight * extendNights).toLocaleString()}
                  </span>
                )}
              </div>

              {extendError && (
                <div className="flex items-center gap-1.5 text-[10px] text-red-600 font-medium bg-red-50 rounded px-2 py-1.5 border border-red-100">
                  <AlertCircle size={11} className="shrink-0" />
                  {extendError}
                </div>
              )}

              <button
                onClick={() => { setExtendError(""); extendMutation.mutate({ reservationId: reservation.id, newCheckOut: extendDate }); }}
                disabled={extendMutation.isPending}
                className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-[11px] font-bold transition-all disabled:opacity-60"
              >
                {extendMutation.isPending ? "Extending…" : `Confirm — Add ${extendNights} Night${extendNights !== 1 ? "s" : ""}`}
              </button>
            </div>
          )}
        </div>

        {/* ── TOOLBAR ── */}
        <div className="shrink-0 px-2 py-1.5 bg-slate-50 border-t border-slate-200 flex gap-1 flex-wrap">
          {/* Primary action */}
          {isConfirmed && !showCheckinForm && (
            <button
              onClick={() => setShowCheckinForm(true)}
              disabled={isBusy}
              className="px-3 py-1.5 text-[10px] font-bold rounded text-white disabled:opacity-50"
              style={{ background: "#1e3a5f" }}
            >
              Check In
            </button>
          )}
          {isCheckedIn && !showCheckoutConfirm && (
            <button
              onClick={() => {
                if (debt > 0) {
                  setShowCheckoutConfirm(true);
                } else {
                  updateMutation.mutate({ status: "checked_out" });
                  setShowBill(true);
                }
              }}
              disabled={isBusy}
              className="px-3 py-1.5 text-[10px] font-bold rounded text-white disabled:opacity-50"
              style={{ background: "#1e3a5f" }}
            >
              Check Out
            </button>
          )}
          {isCheckedOut && (
            <button
              onClick={() => updateMutation.mutate({ status: "checked_in" })}
              disabled={isBusy}
              className="px-3 py-1.5 text-[10px] font-bold rounded bg-white border border-slate-300 text-slate-600 hover:bg-slate-100 disabled:opacity-50"
            >
              Undo Checkout
            </button>
          )}

          {/* Secondary actions */}
          {!isCancelled && !isNoShow && (
            <button
              onClick={() => { setShowExtend(!showExtend); setExtendError(""); }}
              className={`px-3 py-1.5 text-[10px] font-bold rounded border transition-colors ${
                showExtend ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-slate-300 text-slate-600 hover:bg-slate-100"
              }`}
            >
              Extend
            </button>
          )}
          {guestProfile && (
            <>
              <button
                onClick={() => {
                  if (!showGuestEdit) {
                    setEditPhone(guestProfile.phone || "");
                    setEditNat(guestProfile.nationality || "");
                    setEditIdNum(guestProfile.idNumber || "");
                    setEditNotes(guestProfile.notes || "");
                  }
                  setShowGuestEdit(!showGuestEdit);
                }}
                className={`px-3 py-1.5 text-[10px] font-bold rounded border transition-colors ${
                  showGuestEdit ? "bg-slate-800 border-slate-800 text-white" : "bg-white border-slate-300 text-slate-600 hover:bg-slate-100"
                }`}
              >
                Edit
              </button>
              <button
                onClick={() => setShowBill(!showBill)}
                className={`px-3 py-1.5 text-[10px] font-bold rounded border transition-colors ${
                  showBill ? "bg-slate-800 border-slate-800 text-white" : "bg-white border-slate-300 text-slate-600 hover:bg-slate-100"
                }`}
              >
                Bill
              </button>
            </>
          )}
          {totalPrice === 0 && !showPriceEdit && (
            <button
              onClick={() => setShowPriceEdit(true)}
              className="px-3 py-1.5 text-[10px] font-bold rounded bg-white border border-slate-300 text-slate-600 hover:bg-slate-100"
            >
              Set Price
            </button>
          )}
          {totalPrice > 0 && !showPriceEdit && (
            <button
              onClick={() => setShowPriceEdit(true)}
              className="px-3 py-1.5 text-[10px] font-bold rounded bg-white border border-slate-300 text-slate-600 hover:bg-slate-100"
            >
              Edit Price
            </button>
          )}

          <div className="flex-1" />

          {/* Destructive actions */}
          {isConfirmed && (
            <button
              onClick={() => updateMutation.mutate({ status: "no_show" })}
              disabled={isBusy}
              className="px-3 py-1.5 text-[10px] font-bold rounded bg-white border border-slate-300 text-slate-600 hover:bg-slate-100 disabled:opacity-50"
            >
              No Show
            </button>
          )}
          {isActive && (
            <button
              onClick={() => updateMutation.mutate({ status: "cancelled" })}
              disabled={isBusy}
              className="px-3 py-1.5 text-[10px] font-bold rounded bg-white border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      <style jsx global>{`
        @keyframes slide {
          0%   { width: 0%; margin-left: 0; }
          50%  { width: 60%; }
          100% { width: 0%; margin-left: 100%; }
        }
      `}</style>
    </>
  );
}
