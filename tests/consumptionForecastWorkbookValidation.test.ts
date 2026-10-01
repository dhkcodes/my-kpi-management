import assert from "node:assert/strict";
import { validateForecastWorkbookFile } from "../src/data/forecastWorkbookValidation";

const validXlsxSignature = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
const file = (name: string, type: string, bytes = validXlsxSignature): File => ({
  name,
  type,
  slice: (start?: number, end?: number) => new Blob([bytes]).slice(start, end)
} as File);

const run = async () => {
  assert.equal(await validateForecastWorkbookFile(file("forecast.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")), null);
  assert.equal(await validateForecastWorkbookFile(file("forecast.xlsx", "")), null,
    "Safari and drag-and-drop files with an empty MIME remain valid when extension and ZIP signature match");
  assert.equal(await validateForecastWorkbookFile(file("forecast.xlsx", "application/octet-stream")), null,
    "generic binary MIME remains valid when extension and ZIP signature match");
  assert.equal(await validateForecastWorkbookFile(file("forecast.xlsx", "application/zip")), null,
    "generic ZIP MIME remains valid when extension and ZIP signature match");
  assert.match(await validateForecastWorkbookFile(file("forecast.csv", "text/csv")) ?? "", /\.xlsx/);
  assert.match(await validateForecastWorkbookFile(file("forecast.xlsx", "text/csv")) ?? "", /\.xlsx/);
  assert.match(await validateForecastWorkbookFile(file("forecast.xlsx", "", new Uint8Array([1, 2, 3, 4]))) ?? "", /valid Excel/);
};

void run();
