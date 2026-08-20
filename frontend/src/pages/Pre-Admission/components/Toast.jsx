import React, { useState, useCallback, useEffect } from "react";
import { ToastContext } from "../context/ToastContext.jsx";

let _toastId = 0;


export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 350);
  }, []);

  const toast = useCallback(
    (message, type = "info", duration = 4000) => {
      const id = ++_toastId;
      setToasts((prev) => [...prev, { id, message, type, leaving: false }]);
      if (duration > 0) setTimeout(() => dismiss(id), duration);
      return id;
    },
    [dismiss]
  );

  /** Convenience shortcuts */
  toast.success = (msg, dur) => toast(msg, "success", dur);
  toast.error = (msg, dur) => toast(msg, "error", dur);
  toast.warning = (msg, dur) => toast(msg, "warning", dur);
  toast.info = (msg, dur) => toast(msg, "info", dur);

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}
      <ToastContainer toasts={toasts} dismiss={dismiss} />
    </ToastContext.Provider>
  );
}

/* Internal renderer*/
const STYLES = {
  success: {
    bar: "bg-[#2e7d32]",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-[#2e7d32] shrink-0">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
      </svg>
    ),
  },
  error: {
    bar: "bg-red-600",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-red-600 shrink-0">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
      </svg>
    ),
  },
  warning: {
    bar: "bg-amber-500",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-amber-500 shrink-0">
        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
      </svg>
    ),
  },
  info: {
    bar: "bg-blue-500",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-blue-500 shrink-0">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
      </svg>
    ),
  },
};

function ToastContainer({ toasts, dismiss }) {
  return (
    <div
      aria-live="polite"
      className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none"
      style={{ maxWidth: "360px", width: "calc(100vw - 2rem)" }}
    >
      {toasts.map((t) => (
        <Toast key={t.id} toast={t} dismiss={dismiss} />
      ))}
    </div>
  );
}

function Toast({ toast, dismiss }) {
  const { id, message, type, leaving } = toast;
  const s = STYLES[type] || STYLES.info;

  return (
    <div
      className={`pointer-events-auto bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden flex items-start gap-3 pl-4 pr-4 transition-all duration-300 ease-in-out
        ${leaving ? "opacity-0 translate-x-4" : "opacity-100 translate-x-0"}`}
    >
      {/* Icon */}
      <div className="pt-3 pb-3">
        {s.icon}
      </div>

      {/* Message */}
      <p className="flex-1 text-sm text-gray-700 font-medium py-3 leading-snug">{message}</p>

      {/* Dismiss */}
      <button
        onClick={() => dismiss(id)}
        className="mt-3 text-gray-300 hover:text-gray-500 transition-colors shrink-0"
        aria-label="Dismiss"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>
    </div>
  );
}
