"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, addDays, parseISO } from "date-fns";
import { useLang } from "@/contexts/LanguageContext";
import {
  X,
  LogIn,
  LogOut,
  CreditCard,
  AlertCircle,
  BedDouble,
  Calendar,
  User,
  Hash,
  Clock,
  MinusCircle,
  CheckCircle2,
  XCircle,
  CalendarPlus,
  ChevronDown,
  ChevronUp,
  MapPin,
  Shirt,
  FileText,
  Wallet,
  Moon,
} from "lucide-react";

interface GuestProfile {
  id: number;
  name: string;
  idNumber: string | null;
  phone: string | null;
  nationality: string | null;
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
  status: string;
  bedId?: string;
}

interface Props {
  reservation: Reservation;
  onClose: () => void;
}

const SOURCE_COLORS: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  "booking.com": { bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500", label: "Booking.com" },
  hostelworld: { bg: "bg-orange-50", text: "text-orange-700", dot: "bg-orange-500", label: "Hostelworld" },
  manual: { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500", label: "Walk-in" },
};

const PAYMENT_CONFIG = {
  unpaid: { label: "Unpaid", bg: "bg-red-100", text: "text-red-700", dot: "bg-red-500" },
  partial: { label: "Partial", bg: "bg-amber-100", text: "text-amber-700", dot: "bg-amber-500" },
  paid: { label: "Paid", bg: "bg-emerald-100", text: "text-emerald-700", dot: "bg-emerald-500" },
  refunded: { label: "Refunded", bg: "bg-slate-200", text: "text-slate-600", dot: "bg-slate-400" },
};

export function GuestDetailPanel({ reservation, onClose }: Props) {
  const queryClient = useQueryClient();
  const { t } = useLang();
  const [priceInput, setPriceInput] = useState(reservation.totalPrice?.toString() || "");
  const [paidInput, setPaidInput] = useState(reservation.amountPaid?.toString() || "0");
  const [showExtend, setShowExtend] = useState(false);
  const [extendCheckOut, setExtendCheckOut] = useState(
    format(addDays(parseISO(reservation.checkOut), 1), "yyyy-MM-dd")
  );
  const [extendNights, setExtendNights] = useState(1);
  const [extendError, setExtendError] = useState("");

  const [idInput, setIdInput] = useState("");
  const [showIdEdit, setShowIdEdit] = useState(false);

  const { data: guestProfile } = useQuery<GuestProfile>({
    queryKey: ["guest-profile", reservation.guestId],
    queryFn: () => fetch(`/api/guests/${reservation.guestId}`).then((r) => r.json()),
    enabled: !!reservation.guestId,
  });

  useEffect(() => {
    if (guestProfile?.idNumber) setIdInput(guestProfile.idNumber);
  }, [guestProfile?.idNumber]);

  useEffect(() => {
    setPriceInput(reservation.totalPrice?.toString() || "");
    setPaidInput(reservation.amountPaid?.toString() || "0");
  }, [reservation.totalPrice, reservation.amountPaid]);

  const updateMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch(`/api/reservations/${reservation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
      queryClient.invalidateQueries({ queryKey: ["assignments"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
    },
  });

  const updateGuestMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch(`/api/guests/${reservation.guestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["guest-profile", reservation.guestId] });
      setShowIdEdit(false);
    },
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
    onSuccess: (data) => {
      setPriceInput(data.newTotalPrice?.toString() || priceInput);
      setShowExtend(false);
      setExtendError("");
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
      queryClient.invalidateQueries({ queryKey: ["assignments"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
    },
    onError: (err: Error) => setExtendError(err.message),
  });

  const nights = Math.max(
    1,
    Math.round(
      (new Date(reservation.checkOut).getTime() - new Date(reservation.checkIn).getTime()) /
        86400000
    )
  );

  const totalPrice = reservation.totalPrice ?? 0;
  const amountPaid = reservation.amountPaid ?? 0;
  const debt = Math.max(0, totalPrice - amountPaid);
  const perNightRate = totalPrice > 0 && nights > 0 ? totalPrice / nights : 0;

  function handleExtendNightsChange(n: number) {
    const clamped = Math.max(1, n);
    setExtendNights(clamped);
    setExtendCheckOut(format(addDays(parseISO(reservation.checkOut), clamped), "yyyy-MM-dd"));
  }
  function handleExtendCheckOutChange(val: string) {
    setExtendCheckOut(val);
    const diff = Math.round(
      (new Date(val).getTime() - new Date(reservation.checkOut).getTime()) / 86400000
    );
    setExtendNights(Math.max(1, diff));
  }

  const isConfirmed = reservation.status === "confirmed";
  const isCheckedIn = reservation.status === "checked_in";
  const isCheckedOut = reservation.status === "checked_out";
  const isCancelled = reservation.status === "cancelled";
  const isNoShow = reservation.status === "no_show";
  const canExtend = !isCancelled && !isNoShow;

  const src = SOURCE_COLORS[reservation.source] || SOURCE_COLORS.manual;
  const payConfig = PAYMENT_CONFIG[reservation.paymentStatus as keyof typeof PAYMENT_CONFIG] || PAYMENT_CONFIG.unpaid;

  const initials = reservation.guestName
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const grandOwed = guestProfile?.totals.grand.owed ?? 0;
  const grandTotal = guestProfile?.totals.grand.total ?? 0;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 backdrop-blur-[2px] z-40"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed left-16 top-0 bottom-0 w-full max-w-[420px] bg-white shadow-2xl z-50 flex flex-col overflow-hidden">

        {/* ── HEADER ── */}
        <div className="px-5 pt-5 pb-4 border-b border-slate-100 bg-white">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className={`w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 ${
                isCheckedIn ? "bg-emerald-600" : isCheckedOut ? "bg-slate-500" : "bg-slate-900"
              }`}>
                {initials}
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900 leading-tight">
                  {reservation.guestName}
                </h2>
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${src.bg} ${src.text}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${src.dot}`} />
                    {src.label}
                  </span>
                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${payConfig.bg} ${payConfig.text}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${payConfig.dot}`} />
                    {payConfig.label}
                  </span>
                  {reservation.externalId && (
                    <span className="text-[10px] text-slate-400 font-mono">#{reservation.externalId}</span>
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors shrink-0 mt-0.5"
            >
              <X size={18} />
            </button>
          </div>

          {/* Key info strip */}
          <div className="grid grid-cols-4 gap-1.5">
            <div className="flex flex-col items-center justify-center bg-slate-50 rounded-xl px-2 py-2.5 border border-slate-200">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Check-in</span>
              <span className="text-xs font-bold text-slate-800 mt-0.5">
                {format(new Date(reservation.checkIn + "T12:00:00"), "MMM d")}
              </span>
            </div>
            <div className="flex flex-col items-center justify-center bg-slate-50 rounded-xl px-2 py-2.5 border border-slate-200">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Nights</span>
              <span className="text-xs font-bold text-slate-800 mt-0.5">{nights}</span>
            </div>
            <div className="flex flex-col items-center justify-center bg-slate-50 rounded-xl px-2 py-2.5 border border-slate-200">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Guests</span>
              <span className="text-xs font-bold text-slate-800 mt-0.5">{reservation.numGuests}</span>
            </div>
            <div className={`flex flex-col items-center justify-center rounded-xl px-2 py-2.5 border ${
              debt > 0 && !isCancelled && !isCheckedOut
                ? "bg-red-50 border-red-200"
                : "bg-slate-50 border-slate-200"
            }`}>
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Owed</span>
              <span className={`text-xs font-bold mt-0.5 ${
                debt > 0 && !isCancelled && !isCheckedOut ? "text-red-700" : "text-emerald-600"
              }`}>
                {debt > 0 && !isCancelled && !isCheckedOut
                  ? `${reservation.currency || "EUR"} ${debt.toFixed(0)}`
                  : "Paid"}
              </span>
            </div>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">

          {/* ── CHECK-IN / CHECK-OUT ACTIONS ── */}
          <div className="px-4 py-4">
            <SectionLabel>Status</SectionLabel>

            {/* Status pill */}
            <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl mb-3 ${
              isCheckedIn ? "bg-emerald-50 border border-emerald-200"
              : isCheckedOut ? "bg-slate-100 border border-slate-200"
              : isCancelled || isNoShow ? "bg-red-50 border border-red-200"
              : "bg-indigo-50 border border-indigo-200"
            }`}>
              {isCheckedIn ? <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
              : isCheckedOut ? <LogOut size={14} className="text-slate-500 shrink-0" />
              : isCancelled ? <XCircle size={14} className="text-red-500 shrink-0" />
              : isNoShow ? <MinusCircle size={14} className="text-red-500 shrink-0" />
              : <Clock size={14} className="text-indigo-500 shrink-0" />}
              <span className={`text-sm font-semibold ${
                isCheckedIn ? "text-emerald-700"
                : isCheckedOut ? "text-slate-600"
                : isCancelled ? "text-red-700"
                : isNoShow ? "text-red-600"
                : "text-indigo-700"
              }`}>
                {isCheckedIn ? t("grid_checked_in")
                : isCheckedOut ? t("grid_checked_out")
                : isCancelled ? t("panel_cancelled")
                : isNoShow ? t("grid_no_show")
                : t("panel_awaiting")}
              </span>
              <span className="ml-auto text-[10px] font-mono text-slate-400">
                {nights}n · {reservation.numGuests}g
              </span>
            </div>

            {/* Primary action button */}
            {!isCancelled && !isNoShow && (
              <div className="space-y-2">
                {isConfirmed && (
                  <button
                    onClick={() => updateMutation.mutate({ status: "checked_in" })}
                    disabled={updateMutation.isPending}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 active:scale-[0.98] transition-all shadow-sm disabled:opacity-60"
                  >
                    <LogIn size={16} />
                    {t("panel_checkin_btn")}
                  </button>
                )}
                {isCheckedIn && (
                  <button
                    onClick={() => updateMutation.mutate({ status: "checked_out" })}
                    disabled={updateMutation.isPending}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-slate-800 text-white rounded-xl text-sm font-bold hover:bg-slate-900 active:scale-[0.98] transition-all shadow-sm disabled:opacity-60"
                  >
                    <LogOut size={16} />
                    {t("panel_checkout_btn")}
                  </button>
                )}
                {(isConfirmed || isCheckedIn) && (
                  <div className="grid grid-cols-2 gap-2">
                    {isConfirmed && (
                      <button
                        onClick={() => updateMutation.mutate({ status: "no_show" })}
                        disabled={updateMutation.isPending}
                        className="flex items-center justify-center gap-1.5 py-2.5 bg-amber-50 text-amber-700 rounded-xl text-xs font-semibold hover:bg-amber-100 border border-amber-200 transition-colors"
                      >
                        <MinusCircle size={13} />
                        {t("panel_no_show")}
                      </button>
                    )}
                    <button
                      onClick={() => updateMutation.mutate({ status: "cancelled" })}
                      disabled={updateMutation.isPending}
                      className={`flex items-center justify-center gap-1.5 py-2.5 bg-red-50 text-red-600 rounded-xl text-xs font-semibold hover:bg-red-100 border border-red-200 transition-colors ${isCheckedIn ? "col-span-2" : ""}`}
                    >
                      <XCircle size={13} />
                      {t("panel_cancel")}
                    </button>
                  </div>
                )}
              </div>
            )}
            {isCheckedOut && (
              <button
                onClick={() => updateMutation.mutate({ status: "confirmed" })}
                disabled={updateMutation.isPending}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-xs font-semibold hover:bg-slate-200 transition-colors border border-slate-200"
              >
                {t("panel_undo_checkout")}
              </button>
            )}
          </div>

          {/* ── PAYMENT ── */}
          <div className="px-4 py-4">
            <SectionLabel icon={<CreditCard size={11} />}>Room Payment</SectionLabel>

            {/* Outstanding balance inline alert */}
            {debt > 0 && !isCheckedOut && !isCancelled && (
              <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-xl mb-3">
                <AlertCircle size={13} className="text-red-500 shrink-0" />
                <span className="text-xs font-semibold text-red-700">
                  {reservation.currency || "EUR"} {debt.toFixed(2)} outstanding
                </span>
                {amountPaid > 0 && (
                  <span className="text-[10px] text-red-500 ml-auto">
                    {amountPaid.toFixed(2)} / {totalPrice.toFixed(2)} paid
                  </span>
                )}
              </div>
            )}

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1.5">
                    {t("panel_total_price")} ({reservation.currency || "EUR"})
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={priceInput}
                    onChange={(e) => setPriceInput(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/20 bg-slate-50 focus:bg-white transition-colors"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1.5">
                    {t("panel_amount_paid")} ({reservation.currency || "EUR"})
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={paidInput}
                    onChange={(e) => setPaidInput(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/20 bg-slate-50 focus:bg-white transition-colors"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    const price = parseFloat(priceInput);
                    const paid = parseFloat(paidInput);
                    const updates: Record<string, unknown> = {};
                    if (!isNaN(price)) updates.totalPrice = price;
                    if (!isNaN(paid)) {
                      updates.amountPaid = paid;
                      const total = !isNaN(price) ? price : totalPrice;
                      updates.paymentStatus =
                        paid <= 0 ? "unpaid" : paid >= total && total > 0 ? "paid" : "partial";
                    }
                    if (Object.keys(updates).length > 0) updateMutation.mutate(updates);
                  }}
                  disabled={updateMutation.isPending}
                  className="flex items-center justify-center gap-2 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-bold hover:bg-slate-800 active:scale-[0.98] transition-all shadow-sm disabled:opacity-60"
                >
                  {updateMutation.isPending ? (
                    <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  ) : (
                    <CreditCard size={14} />
                  )}
                  {updateMutation.isPending ? t("common_saving") : t("panel_save_payment")}
                </button>

                {reservation.paymentStatus !== "paid" && totalPrice > 0 && (
                  <button
                    onClick={() => {
                      setPaidInput(totalPrice.toFixed(2));
                      updateMutation.mutate({ paymentStatus: "paid", amountPaid: totalPrice });
                    }}
                    disabled={updateMutation.isPending}
                    className="flex items-center justify-center gap-2 py-2.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-sm font-semibold hover:bg-emerald-100 transition-colors"
                  >
                    <CheckCircle2 size={14} />
                    {t("panel_mark_paid")}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* ── GUEST INFO ── */}
          <div className="px-4 py-4">
            <SectionLabel icon={<User size={11} />}>Guest Info</SectionLabel>

            <div className="space-y-2">
              {/* ID / Passport + Stay details in one compact grid */}
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2 flex items-center gap-3 px-3 py-2.5 bg-slate-50 rounded-xl border border-slate-200">
                  <FileText size={13} className="text-slate-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">ID / Passport</div>
                    {showIdEdit ? (
                      <div className="flex items-center gap-2 mt-1">
                        <input
                          type="text"
                          value={idInput}
                          onChange={(e) => setIdInput(e.target.value)}
                          placeholder="Passport or ID number"
                          className="flex-1 min-w-0 border border-slate-200 rounded-lg px-2.5 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 bg-white"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") updateGuestMutation.mutate({ idNumber: idInput });
                            if (e.key === "Escape") setShowIdEdit(false);
                          }}
                        />
                        <button
                          onClick={() => updateGuestMutation.mutate({ idNumber: idInput })}
                          disabled={updateGuestMutation.isPending}
                          className="px-2.5 py-1 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 disabled:opacity-50"
                        >
                          Save
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowIdEdit(true)}
                        className="text-sm text-slate-700 hover:text-indigo-600 transition-colors text-left w-full mt-0.5"
                      >
                        {guestProfile?.idNumber || <span className="text-slate-400 italic text-xs">Tap to add ID number</span>}
                      </button>
                    )}
                  </div>
                </div>

                <div className="px-3 py-2.5 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="text-[10px] font-semibold text-slate-400 uppercase">Check-in</div>
                  <div className="text-xs font-semibold text-slate-700 mt-0.5">
                    {format(new Date(reservation.checkIn + "T12:00:00"), "EEE, MMM d")}
                  </div>
                </div>
                <div className="px-3 py-2.5 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="text-[10px] font-semibold text-slate-400 uppercase">Check-out</div>
                  <div className="text-xs font-semibold text-slate-700 mt-0.5">
                    {format(new Date(reservation.checkOut + "T12:00:00"), "EEE, MMM d")}
                  </div>
                </div>
                <div className="px-3 py-2.5 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="text-[10px] font-semibold text-slate-400 uppercase">Duration</div>
                  <div className="text-xs font-semibold text-slate-700 mt-0.5">{nights} night{nights !== 1 ? "s" : ""}</div>
                </div>
                <div className="px-3 py-2.5 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="text-[10px] font-semibold text-slate-400 uppercase">Guests</div>
                  <div className="text-xs font-semibold text-slate-700 mt-0.5">{reservation.numGuests} guest{reservation.numGuests !== 1 ? "s" : ""}</div>
                </div>
                {guestProfile?.nationality && (
                  <div className="px-3 py-2.5 bg-slate-50 rounded-xl border border-slate-200 col-span-2">
                    <div className="text-[10px] font-semibold text-slate-400 uppercase">Nationality</div>
                    <div className="text-xs font-semibold text-slate-700 mt-0.5">{guestProfile.nationality}</div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── ACCOUNT SUMMARY (Room + Tours + Laundry) ── */}
          {guestProfile?.totals && grandTotal > 0 && (
            <div className="px-4 py-4">
              <SectionLabel icon={<Wallet size={11} />}>Account Summary</SectionLabel>

              {/* Grand total card */}
              <div className={`rounded-xl p-3 mb-3 ${
                grandOwed > 0 ? "bg-red-50 border border-red-200" : "bg-emerald-50 border border-emerald-200"
              }`}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5">
                      Total Balance
                    </div>
                    <div className={`text-xl font-bold ${grandOwed > 0 ? "text-red-700" : "text-emerald-600"}`}>
                      {grandOwed > 0
                        ? `${reservation.currency || "VND"} ${grandOwed.toLocaleString()} owed`
                        : "Fully Paid"}
                    </div>
                  </div>
                  {grandOwed > 0
                    ? <AlertCircle size={22} className="text-red-300" />
                    : <CheckCircle2 size={22} className="text-emerald-400" />}
                </div>
                <div className="mt-1.5 pt-1.5 border-t border-black/5 text-xs text-slate-500 flex gap-3">
                  <span>Total <span className="font-semibold text-slate-700">{reservation.currency || "VND"} {guestProfile.totals.grand.total.toLocaleString()}</span></span>
                  <span>Paid <span className="font-semibold text-emerald-600">{reservation.currency || "VND"} {guestProfile.totals.grand.paid.toLocaleString()}</span></span>
                </div>
              </div>

              {/* Line items */}
              <div className="space-y-1">
                <TotalRow icon={<BedDouble size={13} className="text-indigo-500" />} label="Room" total={guestProfile.totals.room.total} paid={guestProfile.totals.room.paid} currency={reservation.currency || "VND"} />
                <TotalRow icon={<MapPin size={13} className="text-orange-500" />} label="Tours" total={guestProfile.totals.tours.total} paid={guestProfile.totals.tours.paid} currency={reservation.currency || "VND"} />
                <TotalRow icon={<Shirt size={13} className="text-blue-500" />} label="Laundry" total={guestProfile.totals.laundry.total} paid={guestProfile.totals.laundry.paid} currency={reservation.currency || "VND"} />
              </div>
            </div>
          )}

          {/* ── EXTEND STAY ── */}
          {canExtend && (
            <div className="px-4 py-4">
              <SectionLabel>Extend Stay</SectionLabel>

              <button
                onClick={() => { setShowExtend(!showExtend); setExtendError(""); }}
                className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border transition-all ${
                  showExtend
                    ? "bg-indigo-600 border-indigo-600 text-white shadow-md"
                    : "bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <CalendarPlus size={15} />
                  <span className="text-sm font-semibold">
                    {showExtend ? "Cancel Extension" : "Extend Stay"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {!showExtend && (
                    <span className="text-xs opacity-70 font-medium">
                      Until {format(parseISO(reservation.checkOut), "MMM d")}
                    </span>
                  )}
                  {showExtend ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </div>
              </button>

              {showExtend && (
                <div className="mt-3 space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
                      <div className="text-[10px] font-semibold text-slate-400 uppercase mb-1">Current check-out</div>
                      <div className="text-sm font-bold text-slate-700">
                        {format(parseISO(reservation.checkOut), "EEE, MMM d")}
                      </div>
                    </div>
                    <div className="bg-indigo-50 rounded-xl p-3 border border-indigo-200">
                      <div className="text-[10px] font-semibold text-indigo-500 uppercase mb-1">New check-out</div>
                      <input
                        type="date"
                        value={extendCheckOut}
                        min={format(addDays(parseISO(reservation.checkOut), 1), "yyyy-MM-dd")}
                        onChange={(e) => handleExtendCheckOutChange(e.target.value)}
                        className="w-full text-sm font-bold text-indigo-700 bg-transparent focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Moon size={13} className="text-slate-400" />
                    <span className="text-xs font-semibold text-slate-500">Add nights:</span>
                    <div className="flex gap-1.5 ml-auto">
                      {[1, 2, 3, 4, 5, 7].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => handleExtendNightsChange(n)}
                          className={`w-8 h-8 rounded-lg text-xs font-bold transition-colors ${
                            extendNights === n
                              ? "bg-indigo-600 text-white shadow-sm"
                              : "bg-slate-100 text-slate-600 hover:bg-indigo-50 hover:text-indigo-700"
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 space-y-1.5 text-xs">
                    {perNightRate > 0 && (
                      <div className="flex justify-between text-slate-500">
                        <span>Rate per night</span>
                        <span className="font-semibold text-slate-700">{reservation.currency || "EUR"} {perNightRate.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-slate-500">
                      <span>Extra nights</span>
                      <span className="font-semibold text-slate-700">× {extendNights}</span>
                    </div>
                    {perNightRate > 0 && (
                      <>
                        <div className="flex justify-between font-bold text-slate-800 pt-1 border-t border-slate-200 text-sm">
                          <span>Additional charge</span>
                          <span className="text-indigo-600">{reservation.currency || "EUR"} {(perNightRate * extendNights).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-slate-500">
                          <span>New balance owed</span>
                          <span className="font-bold text-red-600">{reservation.currency || "EUR"} {Math.max(0, totalPrice + perNightRate * extendNights - amountPaid).toFixed(2)}</span>
                        </div>
                      </>
                    )}
                  </div>

                  {extendError && (
                    <div className="flex items-start gap-2 px-3 py-2.5 bg-red-50 rounded-xl border border-red-200 text-xs text-red-700 font-medium">
                      <AlertCircle size={13} className="shrink-0 mt-0.5" />
                      {extendError}
                    </div>
                  )}

                  <button
                    onClick={() => {
                      setExtendError("");
                      extendMutation.mutate({ reservationId: reservation.id, newCheckOut: extendCheckOut });
                    }}
                    disabled={extendMutation.isPending}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 active:scale-[0.98] transition-all shadow-sm disabled:opacity-60"
                  >
                    {extendMutation.isPending ? (
                      <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    ) : (
                      <CalendarPlus size={15} />
                    )}
                    {extendMutation.isPending
                      ? "Extending…"
                      : `Confirm — Add ${extendNights} Night${extendNights !== 1 ? "s" : ""}${perNightRate > 0 ? ` (+${reservation.currency || "EUR"} ${(perNightRate * extendNights).toFixed(2)})` : ""}`}
                  </button>
                </div>
              )}
            </div>
          )}

        </div>

        {/* Footer saving indicator */}
        {(updateMutation.isPending || extendMutation.isPending) && (
          <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex items-center gap-2">
            <div className="w-3.5 h-3.5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs text-slate-500 font-medium">Saving…</span>
          </div>
        )}
      </div>
    </>
  );
}

function SectionLabel({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 mb-3">
      {icon && <span className="text-slate-400">{icon}</span>}
      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{children}</span>
    </div>
  );
}

function TotalRow({
  icon,
  label,
  total,
  paid,
  currency,
}: {
  icon: React.ReactNode;
  label: string;
  total: number;
  paid: number;
  currency: string;
}) {
  const owed = Math.max(0, total - paid);
  if (total === 0) return null;
  return (
    <div className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-lg border border-slate-100">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-xs font-medium text-slate-600">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-slate-700">{currency} {total.toLocaleString()}</span>
        {owed > 0 ? (
          <span className="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
            {currency} {owed.toLocaleString()} owed
          </span>
        ) : (
          <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">paid</span>
        )}
      </div>
    </div>
  );
}
