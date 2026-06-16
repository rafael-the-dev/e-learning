// =============================================================================
// CSV EXPORT UTILITIES
// All reports share the same serialization helpers.
// =============================================================================

export function escapeCsvValue(value: unknown): string {
  if (value == null) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildCsvRow(values: unknown[]): string {
  return values.map(escapeCsvValue).join(",");
}

export function buildCsv(headers: string[], rows: unknown[][]): string {
  const lines = [buildCsvRow(headers), ...rows.map(buildCsvRow)];
  return lines.join("\r\n");
}

export function formatCsvDate(date: Date | null | undefined): string {
  if (!date) return "";
  return date.toLocaleDateString("pt-PT");
}

export function formatCsvAmount(amount: number): string {
  return amount.toFixed(2);
}
