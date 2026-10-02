type AppBusyListener = (count: number) => void;

let busyCount = 0;
const listeners = new Set<AppBusyListener>();

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
  emit();
  let finished = false;
  return () => {
    if (finished) return;
    finished = true;
    busyCount = Math.max(0, busyCount - 1);
    emit();
  };
}
