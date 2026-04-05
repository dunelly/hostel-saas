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
            <div className={`h-full ${cfg.bg} opacity-60`}
              style={{ animation: "slide 1.2s ease-in-out infinite" }}
            />
          </div>
        )}

        {/* ── STATUS BANNER ── */}
        <div className={`${cfg.bg} shrink-0 px-6 py-4 flex items-center justify-between`}
          style={{ background: `linear-gradient(135deg, ${cfg.color} 0%, ${cfg.color}dd 100%)` }}
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
              <StatusIcon size={15} className="text-white" />
            </div>
            <span className="text-white font-bold text-base tracking-wide">{cfg.label}</span>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-full hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white transition-colors"
          >
            <X size={17} />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">

          {/* ── GUEST IDENTITY ── */}
          <div className="px-6 pt-6 pb-5 border-b border-stone-100">
            <div className="flex items-center gap-4">
              {/* Avatar */}
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center text-base font-bold text-white shrink-0"
                style={{ background: `linear-gradient(135deg, ${cfg.color}cc, ${cfg.color})` }}
              >
                {initials}
              </div>

              <div className="min-w-0 flex-1">
                {/* Serif guest name — hotel register feel */}
                <h2 className="font-serif text-[22px] font-bold text-stone-900 leading-tight tracking-tight truncate">
                  {reservation.guestName}
                </h2>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  {reservation.bedId && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-stone-500 bg-stone-100 rounded-md px-2 py-0.5">
                      {reservation.bedId}
                    </span>
                  )}
                  <span className="text-xs text-stone-400">
                    {format(new Date(reservation.checkIn + "T12:00:00"), "d MMM")}
                    {" — "}
                    {format(new Date(reservation.checkOut + "T12:00:00"), "d MMM")}
                  </span>
                  <span className="text-stone-300 text-xs">·</span>
                  <span className="text-xs text-stone-400">{nights} night{nights !== 1 ? "s" : ""}</span>
                  <span className="text-stone-300 text-xs">·</span>
                  <span className="text-xs text-stone-400">{SOURCE_LABEL[reservation.source] || reservation.source}</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── GUEST INFO ── */}
          {guestProfile && (
            <div className="px-6 py-3 border-b border-stone-100">
              {!showGuestEdit ? (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Guest Info</span>
                    <button
                      onClick={() => {
                        setEditPhone(guestProfile.phone || "");
                        setEditNat(guestProfile.nationality || "");
                        setEditIdNum(guestProfile.idNumber || "");
                        setEditNotes(guestProfile.notes || "");
                        setShowGuestEdit(true);
                      }}
                      className="text-stone-300 hover:text-stone-500 transition-colors"
                    >
                      <Pencil size={12} />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-500">
                    {guestProfile.nationality && (
                      <span className="flex items-center gap-1"><Globe size={11} className="text-stone-400" />{guestProfile.nationality}</span>
                    )}
                    {guestProfile.phone && (
                      <span className="flex items-center gap-1"><Phone size={11} className="text-stone-400" />{guestProfile.phone}</span>
                    )}
                    {guestProfile.idNumber && (
                      <span className="text-stone-400 font-mono text-[11px]">ID: {guestProfile.idNumber}</span>
                    )}
                    {!guestProfile.nationality && !guestProfile.phone && !guestProfile.idNumber && (
                      <span className="text-stone-300 italic">No guest info recorded</span>
                    )}
                  </div>
                  {/* Notes */}
                  {guestProfile.notes ? (
                    <div className="flex items-start gap-1.5 mt-1">
                      <StickyNote size={11} className="text-amber-400 shrink-0 mt-0.5" />
                      <span className="text-xs text-stone-500 italic">{guestProfile.notes}</span>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setNotesInput(""); setShowNotesEdit(true); }}
                      className="text-[10px] text-stone-300 hover:text-stone-500 transition-colors mt-1"
                    >
                      + Add note
                    </button>
                  )}
                  {showNotesEdit && (
                    <div className="flex gap-2 mt-1.5">
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
                        className="flex-1 px-2.5 py-1.5 text-xs border border-stone-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-stone-800/10"
                      />
                      <button
                        onClick={() => {
                          if (notesInput.trim()) guestUpdateMutation.mutate({ notes: notesInput.trim() });
                          setShowNotesEdit(false);
                        }}
                        className="text-xs font-semibold text-stone-600 px-2"
                      >
                        Save
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Edit Guest Info</div>
                  <div className="grid grid-cols-2 gap-2">
                    <input type="text" value={editNat} onChange={(e) => setEditNat(e.target.value)} placeholder="Nationality" list="nationalities" className="px-2.5 py-2 text-xs border border-stone-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-stone-800/10" />
                    <input type="tel" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} placeholder="Phone" className="px-2.5 py-2 text-xs border border-stone-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-stone-800/10" />
                    <input type="text" value={editIdNum} onChange={(e) => setEditIdNum(e.target.value)} placeholder="Passport / ID" className="col-span-2 px-2.5 py-2 text-xs border border-stone-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-stone-800/10" />
                    <textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} placeholder="Notes" rows={2} className="col-span-2 px-2.5 py-2 text-xs border border-stone-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-stone-800/10 resize-none" />
                  </div>
                  <datalist id="nationalities">
                    {["Vietnam", "Australia", "UK", "USA", "Germany", "France", "Japan", "South Korea", "China", "Canada", "Netherlands", "Sweden", "Denmark", "Norway", "Italy", "Spain", "Brazil", "India", "Thailand", "Singapore", "Malaysia", "Indonesia", "Philippines", "New Zealand", "Ireland", "Belgium", "Switzerland", "Austria", "Poland", "Czech Republic", "Israel", "Russia", "Colombia", "Argentina", "Mexico", "Chile", "South Africa", "Taiwan", "Hong Kong"].map(n => (
                      <option key={n} value={n} />
                    ))}
                  </datalist>
                  <div className="flex gap-2">
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
                      className="px-4 py-2 bg-stone-800 text-white text-xs font-bold rounded-lg hover:bg-stone-900 transition-colors disabled:opacity-50"
                    >
                      Save
                    </button>
                    <button onClick={() => setShowGuestEdit(false)} className="text-xs text-stone-400 hover:text-stone-600 px-2 transition-colors">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── PRIMARY ACTION ── */}
          <div className="px-6 py-5">
            {isConfirmed && !showCheckinForm && (
              <button
                onClick={() => setShowCheckinForm(true)}
                disabled={isBusy}
                className="w-full py-4 rounded-2xl text-white text-base font-bold tracking-wide flex items-center justify-center gap-3 active:scale-[0.98] transition-all duration-150 disabled:opacity-50"
                style={{
                  background: "linear-gradient(135deg, #059669, #10b981)",
                  boxShadow: "0 4px 24px rgba(5,150,105,0.35)",
                }}
              >
                <LogIn size={20} strokeWidth={2.5} />
                Check In
              </button>
            )}
            {isConfirmed && showCheckinForm && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-3">
                <div className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Guest Info</div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={checkinId}
                    onChange={(e) => setCheckinId(e.target.value)}
                    placeholder="Passport / ID"
                    autoFocus
                    className="col-span-2 px-3 py-2.5 text-sm border border-stone-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400"
                  />
                  <input
                    type="text"
                    value={checkinNat}
                    onChange={(e) => setCheckinNat(e.target.value)}
                    placeholder="Nationality"
                    list="nationalities"
                    className="px-3 py-2.5 text-sm border border-stone-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400"
                  />
                  <input
                    type="tel"
                    value={checkinPhone}
                    onChange={(e) => setCheckinPhone(e.target.value)}
                    placeholder="Phone"
                    className="px-3 py-2.5 text-sm border border-stone-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400"
                  />
                </div>
                <datalist id="nationalities">
                  {["Vietnam", "Australia", "UK", "USA", "Germany", "France", "Japan", "South Korea", "China", "Canada", "Netherlands", "Sweden", "Denmark", "Norway", "Italy", "Spain", "Brazil", "India", "Thailand", "Singapore", "Malaysia", "Indonesia", "Philippines", "New Zealand", "Ireland", "Belgium", "Switzerland", "Austria", "Poland", "Czech Republic", "Israel", "Russia", "Colombia", "Argentina", "Mexico", "Chile", "South Africa", "Taiwan", "Hong Kong"].map(n => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
                <div className="flex gap-2">
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
                    className="flex-1 py-3 rounded-xl text-white text-sm font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-50"
                    style={{ background: "#059669" }}
                  >
                    <LogIn size={16} />
                    Confirm Check In
                  </button>
                  <button
                    onClick={() => {
                      updateMutation.mutate({ status: "checked_in" });
                      setShowCheckinForm(false);
                    }}
                    disabled={isBusy}
                    className="px-4 py-3 rounded-xl text-stone-400 text-sm hover:text-stone-600 transition-colors"
                  >
                    Skip
                  </button>
                </div>
              </div>
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
                className="w-full py-4 rounded-2xl text-white text-base font-bold tracking-wide flex items-center justify-center gap-3 active:scale-[0.98] transition-all duration-150 disabled:opacity-50"
                style={{
                  background: debt > 0
                    ? "linear-gradient(135deg, #dc2626, #ef4444)"
                    : "linear-gradient(135deg, #1c1917, #292524)",
                  boxShadow: debt > 0
                    ? "0 4px 24px rgba(220,38,38,0.3)"
                    : "0 4px 24px rgba(28,25,23,0.3)",
                }}
              >
                <LogOut size={20} strokeWidth={2.5} />
                {debt > 0 ? `Check Out (${cur} ${debt.toLocaleString()} owed)` : "Check Out"}
              </button>
            )}
            {isCheckedIn && showCheckoutConfirm && (
              <div className="rounded-2xl border border-red-200 bg-red-50/50 p-4 space-y-3">
                <div className="text-xs font-bold text-red-600">
                  Guest owes {cur} {debt.toLocaleString()}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      updateMutation.mutate({ amountPaid: totalPrice, paymentStatus: "paid", status: "checked_out" });
                      setShowCheckoutConfirm(false);
                      setShowBill(true);
                    }}
                    disabled={isBusy}
                    className="flex-1 py-3 rounded-xl text-white text-sm font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                    style={{ background: "#059669" }}
                  >
                    <CreditCard size={15} />
                    Settle & Check Out
                  </button>
                  <button
                    onClick={() => {
                      updateMutation.mutate({ status: "checked_out" });
                      setShowCheckoutConfirm(false);
                      setShowBill(true);
                    }}
                    disabled={isBusy}
                    className="flex-1 py-3 rounded-xl text-red-600 text-sm font-bold bg-red-100 hover:bg-red-200 flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                  >
                    Check Out Unpaid
                  </button>
                </div>
                <button
                  onClick={() => setShowCheckoutConfirm(false)}
                  className="w-full text-xs text-stone-400 hover:text-stone-600 text-center transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}
            {isCheckedOut && (
              <button
                onClick={() => updateMutation.mutate({ status: "checked_in" })}
                disabled={isBusy}
                className="w-full py-3 rounded-xl text-stone-500 text-sm font-semibold bg-stone-100 hover:bg-stone-200 flex items-center justify-center gap-2 transition-colors"
              >
                <Undo2 size={15} />
                Undo Checkout
              </button>
            )}
          </div>

          {/* ── PAYMENT CARD ── */}
          <div className="px-6 pb-5">
            <div className="rounded-2xl overflow-hidden border border-stone-200 bg-stone-50">

              {totalPrice > 0 ? (
                <>
                  {/* Receipt rows */}
                  <div className="px-5 pt-4 pb-3 space-y-2.5">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Payment</span>
                      {!showPriceEdit && (
                        <button
                          onClick={() => setShowPriceEdit(true)}
                          className="text-[10px] text-stone-400 hover:text-stone-600 transition-colors underline underline-offset-2"
                        >
                          edit price
                        </button>
                      )}
                    </div>

                    <div className="flex justify-between items-baseline">
                      <span className="text-sm text-stone-500">Total</span>
                      <span className="text-sm font-semibold text-stone-700 tabular-nums">
                        {cur} {totalPrice.toLocaleString()}
                      </span>
                    </div>

                    {amountPaid > 0 && (
                      <div className="flex justify-between items-baseline">
                        <span className="text-sm text-stone-500">Paid</span>
                        <span className="text-sm font-semibold text-emerald-600 tabular-nums">
                          − {cur} {amountPaid.toLocaleString()}
                        </span>
                      </div>
                    )}

                    {/* Divider */}
                    <div className="border-t border-stone-200 pt-2.5">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-bold text-stone-700">
                          {debt > 0 ? "Owed" : "Balance"}
                        </span>
                        <div className="flex items-center gap-3">
                          <span
                            className="text-xl font-extrabold tabular-nums tracking-tight"
                            style={{ color: debt > 0 && isActive ? "#dc2626" : "#059669" }}
                          >
                            {debt > 0 && isActive
                              ? `${cur} ${debt.toLocaleString()}`
                              : "Paid ✓"
                            }
                          </span>
                          {debt > 0 && isActive && (
                            <button
                              onClick={() => updateMutation.mutate({ amountPaid: totalPrice, paymentStatus: "paid" })}
                              disabled={isBusy}
                              className="text-xs font-bold px-3 py-1.5 rounded-lg text-white transition-colors disabled:opacity-50"
                              style={{ background: "#059669" }}
                            >
                              Paid all
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Quick payment input */}
                  {debt > 0 && isActive && (
                    <div className="px-5 pb-4 pt-1 space-y-2">
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-stone-400">
                            {cur}
                          </span>
                          <input
                            ref={payInputRef}
                            type="number"
                            min={0}
                            value={payAmount}
                            onChange={(e) => setPayAmount(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleAddPayment()}
                            placeholder="Amount received"
                            className="w-full pl-12 pr-4 py-3 rounded-xl border border-stone-200 bg-white text-sm font-semibold text-stone-800 placeholder:text-stone-300 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-colors"
                          />
                        </div>
                        <button
                          onClick={handleAddPayment}
                          disabled={isBusy || !payAmount}
                          className="px-5 py-3 rounded-xl text-white text-sm font-bold active:scale-[0.97] transition-all disabled:opacity-40"
                          style={{ background: "#059669" }}
                        >
                          Add
                        </button>
                      </div>
                      {/* Payment method */}
                      <div className="flex gap-1.5">
                        {(["cash", "card", "transfer"] as const).map(m => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => updateMutation.mutate({ paymentMethod: m })}
                            className={`flex-1 py-1.5 rounded-lg text-[10px] font-semibold transition-colors capitalize ${
                              reservation.paymentMethod === m
                                ? "bg-stone-800 text-white"
                                : "bg-stone-100 text-stone-500 hover:bg-stone-200"
                            }`}
                          >
                            {m}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Edit price form */}
                  {showPriceEdit && (
                    <div className="px-5 pb-4 pt-1 flex gap-2 items-end border-t border-stone-200">
                      <div className="flex-1">
                        <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-1.5">
                          Total Price ({cur})
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={priceInput}
                          onChange={(e) => setPriceInput(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleSavePrice()}
                          className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm font-semibold text-stone-800 focus:outline-none focus:ring-2 focus:ring-stone-800/10 bg-white"
                        />
                      </div>
                      <button
                        onClick={handleSavePrice}
                        className="px-4 py-2.5 bg-stone-800 text-white text-sm font-bold rounded-xl hover:bg-stone-900 transition-colors"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setShowPriceEdit(false)}
                        className="px-3 py-2.5 text-sm text-stone-400 hover:text-stone-600 transition-colors"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </>
              ) : (
                // No price set
                showPriceEdit ? (
                  <div className="px-5 py-4 flex gap-2 items-end">
                    <div className="flex-1">
                      <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-1.5">
                        Total Price ({cur})
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={priceInput}
                        onChange={(e) => setPriceInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleSavePrice()}
                        autoFocus
                        placeholder="0"
                        className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm font-semibold text-stone-800 focus:outline-none focus:ring-2 focus:ring-stone-800/10 bg-white"
                      />
                    </div>
                    <button
                      onClick={handleSavePrice}
                      className="px-4 py-2.5 bg-stone-800 text-white text-sm font-bold rounded-xl hover:bg-stone-900 transition-colors"
                    >
                      Save
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowPriceEdit(true)}
                    className="w-full py-4 text-sm text-stone-400 hover:text-stone-600 transition-colors text-center"
                  >
                    + Set room price
                  </button>
                )
              )}
            </div>

            {/* Grand balance across services */}
            {guestProfile?.totals && grandOwed > 0 && grandOwed !== debt && (
              <div className="mt-2.5 flex items-center gap-2.5 px-4 py-3 bg-amber-50 rounded-xl border border-amber-200">
                <AlertCircle size={14} className="text-amber-500 shrink-0" />
                <span className="text-xs font-semibold text-amber-700">
                  Total balance incl. tours & laundry: {cur} {grandOwed.toLocaleString()}
                </span>
              </div>
            )}
          </div>

          {/* ── TOTAL BILL ── */}
          {guestProfile && (
            <div className="px-6 pb-5">
              <button
                onClick={() => setShowBill(!showBill)}
                className={`w-full flex items-center justify-between px-5 py-3.5 rounded-2xl border text-sm font-semibold transition-all duration-150 ${
                  showBill
                    ? "bg-stone-800 border-stone-800 text-white"
                    : "bg-white border-stone-200 text-stone-600 hover:border-stone-300 hover:bg-stone-50"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Receipt size={16} />
                  Total Bill
                </div>
                <ChevronDown size={15} className={`transition-transform ${showBill ? "rotate-180 text-white/70" : "text-stone-400"}`} />
              </button>

              {showBill && (
                <div className="mt-2 rounded-2xl border border-stone-200 bg-stone-50 overflow-hidden">
                  {/* Room nights */}
                  {guestProfile.reservations?.length > 0 && (
                    <div className="px-5 pt-4 pb-2">
                      <div className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2">Accommodation</div>
                      {guestProfile.reservations.map((r) => {
                        const n = Math.max(1, Math.round((new Date(r.checkOut).getTime() - new Date(r.checkIn).getTime()) / 86400000));
                        const perN = (r.totalPrice || 0) > 0 ? (r.totalPrice! / n) : 0;
                        return (
                          <div key={r.id} className="flex justify-between items-baseline py-1.5">
                            <div>
                              <span className="text-sm text-stone-700">{n} night{n !== 1 ? "s" : ""}</span>
                              <span className="text-xs text-stone-400 ml-2">
                                {format(new Date(r.checkIn + "T12:00:00"), "d MMM")} → {format(new Date(r.checkOut + "T12:00:00"), "d MMM")}
                              </span>
                              {perN > 0 && <span className="text-xs text-stone-400 ml-1">({cur} {perN.toLocaleString()}/n)</span>}
                            </div>
                            <span className="text-sm font-semibold text-stone-700 tabular-nums">{cur} {(r.totalPrice || 0).toLocaleString()}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Tours */}
                  {guestProfile.tours?.length > 0 && (
                    <div className="px-5 pt-3 pb-2 border-t border-stone-200">
                      <div className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2">Tours</div>
                      {guestProfile.tours.map((t) => (
                        <div key={t.id} className="flex justify-between items-baseline py-1.5">
                          <div>
                            <span className="text-sm text-stone-700">{t.tourName || "Tour"}</span>
                            {t.numPeople > 1 && <span className="text-xs text-stone-400 ml-1">× {t.numPeople}</span>}
                            {t.tourDate && <span className="text-xs text-stone-400 ml-2">{format(new Date(t.tourDate + "T12:00:00"), "d MMM")}</span>}
                          </div>
                          <span className="text-sm font-semibold text-stone-700 tabular-nums">{cur} {t.totalPrice.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Laundry */}
                  {guestProfile.laundry?.length > 0 && (
                    <div className="px-5 pt-3 pb-2 border-t border-stone-200">
                      <div className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2">Laundry</div>
                      {guestProfile.laundry.map((l) => (
                        <div key={l.id} className="flex justify-between items-baseline py-1.5">
                          <div>
                            <span className="text-sm text-stone-700">{l.items || "Laundry"}</span>
                            {l.weight && <span className="text-xs text-stone-400 ml-1">({l.weight}kg)</span>}
                          </div>
                          <span className="text-sm font-semibold text-stone-700 tabular-nums">{cur} {l.price.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Grand totals */}
                  <div className="px-5 pt-3 pb-4 border-t-2 border-stone-300 bg-white">
                    <div className="flex justify-between items-baseline">
                      <span className="text-sm font-bold text-stone-800">Grand Total</span>
                      <span className="text-base font-extrabold text-stone-800 tabular-nums">
                        {cur} {guestProfile.totals.grand.total.toLocaleString()}
                      </span>
                    </div>
                    {guestProfile.totals.grand.paid > 0 && (
                      <div className="flex justify-between items-baseline mt-1">
                        <span className="text-sm text-emerald-600">Paid</span>
                        <span className="text-sm font-semibold text-emerald-600 tabular-nums">
                          − {cur} {guestProfile.totals.grand.paid.toLocaleString()}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between items-baseline mt-1">
                      <span className="text-sm font-bold" style={{ color: guestProfile.totals.grand.owed > 0 ? "#dc2626" : "#059669" }}>
                        {guestProfile.totals.grand.owed > 0 ? "Balance Due" : "Balance"}
                      </span>
                      <span className="text-lg font-extrabold tabular-nums" style={{ color: guestProfile.totals.grand.owed > 0 ? "#dc2626" : "#059669" }}>
                        {guestProfile.totals.grand.owed > 0
                          ? `${cur} ${guestProfile.totals.grand.owed.toLocaleString()}`
                          : "Paid ✓"}
                      </span>
                    </div>
                  </div>

                  {/* Print button */}
                  <div className="px-5 py-3 border-t border-stone-200 bg-stone-50">
                    <button
                      onClick={handlePrintBill}
                      className="w-full py-2.5 rounded-xl text-sm font-semibold text-stone-600 bg-white border border-stone-200 hover:bg-stone-100 flex items-center justify-center gap-2 transition-colors"
                    >
                      <Printer size={15} />
                      Print Bill
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── EXTEND STAY ── */}
          {!isCancelled && !isNoShow && (
            <div className="px-6 pb-5">
              <button
                onClick={() => { setShowExtend(!showExtend); setExtendError(""); }}
                className={`w-full flex items-center justify-between px-5 py-3.5 rounded-2xl border text-sm font-semibold transition-all duration-150 ${
                  showExtend
                    ? "bg-blue-600 border-blue-600 text-white"
                    : "bg-white border-stone-200 text-stone-600 hover:border-stone-300 hover:bg-stone-50"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <CalendarPlus size={16} />
                  Extend Stay
                </div>
                <div className="flex items-center gap-2">
                  {!showExtend && (
                    <span className="text-xs text-stone-400">
                      until {format(parseISO(reservation.checkOut), "d MMM")}
                    </span>
                  )}
                  <ChevronDown size={15} className={`transition-transform ${showExtend ? "rotate-180 text-white/70" : "text-stone-400"}`} />
                </div>
              </button>

              {showExtend && (
                <div className="mt-2 p-4 bg-blue-50 rounded-2xl border border-blue-100 space-y-4">
                  {/* Night selector */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-stone-500">
                      <Moon size={14} className="text-blue-400" />
                      Extra nights
                    </div>
                    <div className="flex gap-1.5">
                      {[1, 2, 3, 5, 7].map((n) => (
                        <button
                          key={n}
                          onClick={() => setExtendNights(n)}
                          className={`w-9 h-9 rounded-xl text-sm font-bold transition-all ${
                            extendNights === n
                              ? "bg-blue-600 text-white shadow-sm"
                              : "bg-white text-stone-600 border border-stone-200 hover:border-blue-300"
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Summary */}
                  <div className="text-sm text-center text-stone-500">
                    New checkout:{" "}
                    <span className="font-bold text-stone-800">
                      {format(addDays(parseISO(reservation.checkOut), extendNights), "EEE, d MMM")}
                    </span>
                    {perNight > 0 && (
                      <span className="text-stone-400 ml-2">
                        +{cur} {(perNight * extendNights).toLocaleString()}
                      </span>
                    )}
                  </div>

                  {extendError && (
                    <div className="flex items-center gap-2 text-xs text-red-600 font-medium bg-red-50 rounded-lg px-3 py-2 border border-red-100">
                      <AlertCircle size={12} className="shrink-0" />
                      {extendError}
                    </div>
                  )}

                  <button
                    onClick={() => { setExtendError(""); extendMutation.mutate({ reservationId: reservation.id, newCheckOut: extendDate }); }}
                    disabled={extendMutation.isPending}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold active:scale-[0.98] transition-all disabled:opacity-60 shadow-sm shadow-blue-200"
                  >
                    {extendMutation.isPending ? "Extending…" : `Confirm — Add ${extendNights} Night${extendNights !== 1 ? "s" : ""}`}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── FOOTER: NO SHOW / CANCEL ── always visible for active reservations */}
        {isActive && (
          <div className="shrink-0 px-6 py-4 bg-stone-50 border-t border-stone-100 flex gap-3">
            {isConfirmed && (
              <button
                onClick={() => updateMutation.mutate({ status: "no_show" })}
                disabled={isBusy}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 transition-colors disabled:opacity-50"
              >
                <UserX size={15} />
                No Show
              </button>
            )}
            <button
              onClick={() => updateMutation.mutate({ status: "cancelled" })}
              disabled={isBusy}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 transition-colors disabled:opacity-50"
            >
              <Ban size={15} />
              Cancel
            </button>
          </div>
        )}
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
