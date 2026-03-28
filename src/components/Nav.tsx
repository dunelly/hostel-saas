"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, CalendarDays, List, Settings } from "lucide-react";

const links = [
  { href: "/", label: "Dashboard", icon: LayoutGrid },
  { href: "/grid", label: "Bed Grid", icon: CalendarDays },
  { href: "/reservations", label: "Reservations", icon: List },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="bg-white border-b border-gray-200 px-4">
      <div className="flex items-center h-14 gap-8">
        <Link href="/" className="font-bold text-lg text-indigo-600">
          Hostel Manager
        </Link>
        <div className="flex gap-1">
          {links.map((link) => {
            const Icon = link.icon;
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                }`}
              >
                <Icon size={16} />
                {link.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
