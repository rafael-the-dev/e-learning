import { describe, it, expect } from "vitest";
import { resolveEnrollmentForRecord } from "../attendance-enrollment-backfill.resolver";
import type { BackfillEnrollmentCandidate } from "@/modules/attendance/types/backfill";

// =============================================================================
// Pure resolver — tier priority, ambiguity, unresolved. No I/O.
// =============================================================================

const session = { courseId: "course-1", classGroupId: "cg-1", courseLevelId: "lvl-1" };

function enr(over: Partial<BackfillEnrollmentCandidate>): BackfillEnrollmentCandidate {
  return {
    id: "e-x",
    courseId: "course-1",
    classGroupId: null,
    currentLevelId: null,
    initialLevelId: null,
    status: "ACTIVE",
    ...over,
  };
}

describe("resolveEnrollmentForRecord — resolution priority", () => {
  it("Tier 1: resolves by matching classGroupId + courseId", () => {
    const r = resolveEnrollmentForRecord(session, [
      enr({ id: "e-1", classGroupId: "cg-1" }),
      enr({ id: "e-2", classGroupId: "cg-other" }),
    ]);
    expect(r).toMatchObject({ outcome: "resolved", enrollmentId: "e-1", tier: 1 });
  });

  it("Tier 2: falls back to currentLevelId === session.courseLevelId", () => {
    const r = resolveEnrollmentForRecord(session, [
      enr({ id: "e-1", classGroupId: null, currentLevelId: "lvl-1" }),
    ]);
    expect(r).toMatchObject({ outcome: "resolved", enrollmentId: "e-1", tier: 2 });
  });

  it("Tier 3: falls back to initialLevelId === session.courseLevelId", () => {
    const r = resolveEnrollmentForRecord(session, [
      enr({ id: "e-1", classGroupId: null, currentLevelId: "lvl-other", initialLevelId: "lvl-1" }),
    ]);
    expect(r).toMatchObject({ outcome: "resolved", enrollmentId: "e-1", tier: 3 });
  });

  it("prefers Tier 1 over Tier 2 when both could match", () => {
    const r = resolveEnrollmentForRecord(session, [
      enr({ id: "e-cg", classGroupId: "cg-1", currentLevelId: "lvl-other" }),
      enr({ id: "e-lvl", classGroupId: "cg-other", currentLevelId: "lvl-1" }),
    ]);
    expect(r).toMatchObject({ outcome: "resolved", enrollmentId: "e-cg", tier: 1 });
  });
});

describe("resolveEnrollmentForRecord — ambiguous", () => {
  it("marks ambiguous when >1 candidate share the class group", () => {
    const r = resolveEnrollmentForRecord(session, [
      enr({ id: "e-1", classGroupId: "cg-1" }),
      enr({ id: "e-2", classGroupId: "cg-1" }),
    ]);
    expect(r.outcome).toBe("ambiguous");
    expect(r.tier).toBe(1);
    expect(r.candidateIds).toEqual(["e-1", "e-2"]);
  });

  it("marks ambiguous when >1 candidate share the current level", () => {
    const r = resolveEnrollmentForRecord(session, [
      enr({ id: "e-1", classGroupId: null, currentLevelId: "lvl-1" }),
      enr({ id: "e-2", classGroupId: null, currentLevelId: "lvl-1" }),
    ]);
    expect(r.outcome).toBe("ambiguous");
    expect(r.tier).toBe(2);
  });
});

describe("resolveEnrollmentForRecord — unresolved", () => {
  it("unresolved when the student has no non-cancelled enrolment in the course", () => {
    const r = resolveEnrollmentForRecord(session, [enr({ id: "e-1", courseId: "course-OTHER", classGroupId: "cg-1" })]);
    expect(r.outcome).toBe("unresolved");
  });

  it("unresolved when a same-course enrolment exists but no tier matches", () => {
    const r = resolveEnrollmentForRecord(session, [
      enr({ id: "e-1", classGroupId: "cg-other", currentLevelId: "lvl-other", initialLevelId: "lvl-other" }),
    ]);
    expect(r.outcome).toBe("unresolved");
  });

  it("does NOT guess when session has no courseLevel and class group differs", () => {
    const noLevelSession = { courseId: "course-1", classGroupId: "cg-1", courseLevelId: null };
    const r = resolveEnrollmentForRecord(noLevelSession, [
      enr({ id: "e-1", classGroupId: "cg-other", currentLevelId: "lvl-1", initialLevelId: "lvl-1" }),
    ]);
    // Tier 1 misses (different class group); tiers 2/3 cannot run without a level.
    expect(r.outcome).toBe("unresolved");
  });
});
