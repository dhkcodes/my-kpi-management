// Access the runtime BigInt constructor without requiring ES2020 type-library support
// and without dynamic code evaluation (which would violate a strict CSP).
const integer: (value: string | number) => bigint = globalThis.BigInt;
type ExactInteger = bigint;
type ParsedExactDecimal = Readonly<{
  coefficient: ExactInteger;
  scale: number;
}>;

const EXACT_DECIMAL_PATTERN = /^([+-]?)(\d+)(?:\.(\d+))?$/;

const parseExactDecimal = (value: string): ParsedExactDecimal => {
  const match = EXACT_DECIMAL_PATTERN.exec(value.trim());
  if (!match) throw new Error(`Invalid exact decimal: ${value}`);
  const fraction = match[3] ?? "";
  const magnitude = integer(`${match[2]}${fraction}`);
  return { coefficient: match[1] === "-" ? -magnitude : magnitude, scale: fraction.length };
};

const powerOfTen = (scale: number): ExactInteger => {
  let value = integer(1);
  for (let index = 0; index < scale; index += 1) value *= integer(10);
  return value;
};

const render = (coefficient: ExactInteger, scale: number, fixedScale = false): string => {
  const negative = coefficient < integer(0);
  let digits = (negative ? -coefficient : coefficient).toString().padStart(scale + 1, "0");
  if (scale === 0) return `${negative ? "-" : ""}${digits}`;
  let fraction = digits.slice(-scale);
  if (!fixedScale) fraction = fraction.replace(/0+$/, "");
  digits = digits.slice(0, -scale).replace(/^0+(?=\d)/, "");
  return `${negative ? "-" : ""}${digits}${fraction ? `.${fraction}` : ""}`;
};

const align = (left: ParsedExactDecimal, right: ParsedExactDecimal) => {
  const scale = Math.max(left.scale, right.scale);
  return {
    left: left.coefficient * powerOfTen(scale - left.scale),
    right: right.coefficient * powerOfTen(scale - right.scale),
    scale
  };
};

export const normalizeExactDecimal = (value: string): string => {
  const decimal = parseExactDecimal(value);
  return render(decimal.coefficient, decimal.scale, true);
};

export const addExactDecimals = (left: string, right: string): string => {
  const values = align(parseExactDecimal(left), parseExactDecimal(right));
  return render(values.left + values.right, values.scale);
};

export const subtractExactDecimals = (left: string, right: string): string => {
  const values = align(parseExactDecimal(left), parseExactDecimal(right));
  return render(values.left - values.right, values.scale);
};

export const negateExactDecimal = (value: string): string => {
  const decimal = parseExactDecimal(value);
  return render(-decimal.coefficient, decimal.scale);
};

export const compareExactDecimals = (left: string, right: string): -1 | 0 | 1 => {
  const values = align(parseExactDecimal(left), parseExactDecimal(right));
  return values.left < values.right ? -1 : values.left > values.right ? 1 : 0;
};

export const multiplyExactDecimalByInteger = (value: string, multiplier: number): string => {
  const decimal = parseExactDecimal(value);
  if (!Number.isSafeInteger(multiplier)) throw new Error("Invalid exact integer multiplier.");
  return render(decimal.coefficient * integer(multiplier), decimal.scale);
};

/** Exact integer division rounded to `precision` decimals, with ties away from zero. */
export const divideExactDecimal = (numerator: string, denominator: string, precision: number): string | null => {
  if (!Number.isSafeInteger(precision) || precision < 0) throw new Error("Invalid decimal precision.");
  const left = parseExactDecimal(numerator);
  const right = parseExactDecimal(denominator);
  if (right.coefficient === integer(0)) return null;
  const negative = (left.coefficient < integer(0)) !== (right.coefficient < integer(0));
  const dividend = (left.coefficient < integer(0) ? -left.coefficient : left.coefficient)
    * powerOfTen(right.scale + precision);
  const divisor = (right.coefficient < integer(0) ? -right.coefficient : right.coefficient)
    * powerOfTen(left.scale);
  let quotient = dividend / divisor;
  const remainder = dividend % divisor;
  if (remainder * integer(2) >= divisor) quotient += integer(1);
  return render(negative ? -quotient : quotient, precision, true);
};

/**
 * Percentage display uses two decimal percentage points by default and HALF_UP
 * (ties away from zero). A missing/blank/zero denominator is unavailable, not 0%.
 */
export const formatExactPercent = (
  numerator: string,
  denominator: string | null | undefined,
  precision = 2
): string | null => {
  if (denominator === null || denominator === undefined || denominator.trim() === "") return null;
  const percentage = divideExactDecimal(multiplyExactDecimalByInteger(numerator, 100), denominator, precision);
  return percentage === null ? null : `${percentage}%`;
};

const groupWhole = (whole: string): string => whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** Currency display keeps every API-provided decimal digit; it never projects through Number. */
export const formatExactCurrency = (value: string): string => {
  const normalized = normalizeExactDecimal(value);
  const negative = normalized.startsWith("-");
  const unsigned = negative ? normalized.slice(1) : normalized;
  const [whole, fraction] = unsigned.split(".");
  return `${negative ? "-" : ""}$${groupWhole(whole)}${fraction === undefined ? "" : `.${fraction}`}`;
};

/** Converts base currency to K by moving the decimal point exactly three places. */
export const exactDecimalToK = (value: string): string => {
  const decimal = parseExactDecimal(value);
  return render(decimal.coefficient, decimal.scale + 3, true);
};

export const formatExactK = (value: string): string => {
  const kValue = exactDecimalToK(value);
  const negative = kValue.startsWith("-");
  const unsigned = negative ? kValue.slice(1) : kValue;
  const [whole, fraction] = unsigned.split(".");
  return `${negative ? "-" : ""}$${groupWhole(whole)}${fraction === undefined ? "" : `.${fraction}`} K`;
};

/** Explicitly lossy projection for plotting coordinates only. */
export const exactDecimalToChartCoordinate = (value: string): number => Number(value);
