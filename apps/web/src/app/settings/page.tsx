"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Mail, CheckCircle, RefreshCw, Unlink, AlertCircle, Clock, ExternalLink, Hotel } from "lucide-react";

interface GmailStatus {
  connected: boolean;
  updatedAt?: string;
}

interface SyncResult {
  imported: number;
  duplicates: number;
  errors: string[];
  emailsChecked: number;
  message?: string;
  error?: string;
}

function GmailSection() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [lastSync, setLastSync] = useState<SyncResult | null>(null);

  const justConnected = searchParams.get("gmail_connected") === "1";
  const connectError = searchParams.get("gmail_error");

  const { data: status, isLoading } = useQuery<GmailStatus>({
    queryKey: ["gmail-status"],
    queryFn: () => fetch("/api/gmail/status").then((r) => r.json()),
  });

  // Poll sync status — auto-polls every 1.5s while status is "running"
  const { data: syncStatus } = useQuery<{ status: string; result: SyncResult | null }>({
    queryKey: ["gmail-sync-status"],
    queryFn: () => fetch("/api/gmail/sync").then((r) => r.json()),
    refetchInterval: (query) => query.state.data?.status === "running" ? 1500 : false,
  });

  // When sync finishes, update UI
  useEffect(() => {
    if (syncStatus?.status === "done" && syncStatus.result) {
      setLastSync(syncStatus.result);
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
    } else if (syncStatus?.status === "error" && syncStatus.result) {
      setLastSync(syncStatus.result);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncStatus?.status]);

  const isSyncing = syncStatus?.status === "running";

  const syncMutation = useMutation({
    mutationFn: () => fetch("/api/gmail/sync", { method: "POST" }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gmail-sync-status"] });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: () => fetch("/api/gmail/disconnect", { method: "DELETE" }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gmail-status"] });
      setLastSync(null);
    },
  });

  // Auto-trigger sync right after connecting
  useEffect(() => {
    if (justConnected && status?.connected && !isSyncing && !syncMutation.isPending) {
      syncMutation.mutate();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [justConnected, status?.connected]);

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="p-5 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-red-50 rounded-lg flex items-center justify-center flex-shrink-0">
            <Mail size={18} className="text-red-500" />
          </div>
          <div>
            <h2 className="font-semibold text-sm text-slate-900">Gmail Sync</h2>
            <p className="text-xs text-slate-500">Auto-import Hostelworld reservations from Gmail (runs hourly)</p>
          </div>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Connection status row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isLoading ? (
              <div className="w-3 h-3 rounded-full bg-slate-200 animate-pulse" />
            ) : status?.connected ? (
              <>
                <CheckCircle size={15} className="text-emerald-500" />
                <span className="text-sm font-medium text-slate-700">Connected</span>
                {status.updatedAt && (
                  <span className="text-xs text-slate-400">
                    · since {new Date(status.updatedAt).toLocaleDateString()}
                  </span>
                )}
              </>
            ) : (
              <>
                <div className="w-3 h-3 rounded-full bg-slate-300" />
                <span className="text-sm text-slate-500">Not connected</span>
              </>
            )}
          </div>

          {!isLoading && (
            status?.connected ? (
              <button
                onClick={() => disconnectMutation.mutate()}
                disabled={disconnectMutation.isPending}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-red-500 transition-colors disabled:opacity-50"
              >
                <Unlink size={12} />
                Disconnect
              </button>
            ) : (
              <a
                href="/api/gmail/auth"
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-lg transition-colors"
              >
                Connect Gmail
              </a>
            )
          )}
        </div>

        {/* OAuth error */}
        {connectError && (
          <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
            <AlertCircle size={13} />
            Connection failed: {connectError.replace(/_/g, " ")}
          </div>
        )}

        {/* Sync controls */}
        {status?.connected && (
          <div className="space-y-3 pt-1 border-t border-slate-100">
            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Clock size={12} />
                Syncs automatically every hour when deployed
              </div>
              <button
                onClick={() => syncMutation.mutate()}
                disabled={isSyncing || syncMutation.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                <RefreshCw size={12} className={isSyncing || syncMutation.isPending ? "animate-spin" : ""} />
                {isSyncing || syncMutation.isPending ? "Syncing..." : "Sync Now"}
              </button>
            </div>

            {/* Sync result */}
            {lastSync && (
              <div className="bg-slate-50 rounded-lg p-3 text-xs space-y-1.5">
                {lastSync.error ? (
                  <div className="text-red-500">{lastSync.error}</div>
                ) : (
                  <>
                    <div className="flex gap-4 font-medium">
                      <span className="text-emerald-600">{lastSync.imported} imported</span>
                      <span className="text-slate-500">{lastSync.duplicates} already existed</span>
                      {lastSync.emailsChecked > 0 && (
                        <span className="text-slate-400">{lastSync.emailsChecked} emails scanned</span>
                      )}
                    </div>
                    {lastSync.message && (
                      <p className="text-slate-400">{lastSync.message}</p>
                    )}
                    {lastSync.errors?.length > 0 && (
                      <details>
                        <summary className="text-red-500 cursor-pointer">{lastSync.errors.length} parse errors</summary>
                        <ul className="mt-1 space-y-0.5 text-red-400 pl-2">
                          {lastSync.errors.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}
                        </ul>
                      </details>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* How it works */}
        {!status?.connected && !isLoading && (
          <div className="text-xs text-slate-400 space-y-1 border-t border-slate-100 pt-4">
            <p className="font-medium text-slate-500">How it works</p>
            <ol className="list-decimal list-inside space-y-1 pl-1">
              <li>Click Connect Gmail and authorize read-only access</li>
              <li>We scan your inbox for Hostelworld & Booking.com emails</li>
              <li>New reservations are imported and auto-assigned to beds</li>
              <li>Runs automatically every hour — no Chrome extension needed</li>
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}

function BookingComSection() {
  const [hotelId, setHotelId] = useState(() => {
    if (typeof window !== "undefined") return localStorage.getItem("booking_hotel_id") || "";
    return "";
  });

  function saveHotelId(id: string) {
    setHotelId(id);
    localStorage.setItem("booking_hotel_id", id);
  }

  const past = new Date(Date.now() - 1 * 86400000).toISOString().split("T")[0];
  const future = new Date(Date.now() + 90 * 86400000).toISOString().split("T")[0];
  const bookingUrl = hotelId
    ? `https://admin.booking.com/hotel/hoteladmin/extranet_ng/manage/search_reservations.html?hotel_id=${hotelId}&date_from=${past}&date_to=${future}&date_type=arrival&rows=100`
    : null;

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="p-5 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
            <Hotel size={18} className="text-blue-500" />
          </div>
          <div>
            <h2 className="font-semibold text-sm text-slate-900">Booking.com Import</h2>
            <p className="text-xs text-slate-500">Scrape reservations from the Booking.com extranet (requires Chrome extension)</p>
          </div>
        </div>
      </div>

      <div className="p-5 space-y-4">
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1.5">Hotel ID</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={hotelId}
              onChange={(e) => saveHotelId(e.target.value.trim())}
              placeholder="e.g. 2451708"
              className="flex-1 px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            {bookingUrl && (
              <a
                href={bookingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors whitespace-nowrap"
              >
                <ExternalLink size={12} />
                Open Reservations
              </a>
            )}
          </div>
          <p className="text-[11px] text-slate-400 mt-1.5">
            Find it in any Booking.com extranet URL: hotel_id=<strong>XXXXXXX</strong>
          </p>
        </div>

        <div className="text-xs text-slate-400 space-y-1 border-t border-slate-100 pt-4">
          <p className="font-medium text-slate-500">How to import</p>
          <ol className="list-decimal list-inside space-y-1 pl-1">
            <li>Enter your Hotel ID above and click <strong>Open Reservations</strong></li>
            <li>On the Booking.com page, click the purple <strong>Import to Hostel Manager</strong> button</li>
            <li>Reservations are imported and auto-assigned to beds</li>
          </ol>
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500 mt-1">Integrations and sync configuration</p>
      </div>
      <BookingComSection />
      <Suspense>
        <GmailSection />
      </Suspense>
    </div>
  );
}
