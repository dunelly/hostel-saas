"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, addDays } from "date-fns";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import {
  BedDouble,
  TrendingUp,
  UserCheck,
  AlertCircle,
  ArrowUpRight,
  CalendarClock,
  Download,
  LogIn,
  LogOut,
  DollarSign,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { GuestDetailPanel } from "@/components/GuestDetailPanel";

interface TodayGuest {
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
}

interface Stats {
  totalBeds: number;
  totalRooms: number;
  occupancyByDate: {
    date: string;
    occupied: number;
    total: number;
    percentage: number;
  }[];
  recentImports: {
    id: number;
    source: string;
    reservationsCount: number;
    newCount: number;
    duplicateCount: number;
    importedAt: string;
  }[];
  unassignedCount: number;
  todayArrivals: TodayGuest[];
  todayDepartures: TodayGuest[];
  unpaidInHouse: TodayGuest[];
}

export default function DashboardPage() {
  const queryClient = useQueryClient();
  const [panelGuest, setPanelGuest] = useState<TodayGuest | null>(null);

  const today = format(new Date(), "yyyy-MM-dd");
  const twoWeeksOut = format(addDays(new Date(), 14), "yyyy-MM-dd");

  const { data: stats } = useQuery<Stats>({
    queryKey: ["stats", today, twoWeeksOut],
    queryFn: () =>
      fetch(`/api/stats?from=${today}&to=${twoWeeksOut}`).then((r) =>
        r.json()
      ),
  });

  const todayStats = stats?.occupancyByDate?.find((d) => d.date === today);
  const avgOccupancy =
    stats?.occupancyByDate && stats.occupancyByDate.length > 0
      ? Math.round(
          stats.occupancyByDate.reduce((sum, d) => sum + d.percentage, 0) /
            stats.occupancyByDate.length
        )
      : 0;

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {format(new Date(), "EEEE, MMMM d, yyyy")}
          </p>
        </div>
        <Link
          href="/grid"
          className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 transition-colors shadow-sm"
        >
          Open Room Calendar
          <ArrowUpRight size={14} />
        </Link>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<BedDouble size={20} />}
          label="Total Beds"
          value={stats?.totalBeds ?? "-"}
          description={`Across ${stats?.totalRooms ?? "—"} rooms`}
          accent="slate"
        />
        <StatCard
          icon={<UserCheck size={20} />}
          label="Occupied Tonight"
          value={
            todayStats ? `${todayStats.occupied}` : "-"
          }
          description={
            todayStats
              ? `${todayStats.percentage}% occupancy rate`
              : "No data"
          }
          accent="emerald"
        />
        <StatCard
          icon={<TrendingUp size={20} />}
          label="Avg. Occupancy"
          value={`${avgOccupancy}%`}
          description="Next 14 days forecast"
          accent="blue"
        />
        <StatCard
          icon={<AlertCircle size={20} />}
          label="Unassigned"
          value={stats?.unassignedCount ?? 0}
          description={
            stats?.unassignedCount
              ? "Needs attention"
              : "All guests assigned"
          }
          accent={stats?.unassignedCount ? "red" : "emerald"}
        />
      </div>

      {/* Today's Activity */}
      {stats && (stats.todayArrivals?.length > 0 || stats.todayDepartures?.length > 0 || stats.unpaidInHouse?.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <TodayList
            title="Arrivals"
            icon={<LogIn size={15} className="text-emerald-500" />}
            guests={stats.todayArrivals || []}
            accentBg="bg-emerald-50"
            accentBorder="border-emerald-200"
            emptyText="No arrivals today"
            statusDot={(g) => g.status === "checked_in" ? "bg-emerald-400" : "bg-blue-400"}
            statusLabel={(g) => g.status === "checked_in" ? "In" : "Expected"}
            onSelect={setPanelGuest}
          />
          <TodayList
            title="Departures"
            icon={<LogOut size={15} className="text-slate-500" />}
            guests={stats.todayDepartures || []}
            accentBg="bg-slate-50"
            accentBorder="border-slate-200"
            emptyText="No departures today"
            statusDot={(g) => g.status === "checked_out" ? "bg-slate-300" : "bg-amber-400"}
            statusLabel={(g) => g.status === "checked_out" ? "Out" : "Still here"}
            onSelect={setPanelGuest}
          />
          <TodayList
            title="Unpaid"
            icon={<DollarSign size={15} className="text-red-500" />}
            guests={stats.unpaidInHouse || []}
            accentBg="bg-red-50"
            accentBorder="border-red-200"
            emptyText="All settled up"
            statusDot={() => "bg-red-400"}
            statusLabel={(g) => {
              const owed = (g.totalPrice ?? 0) - (g.amountPaid ?? 0);
              return owed > 0 ? `${Math.round(owed).toLocaleString()}đ` : "—";
            }}
            onSelect={setPanelGuest}
          />
        </div>
      )}

      {/* Guest Detail Panel */}
      {panelGuest && (
        <GuestDetailPanel
          reservation={{
            id: panelGuest.id,
            guestId: panelGuest.guestId,
            guestName: panelGuest.guestName,
            checkIn: panelGuest.checkIn,
            checkOut: panelGuest.checkOut,
            status: panelGuest.status,
            paymentStatus: panelGuest.paymentStatus,
            totalPrice: panelGuest.totalPrice,
            amountPaid: panelGuest.amountPaid,
            source: panelGuest.source,
            bedId: panelGuest.bedId || "",
            numGuests: 1,
            roomTypeReq: "mixed",
            currency: "VND",
          }}
          onClose={() => setPanelGuest(null)}
        />
      )}

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Occupancy Chart - takes 2 columns */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-800">
                Occupancy Forecast
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Next 14 days bed utilization
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <CalendarClock size={14} />
              Updated just now
            </div>
          </div>
          {stats?.occupancyByDate && (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={stats.occupancyByDate}>
                <defs>
                  <linearGradient id="occupancyGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(d) =>
                    format(new Date(d + "T00:00:00"), "MMM d")
                  }
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  axisLine={{ stroke: "#e2e8f0" }}
                  tickLine={false}
                />
                <YAxis
                  domain={[0, stats.totalBeds]}
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                  width={30}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: "8px",
                    border: "1px solid #e2e8f0",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                    fontSize: "12px",
                  }}
                  labelFormatter={(d) =>
                    format(new Date(d + "T00:00:00"), "EEE, MMM d yyyy")
                  }
                  formatter={(value) => [
                    `${value} / ${stats.totalBeds} beds`,
                    "Occupied",
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="occupied"
                  stroke="#6366f1"
                  strokeWidth={2}
                  fill="url(#occupancyGrad)"
                  dot={{ r: 3, fill: "#6366f1", strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: "#6366f1", strokeWidth: 2, stroke: "#fff" }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Quick Actions + Recent Imports */}
        <div className="space-y-4">
          {/* Quick Actions */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h2 className="text-sm font-semibold text-slate-800 mb-3">
              Quick Actions
            </h2>
            <div className="space-y-2">
              <Link
                href="/reservations"
                className="flex items-center gap-3 p-3 rounded-lg border border-slate-100 hover:border-slate-200 hover:bg-slate-50 transition-colors group"
              >
                <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center group-hover:bg-emerald-100 transition-colors">
                  <UserCheck size={16} className="text-emerald-600" />
                </div>
                <div>
                  <div className="text-sm font-medium text-slate-700">Add Walk-in</div>
                  <div className="text-[11px] text-slate-400">Manual reservation</div>
                </div>
              </Link>
              <Link
                href="/grid"
                className="flex items-center gap-3 p-3 rounded-lg border border-slate-100 hover:border-slate-200 hover:bg-slate-50 transition-colors group"
              >
                <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center group-hover:bg-indigo-100 transition-colors">
                  <BedDouble size={16} className="text-indigo-600" />
                </div>
                <div>
                  <div className="text-sm font-medium text-slate-700">Room Calendar</div>
                  <div className="text-[11px] text-slate-400">View & manage beds</div>
                </div>
              </Link>
            </div>
          </div>

          {/* Recent Imports */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h2 className="text-sm font-semibold text-slate-800 mb-3">
              Recent Imports
            </h2>
            {stats?.recentImports && stats.recentImports.length > 0 ? (
              <div className="space-y-3">
                {stats.recentImports.map((imp) => {
                  const sourceColor =
                    imp.source === "booking.com"
                      ? "bg-blue-400"
                      : imp.source === "hostelworld"
                        ? "bg-orange-400"
                        : "bg-emerald-400";
                  return (
                    <div
                      key={imp.id}
                      className="flex items-center gap-3"
                    >
                      <div
                        className={`w-2 h-2 rounded-full ${sourceColor} flex-shrink-0`}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-slate-700 capitalize">
                          {imp.source}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {imp.newCount} new &middot; {imp.duplicateCount} skipped
                        </div>
                      </div>
                      <div className="text-[10px] text-slate-400 flex-shrink-0">
                        {imp.importedAt?.split("T")[0] || imp.importedAt}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-6">
                <Download size={24} className="text-slate-200 mx-auto mb-2" />
                <p className="text-xs text-slate-400">
                  No imports yet
                </p>
                <p className="text-[10px] text-slate-300 mt-0.5">
                  Use the Chrome extension to import bookings
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TodayList({
  title,
  icon,
  guests,
  accentBg,
  accentBorder,
  emptyText,
  statusDot,
  statusLabel,
  onSelect,
}: {
  title: string;
  icon: React.ReactNode;
  guests: TodayGuest[];
  accentBg: string;
  accentBorder: string;
  emptyText: string;
  statusDot: (g: TodayGuest) => string;
  statusLabel: (g: TodayGuest) => string;
  onSelect: (g: TodayGuest) => void;
}) {
  return (
    <div className={`rounded-xl border ${accentBorder} ${accentBg} p-4`}>
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <span className="text-xs font-semibold text-slate-700">{title}</span>
        <span className="text-[10px] font-medium text-slate-400 bg-white/60 px-1.5 py-0.5 rounded-full">{guests.length}</span>
      </div>
      {guests.length === 0 ? (
        <p className="text-xs text-slate-400 py-2">{emptyText}</p>
      ) : (
        <div className="space-y-1.5">
          {guests.map((g) => (
            <button
              key={g.id}
              onClick={() => onSelect(g)}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg bg-white/70 hover:bg-white transition-colors text-left"
            >
              <div className={`w-2 h-2 rounded-full ${statusDot(g)} flex-shrink-0`} />
              <span className="text-xs font-medium text-slate-700 truncate flex-1">{g.guestName}</span>
              {g.bedId && (
                <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{g.bedId}</span>
              )}
              <span className="text-[10px] text-slate-400 flex-shrink-0">{statusLabel(g)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  description,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  description: string;
  accent: string;
}) {
  const accentMap: Record<string, { icon: string; bg: string }> = {
    slate: { icon: "text-slate-600", bg: "bg-slate-50" },
    emerald: { icon: "text-emerald-600", bg: "bg-emerald-50" },
    blue: { icon: "text-blue-600", bg: "bg-blue-50" },
    red: { icon: "text-red-600", bg: "bg-red-50" },
  };

  const colors = accentMap[accent] || accentMap.slate;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
          {label}
        </span>
        <div className={`p-1.5 rounded-lg ${colors.bg}`}>
          <div className={colors.icon}>{icon}</div>
        </div>
      </div>
      <div className="text-2xl font-bold text-slate-900">{value}</div>
      <p className="text-xs text-slate-400 mt-1">{description}</p>
    </div>
  );
}
