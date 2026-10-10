import { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import "ojs/ojbutton";
import "ojs/ojprogress-circle";
import "ojs/ojprogress-bar";

type PageShellProps = {
  ariaLabelledBy: string;
  title: ComponentChildren;
  titleControls?: ComponentChildren;
  eyebrow?: ComponentChildren;
  breadcrumb?: ComponentChildren;
  actions?: ComponentChildren;
  filters?: ComponentChildren;
  messages?: ComponentChildren;
  children: ComponentChildren;
  busy?: boolean;
  busyLabel?: string;
  onRefresh?: () => void | Promise<void>;
  refreshDisabled?: boolean;
  activityPosition?: "heading" | "custom";
  headingSpacing?: "default" | "compact";
  className?: string;
  bodyClassName?: string;
  rootAttributes?: Record<string, string>;
  scrollElementRef?: (element: HTMLDivElement | null) => void;
  onScroll?: (event: Event) => void;
};

type PageFilterPanelProps = {
  children: ComponentChildren;
  className?: string;
  ariaLabel?: string;
};

export function PageFilterPanel({ children, className = "", ariaLabel = "Search and filters" }: PageFilterPanelProps) {
  return <section class={`kap-page-filter${className ? ` ${className}` : ""}`} aria-label={ariaLabel}>{children}</section>;
}

type PageActivityProps = Pick<PageShellProps, "busy" | "busyLabel" | "onRefresh" | "refreshDisabled"> & {
  lastCompletedAt?: Date | null;
  showBusyLabel?: boolean;
  compactTimestampButton?: boolean;
};

const padTimestampPart = (value: number) => String(value).padStart(2, "0");

export function formatKstTimestamp(value: Date): string {
  const kst = new Date(value.getTime() + 9 * 60 * 60 * 1000);
  return `${kst.getUTCFullYear()}/${padTimestampPart(kst.getUTCMonth() + 1)}/${padTimestampPart(kst.getUTCDate())} `
    + `${padTimestampPart(kst.getUTCHours())}:${padTimestampPart(kst.getUTCMinutes())}:${padTimestampPart(kst.getUTCSeconds())}`;
}

export function formatKstTime(value: Date): string {
  return formatKstTimestamp(value).slice(-8);
}

export function PageActivity({
  busy = false,
  busyLabel = "Loading",
  onRefresh,
  refreshDisabled = false,
  lastCompletedAt = null,
  showBusyLabel = true,
  compactTimestampButton = false
}: PageActivityProps) {
  const refreshSlotRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const slot = refreshSlotRef.current;
    if (!slot) return;
    const handleRefreshClick = () => {
      if (!busy && !refreshDisabled) void onRefresh?.();
    };
    slot.addEventListener("click", handleRefreshClick);
    return () => slot.removeEventListener("click", handleRefreshClick);
  }, [busy, onRefresh, refreshDisabled]);
  if (!busy && !onRefresh && !lastCompletedAt) return null;
  const refreshTitle = lastCompletedAt
    ? `Reload. Last successful completion (KST): ${formatKstTimestamp(lastCompletedAt)}`
    : "Reload. No successful completion recorded yet";
  if (compactTimestampButton) {
    return (
      <div class={`kap-page-activity is-compact-timestamp${busy ? " is-busy" : ""}`} role="status" aria-live="polite">
        <span ref={refreshSlotRef} class="kap-page-activity__control-slot">
          <oj-button key={busy ? "busy" : "ready"} class="kap-page-activity__refresh oj-button-sm" chroming="outlined" disabled={!onRefresh || refreshDisabled || busy}
            aria-label={busy ? `${busyLabel}; Reload` : "Reload"} title={refreshTitle}>
            <span slot="startIcon" class="kap-page-activity__start-icon">
              {busy
                ? <oj-progress-circle class="kap-page-activity__progress" size="sm" value={-1} aria-label={busyLabel}></oj-progress-circle>
                : <span class="oj-ux-ico-refresh" aria-hidden="true"></span>}
            </span>
            <span class="kap-page-activity__separator" aria-hidden="true">|</span>
            <time class="kap-page-activity__completed-at" dateTime={lastCompletedAt?.toISOString()}>
              {lastCompletedAt ? formatKstTime(lastCompletedAt) : "--:--:--"}
            </time>
          </oj-button>
        </span>
      </div>
    );
  }
  return (
    <div class={`kap-page-activity${busy ? " is-busy" : ""}`} role="status" aria-live="polite">
      <span class="kap-page-activity__loading-group">
        {lastCompletedAt && <time class="kap-page-activity__completed-at" dateTime={lastCompletedAt.toISOString()}>
          {formatKstTimestamp(lastCompletedAt)}
        </time>}
        <span ref={refreshSlotRef} class="kap-page-activity__control-slot">
          {busy ? (
            <span class="kap-page-activity__status">
              <oj-progress-circle class="kap-page-activity__progress" size="sm" value={-1} aria-label={busyLabel}></oj-progress-circle>
              <span class={showBusyLabel ? "" : "oj-helper-hidden-accessible"}>{busyLabel}</span>
            </span>
          ) : <oj-button class="kap-page-activity__refresh" chroming="borderless" disabled={!onRefresh || refreshDisabled}
              aria-label="Refresh" title={refreshTitle}>
              <span slot="startIcon" class="oj-ux-ico-refresh" aria-hidden="true"></span>
            </oj-button>}
        </span>
      </span>
    </div>
  );
}

