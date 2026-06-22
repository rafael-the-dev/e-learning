import { buildCsv } from "@/modules/reports/finance/utils/csv-export";
import type { ImportRowExecutionResult } from "@/modules/students/import/types";

// =============================================================================
// ERROR REPORT SERVICE
// Builds the downloadable rowNumber,error CSV from a completed job's
// per-row execution results.
// =============================================================================

export function buildErrorReportCsv(rows: ImportRowExecutionResult[]): string {
  const failedRows = rows.filter((r) => r.outcome !== "IMPORTED");
  return buildCsv(
    ["rowNumber", "error"],
    failedRows.map((r) => [r.rowNumber, r.messages.join("; ")])
  );
}
