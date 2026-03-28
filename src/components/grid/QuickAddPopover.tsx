"use client";

import { useState, useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format, addDays, parseISO } from "date-fns";
import { X, UserPlus, LogIn } from "lucide-react";
import { useLang } from "@/contexts/LanguageContext";

interface Props {
  bedId: string;
  date: string;       // clicked date (check-in)
  roomType: string;   // from the room — "mixed" | "female"
  onClose: () => void;
}

export function QuickAddPopover({ bedId, date, roomType, onClose }: Props) {
  const queryClient = useQueryClient();
  const ref = useRef<HTMLDivElement>(null);
  const { t } = useLang();

  const [guestName, setGuestName] = useState("");
  const [checkOut, setCheckOut] = useState(
    format(addDays(parseISO(date), 1), "yyyy-MM-dd")
  );
  const [nights, setNights] = useState(1);
  const [price, setPrice] = useState("");
  const [paymentStatus, setPaymentStatus] = useState<"unpaid" | "paid">("unpaid");
  const [error, setError] = useState("");

  // Keep nights and checkOut in sync
  function handleNightsChange(n: number) {
    const clamped = Math.max(1, n);
    setNights(clamped);
    setCheckOut(format(addDays(parseISO(date), clamped), "yyyy-MM-dd"));
  }

  function handleCheckOutChange(val: string) {
    setCheckOut(val);
    const diff = Math.round(
      (new Date(val).getTime() - new Date(date).getTime()) / 86400000
    );
    setNights(Math.max(1, diff));
  }

  const mutation = useMutation({
    mutationFn: (data: object) =>
      fetch("/api/assignments/quick-add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error || "Failed to create");
        return json;
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assignments"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      onClose();
    },
    onError: (err: Error) => setError(err.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!guestName.trim()) { setError("Guest name is required"); return; }
    if (checkOut <= date) { setError("Check-out must be after check-in"); return; }

    mutation.mutate({
      guestName: guestName.trim(),
      checkIn: date,
      checkOut,
      bedId,
      numGuests: 1,
      totalPrice: price ? parseFloat(price) : undefined,
      currency: "EUR",
      roomTypeReq: roomType === "female" ? "female" : "mixed",
      paymentStatus,
    });
  }

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute z-50 w-72 bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden"
      style={{ top: "calc(100% + 4px)", left: 0 }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-900 text-white">
        <div className="flex items-center gap-2">
          <UserPlus size={14} />
          <span className="text-sm font-semibold">{t("grid_add_guest")}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400 font-mono">{bedId}</span>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X size={14} />
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="p-4 space-y-3">
        {/* Guest name */}
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
            {t("res_guest")}
          </label>
          <input
            autoFocus
            type="text"
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            placeholder="Full name"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/20 bg-slate-50 focus:bg-white transition-colors"
          />
        </div>

        {/* Dates row */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
              {t("grid_checkin")}
            </label>
            <div className="px-3 py-2 bg-slate-100 rounded-lg text-sm font-medium text-slate-600 border border-slate-200">
              {format(parseISO(date), "MMM d, yyyy")}
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
              {t("grid_checkout")}
            </label>
            <input
              type="date"
              value={checkOut}
              min={format(addDays(parseISO(date), 1), "yyyy-MM-dd")}
              onChange={(e) => handleCheckOutChange(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-2 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/20 bg-slate-50 focus:bg-white transition-colors"
            />
          </div>
        </div>

        {/* Nights quick picker */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{t("grid_nights")}</span>
          <div className="flex items-center gap-1 ml-auto">
            {[1, 2, 3, 4, 5, 7].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => handleNightsChange(n)}
                className={`w-7 h-7 rounded-lg text-xs font-semibold transition-colors ${
                  nights === n
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Price + payment */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
              {t("grid_price")} (EUR)
            </label>
            <input
              type="number"
              min={0}
              step={0.01}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0.00"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/20 bg-slate-50 focus:bg-white transition-colors"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
              {t("grid_payment")}
            </label>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setPaymentStatus("unpaid")}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${
                  paymentStatus === "unpaid"
                    ? "bg-red-100 text-red-700 border border-red-200"
                    : "bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200"
                }`}
              >
                {t("grid_unpaid")}
              </button>
              <button
                type="button"
                onClick={() => setPaymentStatus("paid")}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${
                  paymentStatus === "paid"
                    ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                    : "bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200"
                }`}
              >
                {t("grid_paid")}
              </button>
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="text-xs text-red-600 font-medium px-3 py-2 bg-red-50 rounded-lg border border-red-100">
            {error}
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={mutation.isPending}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-bold hover:bg-slate-800 active:scale-[0.98] transition-all disabled:opacity-60"
        >
          {mutation.isPending ? (
            <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          ) : (
            <LogIn size={14} />
          )}
          {mutation.isPending ? t("grid_saving") : `${t("grid_add_walkin_btn")} · ${nights} ${nights !== 1 ? t("panel_nights") : t("panel_night")}`}
        </button>
      </form>
    </div>
  );
}
