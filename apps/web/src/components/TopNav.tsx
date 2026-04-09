"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CalendarRange,
  ClipboardList,
  Settings,
  MapPin,
  Shirt,
  Calendar,
  DollarSign,
  BedDouble,
  Globe,
} from "lucide-react";
import { useLang } from "@/contexts/LanguageContext";

export function TopNav() {
  const pathname = usePathname();
  const { lang, setLang, t } = useLang();

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
    <header className="flex items-center h-12 bg-slate-900 text-white px-4 shrink-0">
      {/* Logo */}
      <Link href="/" className="flex items-center gap-2 mr-6">
        <div className="w-7 h-7 bg-indigo-500 rounded-lg flex items-center justify-center">
          <BedDouble size={15} className="text-white" />
        </div>
        <span className="text-sm font-bold tracking-tight hidden sm:inline">
          Hostel Manager
        </span>
      </Link>

      {/* Nav links */}
      <nav className="flex items-center gap-1 flex-1 overflow-x-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-all ${
                isActive
                  ? "bg-indigo-500/20 text-indigo-300"
                  : "text-slate-400 hover:bg-slate-800 hover:text-white"
              }`}
            >
              <Icon size={15} className={isActive ? "text-indigo-400" : ""} />
              <span className="hidden md:inline">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Language toggle */}
      <button
        onClick={() => setLang(lang === "en" ? "vi" : "en")}
        className="flex items-center gap-1 ml-3 px-2 py-1.5 rounded-md text-xs font-semibold text-slate-400 hover:bg-slate-800 hover:text-white transition-all"
        title={lang === "en" ? "Switch to Vietnamese" : "Switch to English"}
      >
        <Globe size={14} />
        <span className="uppercase">{lang}</span>
      </button>
    </header>
  );
}
