import { h } from "preact";
import { useEffect, useRef } from "preact/hooks";
import "ojs/ojfilmstrip";
import type { FilmStripElement } from "ojs/ojfilmstrip";
import Context = require("ojs/ojcontext");
import type { FiscalYear } from "../../data/kpiMockData";

const yearNumber = (year: FiscalYear) => Number(year.slice(2));
const fiscalYear = (year: number) => `FY${String(year).padStart(2, "0")}` as FiscalYear;

// The existing API contract remains FY plus exactly two digits, while FY00 and
// FY99 are intentionally unavailable in the UI. Build the stable item set once
// so response renders never replace Film Strip children or their identities.
const FISCAL_YEARS = Object.freeze(Array.from({ length: 98 }, (_, index) => fiscalYear(index + 1)));
const FIRST_FISCAL_YEAR = FISCAL_YEARS[0];
const LAST_FISCAL_YEAR = FISCAL_YEARS[FISCAL_YEARS.length - 1];

const displayFiscalYear = (year: FiscalYear) => `FY ${year.slice(2)}`;

const Arrow = ({ direction }: Readonly<{ direction: "previous" | "next" }>) => (
  <svg class="fiscal-year-selector__chevron" viewBox="0 0 12 20" aria-hidden="true" focusable="false">
    <path d={direction === "previous" ? "M8.5 3.5 3.25 10l5.25 6.5" : "M3.5 3.5 8.75 10 3.5 16.5"} />
  </svg>
);

export function FiscalYearSelector({ selected, current, onSelect, className = "", disabled = false }: Readonly<{
  selected: FiscalYear;
  current: FiscalYear;
  onSelect: (year: FiscalYear) => void;
  className?: string;
  disabled?: boolean;
}>) {
  const stripRef = useRef<FilmStripElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const navigationRunningRef = useRef(false);
  const pendingOffsetsRef = useRef<Array<-1 | 1>>([]);
  const lastEmittedRef = useRef<FiscalYear>(selected);
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;

  useEffect(() => {
    lastEmittedRef.current = selected;
  }, [selected]);

  useEffect(() => {
    viewportRef.current?.toggleAttribute("inert", disabled);
    if (disabled) pendingOffsetsRef.current.length = 0;
  }, [disabled]);

  const processPendingNavigation = async () => {
    if (navigationRunningRef.current || disabledRef.current) return;
    navigationRunningRef.current = true;
    try {
      while (pendingOffsetsRef.current.length && !disabledRef.current) {
        const offset = pendingOffsetsRef.current.shift()!;
        const currentIndex = FISCAL_YEARS.indexOf(lastEmittedRef.current);
        const targetIndex = currentIndex + offset;
        if (currentIndex < 0 || targetIndex < 0 || targetIndex >= FISCAL_YEARS.length) continue;

        const model = stripRef.current?.getPagingModel();
        if (!model) {
          const fallback = FISCAL_YEARS[targetIndex];
          lastEmittedRef.current = fallback;
          onSelect(fallback);
          continue;
        }
        try {
          await model.setPage(targetIndex);
        } catch {
          // Keep visible FY, page state, and requested data aligned if JET
          // rejects navigation. A later user click starts from the unchanged page.
          pendingOffsetsRef.current.length = 0;
          return;
        }
        // PagingModel.setPage resolves before JET's CSS motion completes. The
        // Film Strip's public BusyContext resolves from its transition-end path,
        // so the next allowed queued click starts only after the prior motion.
        try {
          await Context.getContext(stripRef.current!).getBusyContext().whenReady(2000);
        } catch {
          // Never start a second transition when JET did not report readiness.
          pendingOffsetsRef.current.length = 0;
          return;
        }
      }
    } finally {
      navigationRunningRef.current = false;
      if (disabledRef.current) pendingOffsetsRef.current.length = 0;
      else if (pendingOffsetsRef.current.length) void processPendingNavigation();
    }
  };

  const navigate = (offset: -1 | 1) => {
    if (disabledRef.current) return;
    const selectedNumber = yearNumber(lastEmittedRef.current);
    if ((offset === -1 && selectedNumber <= 1) || (offset === 1 && selectedNumber >= 98)) return;
    pendingOffsetsRef.current.push(offset);
    void processPendingNavigation();
  };

  return <div class={`fiscal-year-selector ${className}`.trim()} data-current-fiscal-year={current}
    data-disabled={disabled ? "true" : "false"} aria-disabled={disabled ? "true" : "false"}>
    <button type="button" class="fiscal-year-selector__nav is-previous"
      aria-label={`Previous fiscal year from ${displayFiscalYear(selected)}`}
      disabled={disabled || selected === FIRST_FISCAL_YEAR}
      onClick={() => void navigate(-1)}>
      <Arrow direction="previous" />
    </button>
    <div ref={viewportRef} class="fiscal-year-selector__viewport">
      <oj-film-strip ref={stripRef} class="fiscal-year-selector__filmstrip"
        arrowVisibility="hidden" arrowPlacement="overlay" orientation="horizontal" looping="off"
        maxItemsPerPage={1} currentItem={{ id: selected }}
        translations={{ labelAccFilmStrip: "Fiscal year", labelAccArrowPreviousPage: "Previous fiscal year", labelAccArrowNextPage: "Next fiscal year" }}
        oncurrentItemChanged={(event) => {
          const next = event.detail.value.id as FiscalYear | undefined;
          if (disabledRef.current) return;
          if (!next || next === lastEmittedRef.current || !FISCAL_YEARS.includes(next)) return;
          lastEmittedRef.current = next;
          onSelect(next);
        }}>
        {FISCAL_YEARS.map((year) => <div id={year} key={year} class="fiscal-year-selector__item">{displayFiscalYear(year)}</div>)}
      </oj-film-strip>
    </div>
    <button type="button" class="fiscal-year-selector__nav is-next"
      aria-label={`Next fiscal year from ${displayFiscalYear(selected)}`}
      disabled={disabled || selected === LAST_FISCAL_YEAR}
      onClick={() => void navigate(1)}>
      <Arrow direction="next" />
    </button>
  </div>;
}
