# Top Navigation Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the left sidebar with a compact top navigation bar and remove the language switcher bar to maximize bed grid real estate.

**Architecture:** Convert the vertical sidebar (w-60/w-16) + TopBar (h-11) into a single slim horizontal nav bar (~h-12). The layout changes from `flex row [sidebar | content]` to `flex col [topnav | content]`. The language toggle moves into the top nav bar itself (icon-only). The `p-6` page padding is reduced to `p-4` for grid page.

**Tech Stack:** Next.js App Router, Tailwind CSS, Lucide icons, existing LanguageContext

---

### Task 1: Create TopNav component

**Files:**
- Create: `apps/web/src/components/TopNav.tsx`

- [ ] **Step 1: Create the TopNav component**

```tsx
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
```

- [ ] **Step 2: Verify the file was created**

Run: `cat apps/web/src/components/TopNav.tsx | head -5`
Expected: Shows the "use client" and imports.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/TopNav.tsx
git commit -m "feat: add TopNav horizontal navigation component"
```

---

### Task 2: Update root layout to use TopNav instead of Sidebar + TopBar

**Files:**
- Modify: `apps/web/src/app/layout.tsx`

- [ ] **Step 1: Replace layout structure**

Change the layout from sidebar-based to top-nav-based. Replace the entire body content:

Old layout structure:
```tsx
<div className="flex h-screen overflow-hidden">
  <Sidebar />
  <div className="flex-1 flex flex-col overflow-hidden">
    <TopBar />
    <main className="flex-1 overflow-auto">
      <div className="p-6">{children}</div>
    </main>
  </div>
</div>
```

New layout structure:
```tsx
<div className="flex flex-col h-screen overflow-hidden">
  <TopNav />
  <main className="flex-1 overflow-auto">
    <div className="p-4">{children}</div>
  </main>
</div>
```

Also update imports: remove `Sidebar` and `TopBar`, add `TopNav`:
```tsx
import { TopNav } from "@/components/TopNav";
```

Remove these import lines:
```tsx
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
```

The full updated file should be:

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { TopNav } from "@/components/TopNav";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Hostel Manager",
  description: "Hostel bed management and reservation system",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>
          <div className="flex flex-col h-screen overflow-hidden">
            <TopNav />
            <main className="flex-1 overflow-auto">
              <div className="p-4">{children}</div>
            </main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Verify the app builds**

Run: `cd apps/web && npx next build 2>&1 | tail -5`
Expected: Build succeeds (or at minimum no import errors).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/layout.tsx
git commit -m "feat: switch layout from sidebar to top nav bar"
```

---

### Task 3: Update grid max-height calculation

**Files:**
- Modify: `apps/web/src/components/grid/BedGrid.tsx:241`

- [ ] **Step 1: Adjust grid container max-height**

The old calculation `max-h-[calc(100vh-7rem)]` assumed sidebar layout with TopBar (44px) + GridHeader (~60px) + padding (24px+24px). Now we have TopNav (48px) + padding (16px+16px) + GridHeader (~60px) = ~140px ≈ 9rem. But we actually gained vertical space since TopBar is gone and padding shrunk. Update to:

In `apps/web/src/components/grid/BedGrid.tsx`, find:
```
max-h-[calc(100vh-7rem)]
```
Replace with:
```
max-h-[calc(100vh-10rem)]
```

This accounts for: TopNav 48px (3rem) + page padding 32px (2rem) + GridHeader ~60px (3.75rem) + breathing room. The grid will be taller than before since the sidebar no longer constrains width and the TopBar row is gone.

- [ ] **Step 2: Verify the grid page renders**

Run: `cd apps/web && npx next dev &` then visit `/grid` in browser.
Expected: Grid fills available space without overflow issues.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/grid/BedGrid.tsx
git commit -m "fix: adjust grid max-height for new top nav layout"
```

---

### Task 4: Clean up unused files

**Files:**
- Delete: `apps/web/src/components/Sidebar.tsx`
- Delete: `apps/web/src/components/TopBar.tsx`

- [ ] **Step 1: Check for any other imports of Sidebar or TopBar**

Run: `grep -r "Sidebar\|TopBar" apps/web/src/ --include="*.tsx" --include="*.ts" -l`
Expected: Only `layout.tsx` (already updated) and the files themselves. If other files import them, update those first.

- [ ] **Step 2: Delete the old components**

```bash
rm apps/web/src/components/Sidebar.tsx
rm apps/web/src/components/TopBar.tsx
```

- [ ] **Step 3: Verify build still works**

Run: `cd apps/web && npx next build 2>&1 | tail -5`
Expected: Build succeeds with no missing import errors.

- [ ] **Step 4: Commit**

```bash
git add -u apps/web/src/components/Sidebar.tsx apps/web/src/components/TopBar.tsx
git commit -m "chore: remove unused Sidebar and TopBar components"
```
