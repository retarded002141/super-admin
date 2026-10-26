import { useState, useEffect, useCallback, useRef } from "react";
import api from "../../../services/api";

export const parseSessionLockTimeout = (opt) => {
  if (!opt) return 15 * 60 * 1000;
  const s = String(opt).trim().toLowerCase();
  if (s === "off" || s === "disabled" || s === "0") return 0;
  if (s.includes("20")) return 20 * 60 * 1000;
  if (s.includes("15")) return 15 * 60 * 1000;
  if (s.includes("10")) return 10 * 60 * 1000;
  if (s.includes("5")) return 5 * 60 * 1000;
  if (s.includes("2")) return 2 * 60 * 1000;
  const parsed = parseInt(s, 10);
  if (!isNaN(parsed) && parsed > 0) return parsed * 60 * 1000;
  return 15 * 60 * 1000;
};

export function useSessionTimeout() {
  const [sessionOption, setSessionOption] = useState(() => localStorage.getItem("adminSessionLock") || "15 mins");
  const [isLocked, setIsLocked] = useState(false);
  const timerRef = useRef(null);
  const sessionOptionRef = useRef(sessionOption);
  sessionOptionRef.current = sessionOption;

  // Sync setting from backend on mount and listen to events
  useEffect(() => {
    let mounted = true;
    const fetchSecuritySettings = async () => {
      try {
        const token = localStorage.getItem("adminToken");
        if (!token) return;
        const res = await api.get("/admin/settings");
        if (mounted && res.data?.security?.sessionLock !== undefined) {
          const remoteLock = res.data.security.sessionLock;
          setSessionOption(remoteLock);
          localStorage.setItem("adminSessionLock", remoteLock);
        }
      } catch {
        // Fallback to local
      }
    };
    fetchSecuritySettings();

    const handleLockChange = (e) => {
      const val = e.detail;
      if (val !== undefined) {
        setSessionOption(val);
        localStorage.setItem("adminSessionLock", val);
      }
    };

    const handleStorageChange = (e) => {
      if (e.key === "adminSessionLock" && e.newValue !== null) {
        setSessionOption(e.newValue);
      }
    };

    window.addEventListener("admin-session-lock-changed", handleLockChange);
    window.addEventListener("storage", handleStorageChange);
    return () => {
      mounted = false;
      window.removeEventListener("admin-session-lock-changed", handleLockChange);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const ms = parseSessionLockTimeout(sessionOptionRef.current);
    if (ms <= 0) {
      setIsLocked(false);
      return;
    }
    timerRef.current = setTimeout(() => {
      setIsLocked(true);
    }, ms);
  }, []);

  const unlock = useCallback(() => {
    setIsLocked(false);
    resetTimer();
  }, [resetTimer]);

  useEffect(() => {
    resetTimer();
  }, [sessionOption, resetTimer]);

  useEffect(() => {
    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "click"];
    events.forEach((e) => window.addEventListener(e, resetTimer, { passive: true }));

    return () => {
      events.forEach((e) => window.removeEventListener(e, resetTimer));
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [resetTimer]);

  return { isLocked, unlock, setIsLocked, timeoutOption: sessionOption };
}
