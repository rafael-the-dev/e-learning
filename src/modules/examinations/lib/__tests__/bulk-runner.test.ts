import { describe, it, expect } from "vitest";
import { runBulk } from "@/modules/examinations/lib/bulk-runner";
import { BusinessRuleError, NotFoundError } from "@/shared/lib/command";

// Deterministic clock so durationMs is assertable without Date.now.
function clock(): () => number {
  let t = 1000;
  return () => (t += 5);
}

describe("runBulk", () => {
  it("summarises succeeded / skipped / failed with total === processed", async () => {
    const summary = await runBulk<string, string>({
      items: ["a", "b", "c", "d"],
      ref: (x) => x,
      skipCodes: ["ALREADY"],
      now: clock(),
      run: async (x) => {
        if (x === "b") throw new BusinessRuleError("ALREADY");
        if (x === "c") throw new NotFoundError("Thing", x);
        return `ok:${x}`;
      },
    });
    expect(summary.total).toBe(4);
    expect(summary.processed).toBe(4);
    expect(summary.succeeded).toBe(2);
    expect(summary.skipped).toBe(1);
    expect(summary.failed).toBe(1);
    expect(summary.durationMs).toBeGreaterThan(0);
    expect(summary.results.find((r) => r.ref === "a")?.data).toBe("ok:a");
    expect(summary.results.find((r) => r.ref === "b")?.status).toBe("skipped");
    expect(summary.results.find((r) => r.ref === "c")?.code).toBe("NOT_FOUND");
  });

  it("stopOnFailure skips the remainder after the first hard failure", async () => {
    const summary = await runBulk<number, number>({
      items: [1, 2, 3, 4],
      ref: (x) => String(x),
      stopOnFailure: true,
      now: clock(),
      run: async (x) => {
        if (x === 2) throw new BusinessRuleError("BOOM");
        return x;
      },
    });
    expect(summary.succeeded).toBe(1);
    expect(summary.failed).toBe(1);
    expect(summary.skipped).toBe(2);
    expect(summary.results[2].code).toBe("SKIPPED");
    expect(summary.total).toBe(4);
    expect(summary.processed).toBe(4);
  });

  it("sanitises unexpected errors to INTERNAL_ERROR", async () => {
    const summary = await runBulk<string, unknown>({
      items: ["x"],
      ref: (x) => x,
      now: clock(),
      run: async () => {
        throw new Error("raw stack detail");
      },
    });
    expect(summary.failed).toBe(1);
    expect(summary.results[0].code).toBe("INTERNAL_ERROR");
    expect(summary.results[0].message).not.toContain("raw stack");
  });
});
