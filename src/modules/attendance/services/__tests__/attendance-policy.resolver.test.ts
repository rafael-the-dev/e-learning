import { describe, it, expect } from "vitest";
import { resolveAttendancePolicy } from "../attendance-policy.resolver";
import type { RawAttendancePolicy } from "../attendance-policy.resolver";

// =============================================================================
// Policy resolution order (pure) — Phase 3 §2 / tests 12–14.
// =============================================================================

function raw(id: string, over: Partial<RawAttendancePolicy> = {}): RawAttendancePolicy {
  return {
    id,
    countExcusedAsPresent: false,
    countRemoteAsPresent: true,
    countLateAsPartial: true,
    atRiskBufferPercentage: 5,
    allowJustification: true,
    requireJustificationApproval: true,
    enforceAttendanceForProgress: false,
    ...over,
  };
}

describe("resolveAttendancePolicy", () => {
  it("12. prefers the LevelSubject override policy over the org default", () => {
    const r = resolveAttendancePolicy(
      raw("ls-policy", { countExcusedAsPresent: true }),
      raw("org-default")
    );
    expect(r.source).toBe("LEVEL_SUBJECT");
    expect(r.policyId).toBe("ls-policy");
    expect(r.countExcusedAsPresent).toBe(true);
  });

  it("13. falls back to the org default when no LevelSubject override", () => {
    const r = resolveAttendancePolicy(null, raw("org-default", { countRemoteAsPresent: false }));
    expect(r.source).toBe("ORG_DEFAULT");
    expect(r.policyId).toBe("org-default");
    expect(r.countRemoteAsPresent).toBe(false);
  });

  it("14. uses the deterministic fallback when no policy exists", () => {
    const r = resolveAttendancePolicy(null, null);
    expect(r.source).toBe("FALLBACK");
    expect(r.policyId).toBeNull();
    expect(r.countExcusedAsPresent).toBe(false);
    expect(r.countRemoteAsPresent).toBe(true);
    expect(r.countLateAsPartial).toBe(true);
    expect(r.atRiskBufferPercentage).toBe(5);
  });

  it("coerces a Prisma Decimal atRiskBufferPercentage to a number", () => {
    const r = resolveAttendancePolicy(null, raw("org-default", { atRiskBufferPercentage: { toString: () => "7.5" } as unknown as number }));
    expect(r.atRiskBufferPercentage).toBe(7.5);
  });
});
