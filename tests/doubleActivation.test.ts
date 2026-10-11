import assert from "node:assert/strict";
import { createDoubleActivationTracker, TouchPointerEvent } from "../src/components/common/doubleActivation";

const touch = (pointerId: number, x: number, y: number): TouchPointerEvent => ({
  pointerType: "touch",
  isPrimary: true,
  pointerId,
  clientX: x,
  clientY: y,
  cancelable: true,
  preventDefault() {}
});

const tracker = createDoubleActivationTracker();
let activations = 0;
const first = touch(1, 40, 80);
tracker.onPointerDown(first, "row-1:description");
tracker.onPointerUp(first, "row-1:description", () => { activations += 1; });
assert.equal(activations, 0, "one touch must not begin KPI editing");

const second = touch(2, 42, 81);
tracker.onPointerDown(second, "row-1:description");
tracker.onPointerUp(second, "row-1:description", () => { activations += 1; });
assert.equal(activations, 1, "two close touches on the same editable KPI cell must begin editing once");

const movedTracker = createDoubleActivationTracker();
let movedActivations = 0;
const movedStart = touch(3, 10, 10);
const movedEnd = touch(3, 40, 10);
movedTracker.onPointerDown(movedStart, "row-1:description");
movedTracker.onPointerMove(movedEnd);
movedTracker.onPointerUp(movedEnd, "row-1:description", () => { movedActivations += 1; });
const movedSecond = touch(4, 40, 10);
movedTracker.onPointerDown(movedSecond, "row-1:description");
movedTracker.onPointerUp(movedSecond, "row-1:description", () => { movedActivations += 1; });
assert.equal(movedActivations, 0, "a scroll gesture must not count as the first touch of a double tap");

console.log("doubleActivation tests passed");
