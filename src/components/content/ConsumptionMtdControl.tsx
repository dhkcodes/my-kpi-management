import { h } from "preact";
import { IncludeSwitch } from "../common/IncludeSwitch";
import { formatMtdAppliedDate } from "../../data/mtdDate";

export type ConsumptionMtdControlProps = Readonly<{
  checked: boolean;
  disabled?: boolean;
  mtdAppliedDate?: string | null;
  onToggle: () => void;
  tooltipId: string;
}>;

export function ConsumptionMtdControl({ checked, disabled = false, mtdAppliedDate, onToggle, tooltipId }: ConsumptionMtdControlProps) {
  const updatedOn = formatMtdAppliedDate(mtdAppliedDate ?? null);
  return <div class="consumption-mtd-control">
    <span id={`${tooltipId}-label`} class="consumption-mtd-switch__label">Include MTD</span>
    <span class="consumption-info-tooltip">
      <button type="button" class="consumption-info-tooltip__trigger" aria-label="About Include MTD"
        aria-describedby={tooltipId}>!</button>
      <span id={tooltipId} class="consumption-info-tooltip__content" role="tooltip">
        Includes the latest Month-to-Date Actual once in displayed totals. MTD remains separate from finalized Actual and does not alter stored data.
        {updatedOn && <span class="consumption-info-tooltip__meta">Updated on {updatedOn}</span>}
      </span>
    </span>
    <IncludeSwitch checked={checked} disabled={disabled} labelId={`${tooltipId}-label`} onToggle={onToggle} />
  </div>;
}
