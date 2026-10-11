import { h } from "preact";
import { useEffect, useRef } from "preact/hooks";
import "ojs/ojfilmstrip";
import type { FilmStripElement } from "ojs/ojfilmstrip";
import Context = require("ojs/ojcontext");
import type { FiscalYear } from "../../data/kpiMockData";

const yearNumber = (year: FiscalYear) => Number(year.slice(2));
const fiscalYear = (year: number) => `FY${String((year + 100) % 100).padStart(2, "0")}` as FiscalYear;

// FiscalYear is defined by the API as FY plus exactly two digits. Generate that
// complete namespace once: response renders then preserve every Film Strip item
// and there are no data-derived or manually chosen past/future boundaries.
const FISCAL_YEARS = Object.freeze(Array.from({ length: 100 }, (_, year) => fiscalYear(year)));
const normalizePage = (page: number) => (page + FISCAL_YEARS.length) % FISCAL_YEARS.length;

const displayFiscalYear = (year: FiscalYear) => `FY ${year.slice(2)}`;

const Arrow = ({ direction }: Readonly<{ direction: "previous" | "next" }>) => (
  <svg class="fiscal-year-selector__chevron" viewBox="0 0 12 20" aria-hidden="true" focusable="false">
    <path d={direction === "previous" ? "M8.5 3.5 3.25 10l5.25 6.5" : "M3.5 3.5 8.75 10 3.5 16.5"} />
  </svg>
);

export function FiscalYearSelector({ selected, current, onSelect, className = "" }: Readonly<{
  selected: FiscalYear;
  current: FiscalYear;
  onSelect: (year: FiscalYear) => void;
  className?: string;
}>) {
  const stripRef = useRef<FilmStripElement | null>(null);
  const navigationRunningRef = useRef(false);
  const pendingOffsetsRef = useRef<Array<-1 | 1>>([]);
  const lastEmittedRef = useRef<FiscalYear>(selected);

  useEffect(() => {
    lastEmittedRef.current = selected;
  }, [selected]);

  const processPendingNavigation = async () => {
    if (navigationRunningRef.current) return;
    navigationRunningRef.current = true;
    try {
      while (pendingOffsetsRef.current.length) {
        const offset = pendingOffsetsRef.current.shift()!;
        const model = stripRef.current?.getPagingModel();
        if (!model) {
          const fallback = fiscalYear(yearNumber(lastEmittedRef.current) + offset);
          lastEmittedRef.current = fallback;
          onSelect(fallback);
          continue;
        }
        try {
          const currentPage = model.getPage();
          const targetPage = normalizePage(currentPage + offset);
          const wrapsNamespace = (offset === -1 && currentPage === 0)
            || (offset === 1 && currentPage === FISCAL_YEARS.length - 1);
          await model.setPage(targetPage, wrapsNamespace
            ? { loopDirection: offset === -1 ? "prev" : "next" }
            : undefined);
        } catch {
          // Keep visible FY, page state, and requested data aligned if JET
          // rejects navigation. A later user click starts from the unchanged page.
          pendingOffsetsRef.current.length = 0;
          return;
        }
        // PagingModel.setPage resolves before JET's CSS motion completes. The
        // Film Strip's public BusyContext resolves from its transition-end path,
        // so the next queued click starts only after the prior motion is done.
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
      if (pendingOffsetsRef.current.length) void processPendingNavigation();
    }
  };

  const navigate = (offset: -1 | 1) => {
    pendingOffsetsRef.current.push(offset);
    void processPendingNavigation();
  };

  return <div class={`fiscal-year-selector ${className}`.trim()} data-current-fiscal-year={current}>
    <button type="button" class="fiscal-year-selector__nav is-previous"
      aria-label={`Previous fiscal year from ${displayFiscalYear(selected)}`}
      onClick={() => void navigate(-1)}>
      <Arrow direction="previous" />
    </button>
    <div class="fiscal-year-selector__viewport">
      <oj-film-strip ref={stripRef} class="fiscal-year-selector__filmstrip"
        arrowVisibility="hidden" arrowPlacement="overlay" orientation="horizontal" looping="page"
        maxItemsPerPage={1} currentItem={{ id: selected }}
        translations={{ labelAccFilmStrip: "Fiscal year", labelAccArrowPreviousPage: "Previous fiscal year", labelAccArrowNextPage: "Next fiscal year" }}
        oncurrentItemChanged={(event) => {
          const next = event.detail.value.id as FiscalYear | undefined;
          if (!next || next === lastEmittedRef.current || !FISCAL_YEARS.includes(next)) return;
          lastEmittedRef.current = next;
          onSelect(next);
        }}>
        {FISCAL_YEARS.map((year) => <div id={year} key={year} class="fiscal-year-selector__item">{displayFiscalYear(year)}</div>)}
      </oj-film-strip>
    </div>
    <button type="button" class="fiscal-year-selector__nav is-next"
      aria-label={`Next fiscal year from ${displayFiscalYear(selected)}`}
      onClick={() => void navigate(1)}>
      <Arrow direction="next" />
    </button>
  </div>;
}
