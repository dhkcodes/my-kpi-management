export type ForecastCompositionDraft = Readonly<{
  totalAmountExact: string;
  newAmountExact: string;
  expansionAmountExact: string;
}>;

const MAX_K_UNSCALED = "999999999999999"; // 9,999,999,999,999.99 K

const normalizeDigits = (value: string): string => value.replace(/^0+(?=\d)/, "");
const addDigits = (left: string, right: string): string => {
  let carry = 0;
  let result = "";
  for (let li = left.length - 1, ri = right.length - 1; li >= 0 || ri >= 0 || carry; li--, ri--) {
    const sum = Number(left[li] ?? 0) + Number(right[ri] ?? 0) + carry;
    result = String(sum % 10) + result;
    carry = Math.floor(sum / 10);
  }
  return normalizeDigits(result);
};
const greaterDigits = (left: string, right: string): boolean => {
  const a = normalizeDigits(left);
  const b = normalizeDigits(right);
  return a.length > b.length || (a.length === b.length && a > b);
};
const internalToRoundedKUnscaled = (internalUnscaled: string): string => {
  const padded = normalizeDigits(internalUnscaled).padStart(6, "0");
  const quotient = normalizeDigits(padded.slice(0, -5));
  return padded.slice(-5, -4) >= "5" ? addDigits(quotient, "1") : quotient;
};

export const forecastAmountExactToKInput = (amount: string | null | undefined): string => {
  if (amount === null || amount === undefined) return "";
  const normalized = amount.trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/.test(normalized)) throw new Error("Invalid exact forecast amount.");
  const [whole, fraction = ""] = normalized.split(".");
  const rounded = internalToRoundedKUnscaled(whole + fraction.padEnd(4, "0"));
  if (greaterDigits(rounded, MAX_K_UNSCALED)) throw new Error("Forecast value exceeds the two-decimal K range.");
  const digits = rounded.padStart(3, "0");
  const kWhole = normalizeDigits(digits.slice(0, -2));
  return `${kWhole}.${digits.slice(-2)}`;
};

export const parseForecastCompositionK = (
  total: string,
  newValue: string,
  expansion: string
): ForecastCompositionDraft | string => {
  const values = [total, newValue, expansion].map((value) => value.trim());
  if (values.some((value) => !/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value))) {
    return "Enter non-negative K values with up to 2 decimals.";
  }
  const unscaled = values.map((value) => {
    const [whole, fraction = ""] = value.split(".");
    return normalizeDigits(whole + fraction.padEnd(2, "0"));
  });
  if (unscaled.some((value) => greaterDigits(value, MAX_K_UNSCALED))) return "Forecast value exceeds the supported two-decimal K range.";
  const [totalUnscaled, newUnscaled, expansionUnscaled] = unscaled;
  if (greaterDigits(addDigits(newUnscaled, expansionUnscaled), totalUnscaled)) return "New + Expansion must not exceed Total.";
  const exact = unscaled.map((value) => normalizeDigits(value + "0"));
  return { totalAmountExact: exact[0], newAmountExact: exact[1], expansionAmountExact: exact[2] };
};
