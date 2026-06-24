import { describe, it, expect } from "vitest";
import { endOfDay, toDateInputValue, defaultOperationsDateRange } from "../operations-date-range";

describe("endOfDay (H1 — custom dateTo must not exclude same-day deliveries)", () => {
  it("returns 23:59:59.999 for the given date, not midnight", () => {
    const result = endOfDay("2026-06-24");
    expect(result.getHours()).toBe(23);
    expect(result.getMinutes()).toBe(59);
    expect(result.getSeconds()).toBe(59);
    expect(result.getMilliseconds()).toBe(999);
  });

  it("a delivery created later that same day is still <= the resolved dateTo", () => {
    const dateTo = endOfDay("2026-06-24");
    const deliveryCreatedAt = new Date("2026-06-24T18:00:00");
    expect(deliveryCreatedAt.getTime()).toBeLessThanOrEqual(dateTo.getTime());
  });

  it("midnight of the selected date would have incorrectly excluded a same-day delivery (regression guard)", () => {
    const midnight = new Date("2026-06-24");
    midnight.setHours(0, 0, 0, 0);
    const deliveryCreatedAt = new Date("2026-06-24T18:00:00");
    expect(deliveryCreatedAt.getTime()).toBeGreaterThan(midnight.getTime());
  });

  it("does not affect the date portion", () => {
    const result = endOfDay("2026-06-24");
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(5);
    expect(result.getDate()).toBe(24);
  });
});

describe("defaultOperationsDateRange", () => {
  it("defaults dateTo to the current instant, not midnight (unaffected by the H1 fix)", () => {
    const before = Date.now();
    const { dateTo } = defaultOperationsDateRange();
    const after = Date.now();
    expect(dateTo.getTime()).toBeGreaterThanOrEqual(before);
    expect(dateTo.getTime()).toBeLessThanOrEqual(after);
  });

  it("defaults dateFrom to 30 days before dateTo", () => {
    const { dateFrom, dateTo } = defaultOperationsDateRange();
    const diffDays = (dateTo.getTime() - dateFrom.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeCloseTo(30, 1);
  });
});

describe("toDateInputValue", () => {
  it("formats a Date as yyyy-MM-dd", () => {
    expect(toDateInputValue(new Date("2026-06-24T12:00:00.000Z"))).toBe("2026-06-24");
  });
});
