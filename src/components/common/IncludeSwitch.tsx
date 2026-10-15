import { h } from "preact";

/** Application switch shared with Include MTD; intentionally not a JET switch. */
export function IncludeSwitch({ checked, disabled = false, labelId, onToggle }: Readonly<{
  checked: boolean;
  disabled?: boolean;
  labelId: string;
  onToggle: () => void;
}>) {
  return <button type="button" class="consumption-mtd-switch" role="switch" aria-checked={checked}
    aria-labelledby={labelId} disabled={disabled} onClick={onToggle}>
    <span class="consumption-mtd-switch__track" aria-hidden="true"><span></span></span>
  </button>;
}
