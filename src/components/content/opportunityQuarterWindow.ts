const seoulDateParts = (today: Date) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(today);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  return { year: value("year"), month: value("month") };
};

const currentFiscalPeriod = (today = new Date()) => {
  const { year, month } = seoulDateParts(today);
  const fiscalYear = (month >= 6 ? year + 1 : year) % 100;
  const quarter = month >= 6 && month <= 8 ? 1 : month >= 9 && month <= 11 ? 2 : month === 12 || month <= 2 ? 3 : 4;
  return { fiscalYear, quarter };
};

export const targetOptionsFor = (today = new Date()) => {
  const current = currentFiscalPeriod(today);
  const currentIndex = current.fiscalYear * 4 + current.quarter - 1;
  return Array.from({ length: 11 }, (_, index) => {
    const absolute = currentIndex + index - 5;
    const fiscalYear = Math.floor(absolute / 4);
    const quarter = absolute % 4 + 1;
    return `FY${String((fiscalYear + 100) % 100).padStart(2, "0")} Q${quarter}`;
  });
};
