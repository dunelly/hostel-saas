"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CalendarRange,
  ClipboardList,
  BedDouble,
  Settings,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Shirt,
  Calendar,
  Users,
  DollarSign,
} from "lucide-react";
import { useState } from "react";
import { useLang } from "@/contexts/LanguageContext";

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const { t } = useLang();

  const navItems = [
    { href: "/", label: t("nav_dashboard"), icon: LayoutDashboard },
    { href: "/grid", label: t("nav_calendar"), icon: CalendarRange },
    { href: "/reservations", label: t("nav_reservations"), icon: ClipboardList },
    { href: "/tours", label: t("nav_tours"), icon: MapPin },
    { href: "/laundry", label: t("nav_laundry"), icon: Shirt },
    { href: "/payments", label: "Payments", icon: DollarSign },
    { href: "/schedule", label: "Schedule", icon: Calendar },
    { href: "/settings", label: "Settings", icon: Settings },
  ];

  return (
    <aside
      className={`flex flex-col bg-slate-900 text-white sidebar-transition ${
        collapsed ? "w-16" : "w-60"
      }`}
    >
      {/* Logo */}
      <div className="flex items-center h-16 px-4 border-b border-slate-700/50">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center flex-shrink-0">
            <BedDouble size={18} className="text-white" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <h1 className="text-sm font-bold tracking-tight truncate">
                Hostel Manager
              </h1>
              <p className="text-[10px] text-slate-400 truncate">
                Property Management
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-2 space-y-1">
        {!collapsed && (
          <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Main Menu
          </p>
        )}
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                isActive
                  ? "bg-indigo-500/20 text-indigo-300 font-medium"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}
              title={collapsed ? item.label : undefined}
            >
              <Icon
                size={18}
                className={`flex-shrink-0 ${
                  isActive
                    ? "text-indigo-400"
                    : "text-slate-400 group-hover:text-slate-200"
                }`}
              />
              {!collapsed && (
                <div className="min-w-0">
                  <div className="truncate">{item.label}</div>
                </div>
              )}
            </Link>
          );
        })}
      </nav>


      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center justify-center h-10 border-t border-slate-700/50 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
      >
        {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>
    </aside>
  );
}
