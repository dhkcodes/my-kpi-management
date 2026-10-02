type AppBusyListener = (count: number) => void;

let busyCount = 0;
const listeners = new Set<AppBusyListener>();
let interactionBlockActive = false;

const blockedInteractionEvents: Array<keyof DocumentEventMap> = ["click", "pointerdown", "submit", "keydown"];

function blockInteractionWhileBusy(event: Event): void {
  if (busyCount <= 0) return;
  if (event instanceof KeyboardEvent && event.key !== "Enter" && event.key !== " ") return;
  const target = event.target;
  if (target instanceof Element && target.closest(".kap-busy-overlay")) return;
  event.preventDefault();
  event.stopImmediatePropagation();
}

function syncInteractionBlock(): void {
  if (typeof document === "undefined") return;
  if (busyCount > 0 && !interactionBlockActive) {
    blockedInteractionEvents.forEach((type) => document.addEventListener(type, blockInteractionWhileBusy, true));
    interactionBlockActive = true;
  } else if (busyCount === 0 && interactionBlockActive) {
    blockedInteractionEvents.forEach((type) => document.removeEventListener(type, blockInteractionWhileBusy, true));
    interactionBlockActive = false;
  }
}

function emit(): void {
  listeners.forEach((listener) => listener(busyCount));
}

export function getAppBusyCount(): number {
  return busyCount;
}

export function subscribeAppBusy(listener: AppBusyListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function beginAppBusy(): () => void {
  busyCount += 1;
  syncInteractionBlock();
  emit();
  let finished = false;
  return () => {
    if (finished) return;
    finished = true;
    busyCount = Math.max(0, busyCount - 1);
    syncInteractionBlock();
    emit();
  };
}
