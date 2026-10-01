const FORECAST_XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const GENERIC_BINARY_MIME_TYPES = new Set(["", "application/octet-stream", "application/zip", FORECAST_XLSX_MIME]);

export const validateForecastWorkbookFile = async (file: File): Promise<string | null> => {
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    return "Forecast Import supports Excel (.xlsx) files only.";
  }
  if (!GENERIC_BINARY_MIME_TYPES.has(file.type.toLowerCase())) {
    return "Forecast Import supports Excel (.xlsx) files only.";
  }
  const signature = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  const isZip = signature.length === 4 && signature[0] === 0x50 && signature[1] === 0x4b
    && ((signature[2] === 0x03 && signature[3] === 0x04)
      || (signature[2] === 0x05 && signature[3] === 0x06)
      || (signature[2] === 0x07 && signature[3] === 0x08));
  return isZip ? null : "Forecast Import supports valid Excel (.xlsx) workbooks only.";
};
