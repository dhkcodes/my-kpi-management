import { h } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { getAppBusyCount, subscribeAppBusy } from "../app/appBusy";
import "ojs/ojprogress-bar";

function hasInlineBusySurface(): boolean {
  return typeof document !== "undefined" && document.querySelector('[data-app-busy-surface="true"]') !== null;
}

export function AppBusyOverlay() {
  const [busy, setBusy] = useState(() => getAppBusyCount() > 0);
  const [inlineBusySurface, setInlineBusySurface] = useState(hasInlineBusySurface);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => subscribeAppBusy((count) => setBusy(count > 0)), []);
  useEffect(() => {
    if (typeof document === "undefined") return;

    const updateInlineBusySurface = () => setInlineBusySurface(hasInlineBusySurface());
    updateInlineBusySurface();
    const observer = new MutationObserver(updateInlineBusySurface);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const overlay = overlayRef.current;
    const parent = overlay?.parentElement;
    if (!busy || inlineBusySurface || !overlay || !parent) return;

    const background = Array.from(parent.children).filter((element): element is HTMLElement =>
      element instanceof HTMLElement && element !== overlay);
    const previous = background.map((element) => ({
      element,
      inert: element.inert,
      ariaHidden: element.getAttribute("aria-hidden")
    }));
    previous.forEach(({ element }) => {
      element.inert = true;
      element.setAttribute("aria-hidden", "true");
    });
    overlay.focus();

    return () => previous.forEach(({ element, inert, ariaHidden }) => {
      element.inert = inert;
      if (ariaHidden === null) element.removeAttribute("aria-hidden");
      else element.setAttribute("aria-hidden", ariaHidden);
    });
  }, [busy, inlineBusySurface]);

  if (!busy || inlineBusySurface) return null;

  return (
    <div ref={overlayRef} class="kap-app-loading kap-busy-overlay" role="dialog" aria-modal="true" aria-label="Preparing application" aria-busy="true" tabIndex={-1}>
      <oj-progress-bar value={-1} aria-label="Preparing application"></oj-progress-bar>
    </div>
  );
}
