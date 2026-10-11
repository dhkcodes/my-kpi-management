import { h } from "preact";
import { useEffect, useRef } from "preact/hooks";

import { PageDataProgress } from "../common/PageShell";

type ConsumptionViewportProgressProps = Readonly<{
  busy: boolean;
  busyLabel: string;
}>;

/**
 * Places the shared loading card at the visible PageShell center using the
 * same fixed viewport-control contract and geometry as Consumption Records.
 * The fixed host intentionally stays independent of initial/loaded content.
 */
export function ConsumptionViewportProgress({ busy, busyLabel }: ConsumptionViewportProgressProps) {
  const controlsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controls = controlsRef.current;
    const root = controls?.closest(".kap-page-shell");
    if (!controls || !(root instanceof HTMLElement)) return;

    const updatePosition = () => {
      const rootRect = root.getBoundingClientRect();
      const visibleTop = Math.max(rootRect.top, 0);
      const visibleBottom = Math.min(rootRect.bottom, window.innerHeight);
      const visibleLeft = Math.max(rootRect.left, 0);
      const visibleRight = Math.min(rootRect.right, window.innerWidth);
      const viewportCenterY = (visibleTop + visibleBottom) / 2;
      const viewportCenterX = (visibleLeft + visibleRight) / 2;
      controls.style.setProperty("--consumption-viewport-center-y", `${viewportCenterY}px`);
      controls.style.setProperty("--consumption-viewport-center-x", `${viewportCenterX}px`);
      controls.style.setProperty("--consumption-viewport-right", `${visibleRight}px`);
    };

    const resizeObserver = new ResizeObserver(updatePosition);
    resizeObserver.observe(root);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    window.visualViewport?.addEventListener("resize", updatePosition);
    window.visualViewport?.addEventListener("scroll", updatePosition);
    updatePosition();
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      window.visualViewport?.removeEventListener("resize", updatePosition);
      window.visualViewport?.removeEventListener("scroll", updatePosition);
    };
  }, []);

  return <div ref={controlsRef} class="consumption-viewport-controls consumption-page-progress-controls"
    data-visible={busy ? "true" : "false"}>
    <PageDataProgress busy={busy} busyLabel={busyLabel} />
  </div>;
}
