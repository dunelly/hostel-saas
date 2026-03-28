"use client";

import { useLang } from "@/contexts/LanguageContext";

export function TopBar() {
  const { lang, setLang } = useLang();

  return (
    <div className="h-11 flex items-center justify-end px-5 border-b border-slate-100 bg-white shrink-0">
      {/* Language toggle */}
      <div className="flex items-center bg-slate-100 rounded-lg p-0.5 gap-0.5">
        <button
          onClick={() => setLang("en")}
          className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
            lang === "en"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          EN
        </button>
        <button
          onClick={() => setLang("vi")}
          className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
            lang === "vi"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          VI
        </button>
      </div>
    </div>
  );
}
