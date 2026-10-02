import { h } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { getAppBusyCount, subscribeAppBusy } from "../app/appBusy";
import "ojs/ojprogress-circle";

export function AppBusyOverlay() {
  const [busy, setBusy] = useState(() => getAppBusyCount() > 0);
  const overlayRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const blockedSiblingsRef = useRef<Array<{ element: HTMLElement; inert: boolean; ariaHidden: string | null }>>([]);

  useEffect(() => subscribeAppBusy((count) => setBusy(count > 0)), []);
  useEffect(() => {
    if (!busy) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    overlayRef.current?.focus();
    const parent = overlayRef.current?.parentElement;
    blockedSiblingsRef.current = parent
      ? Array.from(parent.children)
        .filter((child): child is HTMLElement => child instanceof HTMLElement && child !== overlayRef.current)
        .map((element) => ({ element, inert: element.inert, ariaHidden: element.getAttribute("aria-hidden") }))
      : [];
    blockedSiblingsRef.current.forEach(({ element }) => {
      element.inert = true;
      element.setAttribute("aria-hidden", "true");
    });
    return () => {
      blockedSiblingsRef.current.forEach(({ element, inert, ariaHidden }) => {
        element.inert = inert;
        if (ariaHidden === null) element.removeAttribute("aria-hidden");
        else element.setAttribute("aria-hidden", ariaHidden);
      });
      blockedSiblingsRef.current = [];
      previousFocusRef.current?.focus();
      previousFocusRef.current = null;
    };
  }, [busy]);
  if (!busy) return null;

  return (
    <div ref={overlayRef} class="kap-busy-overlay" role="dialog" aria-modal="true" aria-label="Processing" aria-busy="true" tabIndex={-1}>
      <div class="kap-busy-overlay__box">
        <oj-progress-circle value={-1} size="sm" aria-label="Processing"></oj-progress-circle>
        <span>Processing…</span>
      </div>
    </div>
  );
}
