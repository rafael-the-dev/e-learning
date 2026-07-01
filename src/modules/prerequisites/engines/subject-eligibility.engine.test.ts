import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  decideSubjectEligibility,
  evaluateSubjectEligibility,
  type SubjectEligibilityDecisionInput,
  type EligibilityGroupInput,
  type EligibilityPrerequisiteItemInput,
  type EligibilityStudentProgressInput,
  type EligibilityWaiverInput,
} from "@/modules/prerequisites/engines/subject-eligibility.engine";
import { SUBJECT_ELIGIBILITY_STATUS } from "@/modules/prerequisites/types";

// ─── Test helpers ─────────────────────────────────────────────────────────────

let seq = 0;

function item(overrides: Partial<EligibilityPrerequisiteItemInput> = {}): EligibilityPrerequisiteItemInput {
  return {
    id: `item-${++seq}`,
    prerequisiteLevelSubjectId: `prereq-${seq}`,
    requirementType: "MUST_PASS",
    minimumRequiredGrade: null,
    subjectName: `Prereq ${seq}`,
    ...overrides,
  };
}

function group(overrides: Partial<EligibilityGroupInput> = {}): EligibilityGroupInput {
  return { id: `grp-${++seq}`, name: null, logicType: "ALL", items: [], ...overrides };
}

function prog(
  levelSubjectId: string,
  status: string,
  finalGrade: number | null = null
): EligibilityStudentProgressInput {
  return { levelSubjectId, status, finalGrade };
}

function input(overrides: Partial<SubjectEligibilityDecisionInput> = {}): SubjectEligibilityDecisionInput {
  return {
    levelSubjectId: "target",
    enrollmentExists: true,
    targetSubjectStatus: null,
    groups: [],
    waivers: [],
    studentProgress: [],
    ...overrides,
  };
}

const S = SUBJECT_ELIGIBILITY_STATUS;

