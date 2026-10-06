import { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import "ojs/ojbutton";
import "ojs/ojprogress-circle";
import "ojs/ojprogress-bar";

type PageShellProps = {
  ariaLabelledBy: string;
  title: ComponentChildren;
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
};

const padTimestampPart = (value: number) => String(value).padStart(2, "0");

export function formatKstTimestamp(value: Date): string {
  const kst = new Date(value.getTime() + 9 * 60 * 60 * 1000);
  return `${kst.getUTCFullYear()}/${padTimestampPart(kst.getUTCMonth() + 1)}/${padTimestampPart(kst.getUTCDate())} `
    + `${padTimestampPart(kst.getUTCHours())}:${padTimestampPart(kst.getUTCMinutes())}:${padTimestampPart(kst.getUTCSeconds())}`;
}

export function PageActivity({
  busy = false,
  busyLabel = "Loading",
  onRefresh,
  refreshDisabled = false,
  lastCompletedAt = null,
  showBusyLabel = true
}: PageActivityProps) {
  if (!busy && !onRefresh && !lastCompletedAt) return null;
  return (
    <div class={`kap-page-activity${busy ? " is-busy" : ""}`} role="status" aria-live="polite">
      {onRefresh && <oj-button class="kap-page-activity__refresh" display="icons" chroming="borderless" disabled={busy || refreshDisabled}
        aria-label="Refresh" title="Refresh" onojAction={() => void onRefresh()}>
        <span slot="startIcon" class="oj-ux-ico-refresh" aria-hidden="true"></span>
        Refresh
      </oj-button>}
      <span class="kap-page-activity__loading-group">
        {lastCompletedAt && <time class="kap-page-activity__completed-at" dateTime={lastCompletedAt.toISOString()}>
          {formatKstTimestamp(lastCompletedAt)}
        </time>}
        <span class={`kap-page-activity__status${busy ? " is-active" : ""}`} aria-hidden={busy ? "false" : "true"}>
          <oj-progress-circle class="kap-page-activity__progress" size="sm" value={busy ? -1 : 0} aria-label={busyLabel}></oj-progress-circle>
          <span class={showBusyLabel ? "" : "oj-helper-hidden-accessible"}>{busyLabel}</span>
        </span>
      </span>
    </div>
  );
}

export function PageDataProgress({ busy = false, busyLabel = "Loading data" }: Pick<PageShellProps, "busy" | "busyLabel">) {
  return (
    <div class={`kap-page-data-progress${busy ? " is-active" : ""}`} aria-hidden={busy ? "false" : "true"}>
      <oj-progress-bar value={busy ? -1 : 0} aria-label={busyLabel}></oj-progress-bar>
    </div>
  );
}

export function PageShell({
  ariaLabelledBy,
  title,
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
                <h1 id={ariaLabelledBy}>{title}</h1>
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
