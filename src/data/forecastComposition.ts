export type ForecastCompositionDraft = Readonly<{
  totalAmount: number;
  newAmount: number;
  expansionAmount: number;
}>;

export const parseForecastCompositionK = (
  total: string,
  newValue: string,
  expansion: string
): ForecastCompositionDraft | string => {
  const values = [total, newValue, expansion].map((value) => value.trim());
  if (values.some((value) => !/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value))) {
    return "Enter non-negative values with up to 2 decimals.";
  }
  const [totalK, newK, expansionK] = values.map(Number);
  if (newK + expansionK > totalK) return "New + Expansion must not exceed Total.";
  return { totalAmount: totalK * 1000, newAmount: newK * 1000, expansionAmount: expansionK * 1000 };
};
