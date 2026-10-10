import { h } from "preact";
import { useEffect, useMemo, useRef } from "preact/hooks";
import "ojs/ojfilmstrip";
import type { FilmStripElement } from "ojs/ojfilmstrip";
import type { FiscalYear } from "../../data/kpiMockData";

const yearNumber = (year: FiscalYear) => Number(year.slice(2));
const fiscalYear = (year: number) => `FY${String((year + 100) % 100).padStart(2, "0")}` as FiscalYear;

export const fiscalYearWindow = (center: FiscalYear): readonly FiscalYear[] => {
  const value = yearNumber(center);
  return [fiscalYear(value - 1), center, fiscalYear(value + 1)];
};

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
  const navigationLockedRef = useRef(false);
  const years = useMemo(() => fiscalYearWindow(selected), [selected]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => stripRef.current?.refresh());
    return () => window.cancelAnimationFrame(frame);
  }, [selected]);

  const navigate = async (offset: -1 | 1) => {
    if (navigationLockedRef.current) return;
    navigationLockedRef.current = true;
    const fallback = fiscalYear(yearNumber(selected) + offset);
    try {
      const model = stripRef.current?.getPagingModel();
      if (!model) {
        onSelect(fallback);
        return;
      }
      const targetPage = model.getPage() + offset;
      await model.setPage(targetPage);
    } catch {
      onSelect(fallback);
    } finally {
      window.setTimeout(() => { navigationLockedRef.current = false; }, 80);
    }
  };

  return <div class={`fiscal-year-selector ${className}`.trim()} data-current-fiscal-year={current}>
    <button type="button" class="fiscal-year-selector__nav is-previous"
      aria-label={`Previous fiscal year from ${displayFiscalYear(selected)}`}
      onClick={() => void navigate(-1)}>
      <Arrow direction="previous" />
    </button>
    <div class="fiscal-year-selector__viewport">
      <oj-film-strip ref={stripRef} class="fiscal-year-selector__filmstrip"
        arrowVisibility="hidden" arrowPlacement="overlay" orientation="horizontal" looping="off"
        maxItemsPerPage={1} currentItem={{ id: selected }}
        translations={{ labelAccFilmStrip: "Fiscal year", labelAccArrowPreviousPage: "Previous fiscal year", labelAccArrowNextPage: "Next fiscal year" }}
        oncurrentItemChanged={(event) => {
          const next = event.detail.value.id as FiscalYear | undefined;
          if (next && next !== selected && years.includes(next)) onSelect(next);
        }}>
        {years.map((year) => <div id={year} key={year} class="fiscal-year-selector__item">{displayFiscalYear(year)}</div>)}
      </oj-film-strip>
    </div>
    <button type="button" class="fiscal-year-selector__nav is-next"
      aria-label={`Next fiscal year from ${displayFiscalYear(selected)}`}
      onClick={() => void navigate(1)}>
      <Arrow direction="next" />
    </button>
  </div>;
}
