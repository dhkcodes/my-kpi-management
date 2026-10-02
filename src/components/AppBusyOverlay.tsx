import { h } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { getAppBusyCount, subscribeAppBusy } from "../app/appBusy";
import "ojs/ojprogress-circle";

export function AppBusyOverlay() {
  const [busy, setBusy] = useState(() => getAppBusyCount() > 0);
  const overlayRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => subscribeAppBusy((count) => setBusy(count > 0)), []);
  useEffect(() => {
    if (!busy) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    overlayRef.current?.focus();
    return () => {
      previousFocusRef.current?.focus();
      previousFocusRef.current = null;
    };
  }, [busy]);
  if (!busy) return null;

  return (
    <div ref={overlayRef} class="kap-busy-overlay" role="status" aria-live="polite" aria-label="Processing" aria-busy="true" tabIndex={-1}>
      <div class="kap-busy-overlay__box">
        <oj-progress-circle value={-1} size="sm" aria-label="Processing"></oj-progress-circle>
        <span>Processing…</span>
      </div>
    </div>
  );
}
