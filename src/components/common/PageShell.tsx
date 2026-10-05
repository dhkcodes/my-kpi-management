import { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import "ojs/ojbutton";
import "ojs/ojprogress-circle";

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

export function PageActivity({ busy = false, busyLabel = "Loading", onRefresh, refreshDisabled = false }: Pick<PageShellProps, "busy" | "busyLabel" | "onRefresh" | "refreshDisabled">) {
  if (!busy && !onRefresh) return null;
  return (
    <div class={`kap-page-activity${busy ? " is-busy" : ""}`} role="status" aria-live="polite">
      {busy && <><oj-progress-circle class="kap-page-activity__progress" size="sm" value={-1} aria-label={busyLabel}></oj-progress-circle><span>{busyLabel}</span></>}
      {onRefresh && <oj-button class="kap-page-activity__refresh" display="icons" chroming="borderless" disabled={busy || refreshDisabled}
        aria-label="Refresh" title="Refresh" onojAction={() => void onRefresh()}>
        <span slot="startIcon" class="oj-ux-ico-refresh" aria-hidden="true"></span>
        Refresh
      </oj-button>}
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
          {breadcrumb}
          <header class="kap-page-shell__heading">
            <div class="kap-page-shell__heading-copy">
              {eyebrow && <span class="kpi-eyebrow">{eyebrow}</span>}
              <h1 id={ariaLabelledBy}>{title}</h1>
            </div>
            <div class="kap-page-shell__heading-actions">
              <PageActivity busy={busy} busyLabel={busyLabel} onRefresh={onRefresh} refreshDisabled={refreshDisabled} />
              {actions && <div class="kap-page-shell__actions">{actions}</div>}
            </div>
          </header>
          {messages}
          {filters}
          <div class={`kap-page-shell__body${bodyClassName ? ` ${bodyClassName}` : ""}`}>{children}</div>
        </div>
      </div>
    </section>
  );
}
