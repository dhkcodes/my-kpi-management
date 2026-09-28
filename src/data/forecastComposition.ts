export type ForecastCompositionDraft = Readonly<{
  totalAmountExact: string;
  newAmountExact: string;
  expansionAmountExact: string;
}>;

const NUMBER_20_4_MAX_UNSCALED = "99999999999999999999";

const normalizeDigits = (value: string): string => value.replace(/^0+(?=\d)/, "");
const addDigits = (left: string, right: string): string => {
  let carry = 0;
  let result = "";
  for (let leftIndex = left.length - 1, rightIndex = right.length - 1; leftIndex >= 0 || rightIndex >= 0 || carry; leftIndex--, rightIndex--) {
    const sum = Number(left[leftIndex] ?? 0) + Number(right[rightIndex] ?? 0) + carry;
    result = String(sum % 10) + result;
    carry = Math.floor(sum / 10);
  }
  return normalizeDigits(result);
};
const exceedsNumber20Scale4 = (value: string): boolean => {
  const normalized = normalizeDigits(value);
  return normalized.length > NUMBER_20_4_MAX_UNSCALED.length
    || (normalized.length === NUMBER_20_4_MAX_UNSCALED.length && normalized > NUMBER_20_4_MAX_UNSCALED);
};
const greaterDigits = (left: string, right: string): boolean => {
  const normalizedLeft = normalizeDigits(left);
  const normalizedRight = normalizeDigits(right);
  return normalizedLeft.length > normalizedRight.length
    || (normalizedLeft.length === normalizedRight.length && normalizedLeft > normalizedRight);
};

const internalDecimalFromKUnscaled = (unscaled: string): string => {
  const digits = normalizeDigits(unscaled).padStart(8, "0");
  const whole = digits.slice(0, -4).replace(/^0+(?=\d)/, "");
  const fraction = digits.slice(-4).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
};

export const forecastAmountExactToKInput = (amount: string | null | undefined): string => {
  if (amount === null || amount === undefined) return "";
  const normalized = amount.trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/.test(normalized)) {
    throw new Error("Invalid exact forecast amount.");
  }
  const [whole, fraction = ""] = normalized.split(".");
  const internalUnscaled = normalizeDigits(whole + fraction.padEnd(4, "0"));
  const digits = internalUnscaled.padStart(8, "0");
  const kWhole = digits.slice(0, -7).replace(/^0+(?=\d)/, "");
  const kFraction = digits.slice(-7).replace(/0+$/, "");
  return kFraction ? `${kWhole}.${kFraction}` : kWhole;
};

export const parseForecastCompositionK = (
  total: string,
  newValue: string,
  expansion: string
): ForecastCompositionDraft | string => {
  const values = [total, newValue, expansion].map((value) => value.trim());
  if (values.some((value) => !/^(?:0|[1-9]\d*)(?:\.\d{1,7})?$/.test(value))) {
    return "Enter non-negative K values with up to 7 decimals.";
  }
  const unscaled = values.map((value) => {
    const [whole, fraction = ""] = value.split(".");
    return normalizeDigits(whole + fraction.padEnd(7, "0"));
  });
  if (unscaled.some(exceedsNumber20Scale4)) {
    return "Forecast value must fit NUMBER(20,4).";
  }
  const [totalUnscaled, newUnscaled, expansionUnscaled] = unscaled;
  const classifiedUnscaled = addDigits(newUnscaled, expansionUnscaled);
  if (greaterDigits(classifiedUnscaled, totalUnscaled)) return "New + Expansion must not exceed Total.";
  const exact = unscaled.map(internalDecimalFromKUnscaled);
  return {
    totalAmountExact: exact[0], newAmountExact: exact[1], expansionAmountExact: exact[2]
  };
};
