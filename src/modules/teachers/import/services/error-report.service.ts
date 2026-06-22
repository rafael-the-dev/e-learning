import { buildCsv } from "@/modules/reports/finance/utils/csv-export";
import type { ImportRowExecutionResult } from "@/modules/teachers/import/types";

// =============================================================================
// ERROR REPORT SERVICE
// Builds the downloadable rowNumber,field,message,severity CSV from a
// completed job's per-row execution results — one CSV row per issue, so a
// row with multiple problems produces multiple lines sharing its rowNumber.
// Covers both validation-stage issues (SKIPPED rows) and execution-stage
// failures (FAILED rows, tagged with field "_execution").
// =============================================================================

export function buildErrorReportCsv(rows: ImportRowExecutionResult[]): string {
  const failedRows = rows.filter((r) => r.outcome !== "IMPORTED");
  const lines = failedRows.flatMap((r) =>
    r.issues.length > 0
      ? r.issues.map((issue) => [r.rowNumber, issue.field, issue.message, issue.severity])
      : [[r.rowNumber, "_geral", r.messages.join("; ") || "Erro desconhecido", "ERROR"]]
  );
  return buildCsv(["rowNumber", "field", "message", "severity"], lines);
}