describe("decideSubjectEligibility", () => {
  beforeEach(() => {
    seq = 0;
  });

  // ── 1. No prerequisites ───────────────────────────────────────────────────
  it("no prerequisites → ELIGIBLE", () => {
    const result = decideSubjectEligibility(input({ groups: [] }));
    expect(result.status).toBe(S.ELIGIBLE);
    expect(result.isEligible).toBe(true);
  });

  // ── 2. ALL group satisfied ─────────────────────────────────────────────────
  it("ALL group fully satisfied → ELIGIBLE", () => {
    const a = item({ prerequisiteLevelSubjectId: "A", requirementType: "MUST_PASS" });
    const b = item({ prerequisiteLevelSubjectId: "B", requirementType: "MUST_PASS" });
    const result = decideSubjectEligibility(
      input({
        groups: [group({ logicType: "ALL", items: [a, b] })],
        studentProgress: [prog("A", "PASSED"), prog("B", "PASSED")],
      })
    );
    expect(result.status).toBe(S.ELIGIBLE);
  });

  // ── 3. ALL group missing one prerequisite ──────────────────────────────────
  it("ALL group missing one item → PENDING_PREREQUISITE with the missing subject", () => {
    const a = item({ prerequisiteLevelSubjectId: "A", requirementType: "MUST_PASS" });
    const b = item({ prerequisiteLevelSubjectId: "B", requirementType: "MUST_PASS", subjectName: "Física" });
    const result = decideSubjectEligibility(
      input({
        groups: [group({ logicType: "ALL", items: [a, b] })],
        studentProgress: [prog("A", "PASSED")], // B missing
      })
    );
    expect(result.status).toBe(S.PENDING_PREREQUISITE);
    expect(result.isEligible).toBe(false);
    expect(result.missingPrerequisites).toHaveLength(1);
    const missing = result.missingPrerequisites[0].items.map((i) => i.levelSubjectId);
    expect(missing).toContain("B");
    expect(result.missingPrerequisites[0].items[0].subjectName).toBe("Física");
  });

  // ── 4. ANY group satisfied ─────────────────────────────────────────────────
  it("ANY group with one item satisfied → ELIGIBLE", () => {
    const a = item({ prerequisiteLevelSubjectId: "A", requirementType: "MUST_PASS" });
    const b = item({ prerequisiteLevelSubjectId: "B", requirementType: "MUST_PASS" });
    const result = decideSubjectEligibility(
      input({
        groups: [group({ logicType: "ANY", items: [a, b] })],
        studentProgress: [prog("A", "PASSED")], // B not passed, but ANY needs only one
      })
    );
    expect(result.status).toBe(S.ELIGIBLE);
  });

  // ── 5. ANY group none satisfied ────────────────────────────────────────────
  it("ANY group with no item satisfied → PENDING_PREREQUISITE", () => {
    const a = item({ prerequisiteLevelSubjectId: "A", requirementType: "MUST_PASS" });
    const b = item({ prerequisiteLevelSubjectId: "B", requirementType: "MUST_PASS" });
    const result = decideSubjectEligibility(
      input({
        groups: [group({ logicType: "ANY", items: [a, b] })],
        studentProgress: [prog("A", "IN_PROGRESS"), prog("B", "FAILED")],
      })
    );
    expect(result.status).toBe(S.PENDING_PREREQUISITE);
  });

  // ── 6. Multiple groups are AND-ed ──────────────────────────────────────────
  it("multiple groups are AND-ed: one satisfied, one not → BLOCKED (PENDING_PREREQUISITE)", () => {
    const groupA = group({ id: "gA", logicType: "ALL", items: [item({ prerequisiteLevelSubjectId: "A" })] });
    const groupB = group({ id: "gB", logicType: "ALL", items: [item({ prerequisiteLevelSubjectId: "B" })] });
    const result = decideSubjectEligibility(
      input({
        groups: [groupA, groupB],
        studentProgress: [prog("A", "PASSED")], // group B unmet
      })
    );
    expect(result.status).toBe(S.PENDING_PREREQUISITE);
    expect(result.missingPrerequisites).toHaveLength(1);
    expect(result.missingPrerequisites[0].groupId).toBe("gB");
  });

  // ── 7. MUST_PASS ───────────────────────────────────────────────────────────
  it("MUST_PASS requires status PASSED (COMPLETED does not satisfy it)", () => {
    const it1 = item({ prerequisiteLevelSubjectId: "A", requirementType: "MUST_PASS" });
    const notPassed = decideSubjectEligibility(
      input({ groups: [group({ items: [it1] })], studentProgress: [prog("A", "COMPLETED")] })
    );
    expect(notPassed.status).toBe(S.PENDING_PREREQUISITE);

    const passed = decideSubjectEligibility(
      input({ groups: [group({ items: [item({ prerequisiteLevelSubjectId: "A", requirementType: "MUST_PASS" })] })], studentProgress: [prog("A", "PASSED")] })
    );
    expect(passed.status).toBe(S.ELIGIBLE);
  });

  // ── 8. MUST_COMPLETE ───────────────────────────────────────────────────────
  it("MUST_COMPLETE accepts PASSED, COMPLETED and FAILED, but not IN_PROGRESS", () => {
    const build = (status: string) =>
      decideSubjectEligibility(
        input({
          groups: [group({ items: [item({ prerequisiteLevelSubjectId: "A", requirementType: "MUST_COMPLETE" })] })],
          studentProgress: [prog("A", status)],
        })
      ).status;

    expect(build("PASSED")).toBe(S.ELIGIBLE);
    expect(build("COMPLETED")).toBe(S.ELIGIBLE);
    expect(build("FAILED")).toBe(S.ELIGIBLE);
    expect(build("IN_PROGRESS")).toBe(S.PENDING_PREREQUISITE);
  });

  // ── 9. MINIMUM_GRADE ───────────────────────────────────────────────────────
  it("MINIMUM_GRADE requires finalGrade >= minimumRequiredGrade", () => {
    const build = (grade: number | null, min: number | null) =>
      decideSubjectEligibility(
        input({
          groups: [
            group({
              items: [item({ prerequisiteLevelSubjectId: "A", requirementType: "MINIMUM_GRADE", minimumRequiredGrade: min })],
            }),
          ],
          studentProgress: [prog("A", "PASSED", grade)],
        })
      ).status;

    expect(build(80, 70)).toBe(S.ELIGIBLE);
    expect(build(60, 70)).toBe(S.PENDING_PREREQUISITE);
    expect(build(70, 70)).toBe(S.ELIGIBLE); // boundary
    expect(build(null, 70)).toBe(S.PENDING_PREREQUISITE); // no grade recorded
    expect(build(55, null)).toBe(S.ELIGIBLE); // null min defaults to 50
    expect(build(40, null)).toBe(S.PENDING_PREREQUISITE); // below default 50
  });

  // ── 10. PrerequisiteWaiver ─────────────────────────────────────────────────
  it("full waiver (null group + null item) bypasses all prerequisites", () => {
    const result = decideSubjectEligibility(
      input({
        groups: [group({ items: [item({ prerequisiteLevelSubjectId: "A" })] })],
        studentProgress: [], // A not done
        waivers: [{ prerequisiteGroupId: null, prerequisiteItemId: null }],
      })
    );
    expect(result.status).toBe(S.ELIGIBLE);
  });

  it("group-level waiver skips that group; item-level waiver skips that item", () => {
    const groupWaived = group({ id: "gW", items: [item({ prerequisiteLevelSubjectId: "A" })] });
    const groupResult = decideSubjectEligibility(
      input({
        groups: [groupWaived],
        studentProgress: [],
        waivers: [{ prerequisiteGroupId: "gW", prerequisiteItemId: null }],
      })
    );
    expect(groupResult.status).toBe(S.ELIGIBLE);

    const it1 = item({ id: "iW", prerequisiteLevelSubjectId: "A" });
    const itemResult = decideSubjectEligibility(
      input({
        groups: [group({ logicType: "ALL", items: [it1] })],
        studentProgress: [],
        waivers: [{ prerequisiteGroupId: null, prerequisiteItemId: "iW" }],
      })
    );
    expect(itemResult.status).toBe(S.ELIGIBLE);
  });

  it("a revoked waiver does not bypass (IO layer passes only ACTIVE waivers)", () => {
    // The IO wrapper filters status:"ACTIVE", so a revoked waiver never reaches
    // the decision — modeled here as no waiver present.
    const result = decideSubjectEligibility(
      input({
        groups: [group({ items: [item({ prerequisiteLevelSubjectId: "A" })] })],
        studentProgress: [],
        waivers: [],
      })
    );
    expect(result.status).toBe(S.PENDING_PREREQUISITE);
  });

  // ── 11. ALREADY_COMPLETED ──────────────────────────────────────────────────
  it("target subject already PASSED/COMPLETED → ALREADY_COMPLETED (before prereq eval)", () => {
    for (const status of ["PASSED", "COMPLETED"]) {
      const result = decideSubjectEligibility(
        input({
          targetSubjectStatus: status,
          groups: [group({ items: [item({ prerequisiteLevelSubjectId: "A" })] })], // unmet, but irrelevant
        })
      );
      expect(result.status).toBe(S.ALREADY_COMPLETED);
      expect(result.isEligible).toBe(false);
    }
  });

  // ── 12. PENDING_PAYMENT (finance stub) ─────────────────────────────────────
  it("does NOT produce PENDING_PAYMENT — finance is a documented stub", () => {
    // Satisfied prerequisites yield ELIGIBLE; unmet yield PENDING_PREREQUISITE.
    // Financial clearance is not implemented, so PENDING_PAYMENT is never returned.
    const satisfied = decideSubjectEligibility(
      input({
        groups: [group({ items: [item({ prerequisiteLevelSubjectId: "A" })] })],
        studentProgress: [prog("A", "PASSED")],
      })
    );
    expect(satisfied.status).toBe(S.ELIGIBLE);
    expect(satisfied.status).not.toBe(S.PENDING_PAYMENT);
  });

  // ── 13. Cross-tenant: other-org progress is ignored ────────────────────────
  it("prerequisite progress from another organization is ignored (never in scoped input)", () => {
    // The IO layer scopes studentProgress by organizationId, so a pass earned in
    // another tenant simply is not present here → the prerequisite is unmet.
    const result = decideSubjectEligibility(
      input({
        groups: [group({ items: [item({ prerequisiteLevelSubjectId: "A", requirementType: "MUST_PASS" })] })],
        studentProgress: [], // other-org "A PASSED" excluded by scoping
      })
    );
    expect(result.status).toBe(S.PENDING_PREREQUISITE);
  });

  // ── 14. Enrollment validation ──────────────────────────────────────────────
  it("missing/invalid enrollment → BLOCKED", () => {
    const result = decideSubjectEligibility(input({ enrollmentExists: false }));
    expect(result.status).toBe(S.BLOCKED);
    expect(result.isEligible).toBe(false);
  });

  // ── 15. Future-level subject blocked by failed prerequisite ────────────────
  it("a subject remains blocked when its prerequisite was FAILED, even after level progression", () => {
    // Student progressed to the next level but the target subject's MUST_PASS
    // prerequisite was failed → the subject stays blocked.
    const result = decideSubjectEligibility(
      input({
        groups: [group({ items: [item({ prerequisiteLevelSubjectId: "A", requirementType: "MUST_PASS" })] })],
        studentProgress: [prog("A", "FAILED", 30)],
      })
    );
    expect(result.status).toBe(S.PENDING_PREREQUISITE);
    expect(result.isEligible).toBe(false);
  });
});

