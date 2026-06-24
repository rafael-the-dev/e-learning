export function toDateInputValue(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function defaultOperationsDateRange(): { dateFrom: Date; dateTo: Date } {
  const dateTo = new Date();
  const dateFrom = new Date();
  dateFrom.setDate(dateFrom.getDate() - 30);
  return { dateFrom, dateTo };
}

// A date-only `<input type="date">` value parses to local midnight — without
// this, filtering by `createdAt <= dateTo` would silently exclude every
// delivery on the selected end day itself. The default range (no query
// param) is unaffected — it already uses `new Date()` (the current instant).
export function endOfDay(dateStr: string): Date {
  const d = new Date(dateStr);
  d.setHours(23, 59, 59, 999);
  return d;
}
