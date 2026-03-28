"use client";

import { createContext, useContext, useState, useCallback, useRef } from "react";
import { CheckCircle2, XCircle, AlertCircle, X } from "lucide-react";

type ToastType = "success" | "error" | "info";

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface Toast {
  id: number;
  type: ToastType;
  message: string;
  visible: boolean;
  action?: ToastAction;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType, action?: ToastAction) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}

const ICONS = {
  success: <CheckCircle2 size={15} className="text-emerald-500 shrink-0" />,
  error: <XCircle size={15} className="text-red-500 shrink-0" />,
  info: <AlertCircle size={15} className="text-blue-500 shrink-0" />,
};

const STYLES = {
  success: "border-emerald-200 bg-emerald-50",
  error: "border-red-200 bg-red-50",
  info: "border-blue-200 bg-blue-50",
};

const TEXT = {
  success: "text-emerald-800",
  error: "text-red-800",
  info: "text-blue-800",
};

const ACTION_STYLE = {
  success: "text-emerald-700 hover:text-emerald-900 border-emerald-300",
  error: "text-red-700 hover:text-red-900 border-red-300",
  info: "text-blue-700 hover:text-blue-900 border-blue-300",
};

let nextId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    // Fade out first, then remove
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, visible: false } : t))
    );
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 300);
  }, []);

  const toast = useCallback(
    (message: string, type: ToastType = "info", action?: ToastAction) => {
      const id = ++nextId;
      setToasts((prev) => [...prev, { id, type, message, visible: true, action }]);

      // Give more time if there's an undo action
      const timer = setTimeout(() => dismiss(id), action ? 6000 : 4000);
      timers.current.set(id, timer);
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}

      {/* Toast stack — top-right */}
      <div className="fixed top-4 right-4 z-[200] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border shadow-lg max-w-sm transition-all duration-300 ${
              STYLES[t.type]
            } ${t.visible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2"}`}
          >
            {ICONS[t.type]}
            <span className={`text-sm font-medium flex-1 ${TEXT[t.type]}`}>
              {t.message}
            </span>
            {t.action && (
              <button
                onClick={() => { t.action!.onClick(); dismiss(t.id); }}
                className={`text-xs font-bold px-2 py-0.5 rounded border shrink-0 transition-colors ${ACTION_STYLE[t.type]}`}
              >
                {t.action.label}
              </button>
            )}
            <button
              onClick={() => dismiss(t.id)}
              className="text-slate-400 hover:text-slate-600 transition-colors shrink-0"
            >
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