export function PageDataProgress({ busy = false, busyLabel = "Loading data" }: Pick<PageShellProps, "busy" | "busyLabel">) {
  if (!busy) return null;
  return (
    <div class="kap-page-data-progress is-active" aria-hidden="false">
      <oj-progress-bar value={-1} aria-label={busyLabel}></oj-progress-bar>
    </div>
  );
}

export function PageShell({
  ariaLabelledBy,
  title,
  titleControls,
  eyebrow,
  breadcrumb,
  actions,
  filters,
  messages,
  children,
  busy = false,
  busyLabel = "Loading",
  onRefresh,
  refreshDisabled = false,
  activityPosition = "heading",
  headingSpacing = "default",
  className = "",
  bodyClassName = "",
  rootAttributes,
  scrollElementRef,
  onScroll
}: PageShellProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollTimerRef = useRef<number | null>(null);
  const [scrolling, setScrolling] = useState(false);

  useEffect(() => () => {
    if (scrollTimerRef.current !== null) window.clearTimeout(scrollTimerRef.current);
  }, []);

  const handleScroll = () => {
    setScrolling(true);
    if (scrollTimerRef.current !== null) window.clearTimeout(scrollTimerRef.current);
    scrollTimerRef.current = window.setTimeout(() => {
      setScrolling(false);
      scrollTimerRef.current = null;
    }, 650);
  };

  return (
    <section class={`kap-page-shell${className ? ` ${className}` : ""}`} aria-labelledby={ariaLabelledBy} aria-busy={busy ? "true" : "false"} data-app-busy-surface="true" {...rootAttributes}>
      <div ref={(element) => { scrollRef.current = element; scrollElementRef?.(element); }}
        class={`kap-page-shell__scroll${scrolling ? " is-scrolling" : ""}`}
        onScroll={(event) => { handleScroll(); onScroll?.(event); }} tabIndex={0}>
        <div class="kap-page-shell__inner">
          <div class={`kap-page-shell__masthead${headingSpacing === "compact" ? " is-compact" : ""}`}>
            {breadcrumb}
            <header class="kap-page-shell__heading">
              <div class={`kap-page-shell__heading-copy${eyebrow ? " has-eyebrow" : ""}`}>
                {eyebrow && <span class="kpi-eyebrow">{eyebrow}</span>}
                <div class="kap-page-shell__title-row">
                  <h1 id={ariaLabelledBy}>{title}</h1>
                  {titleControls && <div class="kap-page-shell__title-controls">{titleControls}</div>}
                </div>
              </div>
              <div class="kap-page-shell__heading-actions">
                {activityPosition === "heading" && <PageActivity busy={busy} busyLabel={busyLabel} onRefresh={onRefresh} refreshDisabled={refreshDisabled} />}
                {actions && <div class="kap-page-shell__actions">{actions}</div>}
              </div>
            </header>
          </div>
          {messages}
          {filters}
          <div class={`kap-page-shell__body${bodyClassName ? ` ${bodyClassName}` : ""}`}>{children}</div>
        </div>
      </div>
    </section>
  );
}
