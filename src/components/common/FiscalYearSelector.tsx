import { h } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { FiscalYear } from "../../data/kpiMockData";

const yearNumber = (year: FiscalYear) => Number(year.slice(2));
const fiscalYear = (year: number) => `FY${String((year + 100) % 100).padStart(2, "0")}` as FiscalYear;

export const fiscalYearWindow = (center: FiscalYear): readonly FiscalYear[] => {
  const value = yearNumber(center);
  return [fiscalYear(value - 1), center, fiscalYear(value + 1)];
};

export function FiscalYearSelector({ selected, current, onSelect, className = "" }: Readonly<{
  selected: FiscalYear;
  current: FiscalYear;
  onSelect: (year: FiscalYear) => void;
  className?: string;
}>) {
  const [open, setOpen] = useState(false);
  const [browseCenter, setBrowseCenter] = useState(current);
  const rootRef = useRef<HTMLDivElement>(null);
  const years = useMemo(() => fiscalYearWindow(browseCenter), [browseCenter]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const move = (offset: number) => setBrowseCenter(fiscalYear(yearNumber(browseCenter) + offset));
  return <div ref={rootRef} class={`fiscal-year-selector ${className}`.trim()}>
    <button type="button" class="fiscal-year-selector__trigger" aria-haspopup="dialog" aria-expanded={open}
      aria-label={`Selected fiscal year ${selected}`} onClick={() => setOpen((value) => !value)}>
      <span>{selected}</span><span class="fiscal-year-selector__chevron" aria-hidden="true">⌄</span>
    </button>
    {open && <div class="fiscal-year-selector__popover" role="dialog" aria-label="Select fiscal year">
      <header class="fiscal-year-selector__header"><strong>Fiscal Year</strong>
        <span class="fiscal-year-selector__navigation">
          <button type="button" aria-label="Show earlier fiscal years" onClick={() => move(-1)}>‹</button>
          <button type="button" aria-label="Show later fiscal years" onClick={() => move(1)}>›</button>
        </span>
      </header>
      <div class="fiscal-year-selector__options" role="radiogroup" aria-label="Fiscal year">
        {years.map((year) => <button key={year} type="button" role="radio" aria-checked={selected === year}
          class={`fiscal-year-selector__row ${selected === year ? "is-selected" : ""}`.trim()}
          onClick={() => { onSelect(year); setOpen(false); }}>
          <span class="fiscal-year-selector__radio" aria-hidden="true"><span /></span>
          <span class="fiscal-year-selector__label">{year}</span>
          {year === current && <span class="fiscal-year-selector__current">Current</span>}
        </button>)}
      </div>
    </div>}
  </div>;
}