// ─── IO wrapper: tenant scoping + enrollment validation ───────────────────────

const { enrollmentFindFirst, progressFindFirst, progressFindMany, findGroups, findWaivers } = vi.hoisted(() => ({
  enrollmentFindFirst: vi.fn(),
  progressFindFirst: vi.fn(),
  progressFindMany: vi.fn(),
  findGroups: vi.fn(),
  findWaivers: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  getDb: vi.fn(async () => ({
    enrollment: { findFirst: enrollmentFindFirst },
    studentSubjectProgress: { findFirst: progressFindFirst, findMany: progressFindMany },
  })),
}));

vi.mock("@/modules/prerequisites/repositories/prerequisite-item.repository", () => ({
  findAllActiveGroupsWithItems: findGroups,
}));

vi.mock("@/modules/prerequisites/repositories/prerequisite-waiver.repository", () => ({
  findWaiversByEnrollmentAndSubject: findWaivers,
}));

describe("evaluateSubjectEligibility (tenant scope + enrollment)", () => {
  beforeEach(() => {
    enrollmentFindFirst.mockReset();
    progressFindFirst.mockReset();
    progressFindMany.mockReset();
    findGroups.mockReset();
    findWaivers.mockReset();
  });

  it("scopes every query by organizationId (and progress by studentId)", async () => {
    enrollmentFindFirst.mockResolvedValue({ id: "e1", studentId: "s1", courseId: "c1" });
    progressFindFirst.mockResolvedValue(null);
    findGroups.mockResolvedValue([]);
    findWaivers.mockResolvedValue([]);
    progressFindMany.mockResolvedValue([]);

    const result = await evaluateSubjectEligibility("e1", "ls1", "org-1");

    expect(enrollmentFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: "e1", organizationId: "org-1" }) })
    );
    // Cross-tenant protection: the student's progress is scoped by org + student.
    expect(progressFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: "org-1", studentId: "s1" }) })
    );
    expect(findGroups).toHaveBeenCalledWith("ls1", "org-1");
    expect(findWaivers).toHaveBeenCalledWith("e1", "ls1", "org-1");
    // A cross-org levelSubjectId finds no prerequisites for this tenant → ELIGIBLE.
    expect(result.status).toBe(S.ELIGIBLE);
  });

  it("enrollment not found for this org → BLOCKED, no progress lookup", async () => {
    enrollmentFindFirst.mockResolvedValue(null);

    const result = await evaluateSubjectEligibility("e-other", "ls1", "org-1");

    expect(result.status).toBe(S.BLOCKED);
    expect(progressFindMany).not.toHaveBeenCalled();
    expect(findGroups).not.toHaveBeenCalled();
  });
});
