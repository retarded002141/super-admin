import { useState, useEffect, useCallback, useRef } from "react";

const TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

export function useSessionTimeout() {
  const [isLocked, setIsLocked] = useState(false);
  const timerRef = useRef(null);

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setIsLocked(true);
    }, TIMEOUT_MS);
  }, []);

  const unlock = useCallback(() => {
    setIsLocked(false);
    resetTimer();
  }, [resetTimer]);

  useEffect(() => {
    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "click"];
    events.forEach((e) => window.addEventListener(e, resetTimer, { passive: true }));
    resetTimer();

    return () => {
      events.forEach((e) => window.removeEventListener(e, resetTimer));
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [resetTimer]);

  return { isLocked, unlock, setIsLocked };
}
