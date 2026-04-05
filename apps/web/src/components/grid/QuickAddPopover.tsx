"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, addDays, parseISO, subDays } from "date-fns";
import { X, UserPlus, LogIn, Users, MoveHorizontal, CalendarPlus, RotateCcw } from "lucide-react";
import { useLang } from "@/contexts/LanguageContext";

interface Props {
  bedId: string;
  date: string;       // clicked date (check-in)
  roomType: string;   // from the room — "mixed" | "female"
  onClose: () => void;
}

interface GuestOption {
  reservationId: number;
  guestName: string;
  bedId: string;
  checkIn: string;
  checkOut: string;
  status: string;
}

export function QuickAddPopover({ bedId, date, roomType, onClose }: Props) {
  const queryClient = useQueryClient();
  const ref = useRef<HTMLDivElement>(null);
  const { t } = useLang();

  const [mode, setMode] = useState<"new" | "existing">("new");

  // ── New walk-in state ──────────────────────────────────────────────────────
  const [guestName, setGuestName] = useState("");
  const [checkOut, setCheckOut] = useState(
    format(addDays(parseISO(date), 1), "yyyy-MM-dd")
  );
  const [nights, setNights] = useState(1);
  const [price, setPrice] = useState("");
  const [paymentStatus, setPaymentStatus] = useState<"unpaid" | "paid" | "partial">("unpaid");
  const [amountPaid, setAmountPaid] = useState("");
  const [phone, setPhone] = useState("");
  const [nationality, setNationality] = useState("");
  const [error, setError] = useState("");

  // ── Existing guest state ───────────────────────────────────────────────────
  const [guestSearch, setGuestSearch] = useState("");
  const [selected, setSelected] = useState<GuestOption | null>(null);
  const [rebookMode, setRebookMode] = useState(false);
  const [rebookNights, setRebookNights] = useState(1);

  // Fetch assignments for existing guest picker
  const rangeFrom = format(subDays(new Date(), 30), "yyyy-MM-dd");
  const rangeTo   = format(addDays(new Date(), 90), "yyyy-MM-dd");

  const { data: rawAssignments = [] } = useQuery<GuestOption[]>({
    queryKey: ["assignments", rangeFrom, rangeTo],
    queryFn: () =>
      fetch(`/api/assignments?from=${rangeFrom}&to=${rangeTo}`).then((r) => r.json()),
    enabled: mode === "existing",
    staleTime: 30_000,
  });

  // Deduplicate by reservationId; skip cancelled
  const guestOptions = useMemo(() => {
    const map = new Map<number, GuestOption>();
    for (const a of rawAssignments) {
      if (a.status === "cancelled") continue;
      const existing = map.get(a.reservationId);
      if (!existing || a.checkIn > existing.checkIn) map.set(a.reservationId, a);
    }
    const all = [...map.values()].sort((a, b) =>
      a.guestName.localeCompare(b.guestName)
    );
    if (!guestSearch.trim()) return all;
    const q = guestSearch.toLowerCase();
    return all.filter((a) => a.guestName.toLowerCase().includes(q));
  }, [rawAssignments, guestSearch]);

  // ── Sync nights ↔ checkOut ────────────────────────────────────────────────
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

  // ── Mutations ─────────────────────────────────────────────────────────────
  const createMutation = useMutation({
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

  const moveMutation = useMutation({
    mutationFn: (data: object) =>
      fetch("/api/assignments/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error || "Failed to move");
        return json;
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assignments"] });
      onClose();
    },
    onError: (err: Error) => setError(err.message),
  });

  const extendMutation = useMutation({
    mutationFn: (data: object) =>
      fetch("/api/assignments/extend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error || "Failed to extend");
        return json;
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assignments"] });
      onClose();
    },
    onError: (err: Error) => setError(err.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!guestName.trim()) { setError("Guest name is required"); return; }
    if (checkOut <= date)  { setError("Check-out must be after check-in"); return; }
    createMutation.mutate({
      guestName: guestName.trim(),
      checkIn: date,
      checkOut,
      bedId,
      numGuests: 1,
      totalPrice: price ? parseFloat(price) : undefined,
      currency: "VND",
      roomTypeReq: roomType === "female" ? "female" : "mixed",
      paymentStatus,
      ...(paymentStatus === "partial" && amountPaid ? { amountPaid: parseFloat(amountPaid) } : {}),
      ...(phone.trim() ? { phone: phone.trim() } : {}),
      ...(nationality.trim() ? { nationality: nationality.trim() } : {}),
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

  const existingPending = moveMutation.isPending || extendMutation.isPending || createMutation.isPending;
  // newCheckOut is the day after the clicked date (1 extra night)
  const newCheckOut = format(addDays(parseISO(date), 1), "yyyy-MM-dd");
  // Can extend if the clicked date is at or after the guest's check-in
  const canExtend = selected ? date >= selected.checkIn : false;

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

      {/* Mode tabs */}
      <div className="flex border-b border-slate-200 bg-slate-50">
        <button
          onClick={() => { setMode("new"); setError(""); }}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold transition-colors border-b-2 ${
            mode === "new"
              ? "bg-white text-slate-900 border-slate-900"
              : "text-slate-500 hover:text-slate-700 border-transparent"
          }`}
        >
          <UserPlus size={11} /> New Walk-in
        </button>
        <button
          onClick={() => { setMode("existing"); setError(""); setSelected(null); }}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold transition-colors border-b-2 ${
            mode === "existing"
              ? "bg-white text-slate-900 border-slate-900"
              : "text-slate-500 hover:text-slate-700 border-transparent"
          }`}
        >
          <Users size={11} /> Existing Guest
        </button>
      </div>

      {mode === "new" ? (
        /* ── New walk-in form ───────────────────────────────────────────── */
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

          {/* Phone + Nationality */}
          <div className="grid grid-cols-2 gap-2">
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Phone"
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/20 bg-slate-50 focus:bg-white transition-colors"
            />
            <input
              type="text"
              value={nationality}
              onChange={(e) => setNationality(e.target.value)}
              placeholder="Nationality"
              list="nat-list"
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/20 bg-slate-50 focus:bg-white transition-colors"
            />
            <datalist id="nat-list">
              {["Vietnam","Australia","UK","USA","Germany","France","Japan","South Korea","China","Canada","Netherlands","Sweden","Denmark","Italy","Spain","Brazil","India","Thailand","Singapore","Malaysia","Indonesia","Philippines","New Zealand","Ireland"].map(n => <option key={n} value={n} />)}
            </datalist>
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
                {t("grid_price")} (VND)
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
              <div className="flex gap-1">
                {(["unpaid", "partial", "paid"] as const).map((ps) => (
                  <button
                    key={ps}
                    type="button"
                    onClick={() => setPaymentStatus(ps)}
                    className={`flex-1 py-2 rounded-lg text-[10px] font-semibold transition-colors ${
                      paymentStatus === ps
                        ? ps === "paid" ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                          : ps === "partial" ? "bg-amber-100 text-amber-700 border border-amber-200"
                          : "bg-red-100 text-red-700 border border-red-200"
                        : "bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200"
                    }`}
                  >
                    {ps === "unpaid" ? t("grid_unpaid") : ps === "paid" ? t("grid_paid") : "Partial"}
                  </button>
                ))}
              </div>
              {paymentStatus === "partial" && (
                <input
                  type="number"
                  min={0}
                  value={amountPaid}
                  onChange={(e) => setAmountPaid(e.target.value)}
                  placeholder="Amount paid"
                  className="w-full mt-1.5 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/20 bg-slate-50 focus:bg-white transition-colors"
                />
              )}
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
            disabled={createMutation.isPending}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-bold hover:bg-slate-800 active:scale-[0.98] transition-all disabled:opacity-60"
          >
            {createMutation.isPending ? (
              <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : (
              <LogIn size={14} />
            )}
            {createMutation.isPending
              ? t("grid_saving")
              : `${t("grid_add_walkin_btn")} · ${nights} ${nights !== 1 ? t("panel_nights") : t("panel_night")}`}
          </button>
        </form>
      ) : (
        /* ── Existing guest picker ──────────────────────────────────────── */
        <div className="p-3 space-y-2">
          <input
            autoFocus
            type="text"
            value={guestSearch}
            onChange={(e) => { setGuestSearch(e.target.value); setSelected(null); }}
            placeholder="Search guests..."
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/20 bg-slate-50"
          />

          {/* Guest list */}
          <div className="max-h-52 overflow-y-auto space-y-0.5">
            {guestOptions.length === 0 && (
              <div className="text-xs text-slate-400 text-center py-6">No guests found</div>
            )}
            {guestOptions.map((g) => {
              const isSelected = selected?.reservationId === g.reservationId;
              return (
                <button
                  key={g.reservationId}
                  onClick={() => { setSelected(isSelected ? null : g); setRebookMode(false); }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${
                    isSelected
                      ? "bg-slate-900 text-white"
                      : "hover:bg-slate-50 text-slate-700 border border-transparent hover:border-slate-200"
                  }`}
                >
                  <div className="font-semibold truncate">{g.guestName}</div>
                  <div className={`mt-0.5 text-[10px] ${isSelected ? "text-slate-400" : "text-slate-400"}`}>
                    {g.bedId} · {format(parseISO(g.checkIn), "MMM d")} → {format(parseISO(g.checkOut), "MMM d")}
                    {g.status === "checked_in" && (
                      <span className="ml-1.5 px-1 py-px bg-emerald-500/20 text-emerald-600 rounded text-[9px] font-semibold">IN</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Actions for selected guest */}
          {selected && (
            <div className="border-t border-slate-200 pt-2 space-y-2">
              <div className="text-[10px] text-slate-500 font-medium">
                Target: <span className="font-bold text-slate-700">{bedId}</span> · {format(parseISO(date), "MMM d, yyyy")}
              </div>

              {error && (
                <div className="text-xs text-red-600 bg-red-50 rounded-lg px-2 py-1.5 border border-red-100">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-3 gap-1.5">
                {/* Move entire stay to this bed */}
                <button
                  onClick={() => {
                    setError("");
                    moveMutation.mutate({
                      reservationId: selected.reservationId,
                      newBedId: bedId,
                    });
                  }}
                  disabled={existingPending || selected.bedId === bedId}
                  title={selected.bedId === bedId ? "Already on this bed" : `Move entire stay to ${bedId}`}
                  className="flex items-center justify-center gap-1 py-2 bg-slate-800 text-white rounded-lg text-xs font-semibold hover:bg-slate-700 disabled:opacity-40 transition-colors"
                >
                  {moveMutation.isPending ? (
                    <div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  ) : (
                    <MoveHorizontal size={11} />
                  )}
                  Move
                </button>

                {/* Extend stay to include this date */}
                <button
                  onClick={() => {
                    setError("");
                    extendMutation.mutate({
                      reservationId: selected.reservationId,
                      newCheckOut,
                      targetBedId: bedId,
                    });
                  }}
                  disabled={existingPending || !canExtend}
                  title={!canExtend ? "Date is before guest's check-in" : `Extend stay to include ${format(parseISO(date), "MMM d")}`}
                  className="flex items-center justify-center gap-1 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 disabled:opacity-40 transition-colors"
                >
                  {extendMutation.isPending ? (
                    <div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  ) : (
                    <CalendarPlus size={11} />
                  )}
                  Extend
                </button>

                {/* Re-book: new stay for returning guest */}
                <button
                  onClick={() => { setRebookMode(!rebookMode); setError(""); }}
                  disabled={existingPending}
                  title={`New stay for ${selected.guestName} starting ${format(parseISO(date), "MMM d")}`}
                  className={`flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-semibold transition-colors ${
                    rebookMode
                      ? "bg-emerald-700 text-white"
                      : "bg-emerald-600 text-white hover:bg-emerald-700"
                  } disabled:opacity-40`}
                >
                  <RotateCcw size={11} />
                  Re-book
                </button>
              </div>

              {/* Re-book expanded: nights picker + confirm */}
              {rebookMode && (
                <div className="space-y-2 pt-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Nights</span>
                    <div className="flex items-center gap-1 ml-auto">
                      {[1, 2, 3, 4, 5, 7].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setRebookNights(n)}
                          className={`w-6 h-6 rounded-md text-[11px] font-semibold transition-colors ${
                            rebookNights === n
                              ? "bg-emerald-600 text-white"
                              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="text-[10px] text-slate-500">
                    {format(parseISO(date), "MMM d")} → {format(addDays(parseISO(date), rebookNights), "MMM d")} · {selected.guestName}
                  </div>
                  <button
                    onClick={() => {
                      setError("");
                      createMutation.mutate({
                        guestName: selected.guestName,
                        checkIn: date,
                        checkOut: format(addDays(parseISO(date), rebookNights), "yyyy-MM-dd"),
                        bedId,
                        numGuests: 1,
                        currency: "VND",
                        roomTypeReq: roomType === "female" ? "female" : "mixed",
                        paymentStatus: "unpaid",
                      });
                    }}
                    disabled={existingPending}
                    className="w-full flex items-center justify-center gap-1.5 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 disabled:opacity-60 transition-colors"
                  >
                    {createMutation.isPending ? (
                      <div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    ) : (
                      <LogIn size={12} />
                    )}
                    Book New Stay · {rebookNights} {rebookNights !== 1 ? "nights" : "night"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
