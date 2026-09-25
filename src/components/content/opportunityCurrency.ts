export type OpportunityCurrencyField = "arrUsd" | "arrKrw" | "acrUsd" | "acrKrw";

export type OpportunityCurrencyValues = Readonly<{
  arrUsd: number | null;
  arrKrw: number | null;
  acrUsd: number | null;
  acrKrw: number | null;
}>;

const parseAmount = (value: string): number | null => {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Converts only the edited ARR/ACR pair. USD -> KRW rounds to the nearest won;
 * KRW -> USD rounds to cents. Existing persisted amounts are never recalculated
 * merely because the configured exchange rate changed.
 */
export function updateOpportunityCurrencyPair(
  current: OpportunityCurrencyValues,
  field: OpportunityCurrencyField,
  rawValue: string,
  exchangeRate: number | null | undefined,
): Partial<OpportunityCurrencyValues> {
  const value = parseAmount(rawValue);
  const next: { -readonly [K in keyof OpportunityCurrencyValues]?: OpportunityCurrencyValues[K] } = {
    [field]: value,
  };
  if (!exchangeRate || !Number.isFinite(exchangeRate) || exchangeRate <= 0) return next;

  if (field === "arrUsd") next.arrKrw = value === null ? null : Math.round(value * exchangeRate);
  else if (field === "arrKrw") next.arrUsd = value === null ? null : Number((value / exchangeRate).toFixed(2));
  else if (field === "acrUsd") next.acrKrw = value === null ? null : Math.round(value * exchangeRate);
  else next.acrUsd = value === null ? null : Number((value / exchangeRate).toFixed(2));
  return next;
}
