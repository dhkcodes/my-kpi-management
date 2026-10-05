export type TouchPointerEvent = {
  pointerType: string;
  isPrimary: boolean;
  pointerId: number;
  clientX: number;
  clientY: number;
  cancelable?: boolean;
  preventDefault(): void;
};

type TouchSample = {
  key: string;
  pointerId: number;
  startedAt: number;
  x: number;
  y: number;
  moved: boolean;
};

type CompletedTap = {
  key: string;
  completedAt: number;
  x: number;
  y: number;
};

export type DoubleActivationTracker = {
  onPointerDown: (event: TouchPointerEvent, key: string) => void;
  onPointerMove: (event: TouchPointerEvent) => void;
  onPointerUp: (event: TouchPointerEvent, key: string, activate: () => void) => void;
  onPointerCancel: () => void;
};

const MAX_TAP_DURATION_MS = 320;
const MAX_DOUBLE_TAP_GAP_MS = 420;
const MAX_TAP_MOVEMENT_PX = 12;
const MAX_DOUBLE_TAP_DISTANCE_PX = 24;

const distance = (x1: number, y1: number, x2: number, y2: number) => Math.hypot(x2 - x1, y2 - y1);

export function createDoubleActivationTracker(): DoubleActivationTracker {
  let active: TouchSample | null = null;
  let previous: CompletedTap | null = null;

  return {
    onPointerDown(event, key) {
      if (event.pointerType !== "touch" || !event.isPrimary) return;
      active = {
        key,
        pointerId: event.pointerId,
        startedAt: Date.now(),
        x: event.clientX,
        y: event.clientY,
        moved: false
      };
    },
    onPointerMove(event) {
      if (!active || event.pointerId !== active.pointerId) return;
      if (distance(active.x, active.y, event.clientX, event.clientY) > MAX_TAP_MOVEMENT_PX) active.moved = true;
    },
    onPointerUp(event, key, activate) {
      if (event.pointerType !== "touch" || !active || event.pointerId !== active.pointerId || active.key !== key) return;
      const elapsed = Date.now() - active.startedAt;
      const movedDistance = distance(active.x, active.y, event.clientX, event.clientY);
      const validTap = !active.moved && elapsed <= MAX_TAP_DURATION_MS && movedDistance <= MAX_TAP_MOVEMENT_PX;
      active = null;
      if (!validTap) {
        previous = null;
        return;
      }
      const now = Date.now();
      const isDoubleTap = Boolean(previous && previous.key === key
        && now - previous.completedAt <= MAX_DOUBLE_TAP_GAP_MS
        && distance(previous.x, previous.y, event.clientX, event.clientY) <= MAX_DOUBLE_TAP_DISTANCE_PX);
      if (isDoubleTap) {
        previous = null;
        if (event.cancelable) event.preventDefault();
        activate();
        return;
      }
      previous = { key, completedAt: now, x: event.clientX, y: event.clientY };
    },
    onPointerCancel() {
      active = null;
    }
  };
}
