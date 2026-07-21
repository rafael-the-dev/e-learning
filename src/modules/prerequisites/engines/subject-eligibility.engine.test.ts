import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  decideSubjectEligibility,
  evaluateSubjectEligibility,
  evaluateEligibilityForAllSubjects,
  loadEligibilityEvaluationContext,
  type SubjectEligibilityDecisionInput,
  type EligibilityGroupInput,
  type EligibilityPrerequisiteItemInput,
  type EligibilityStudentProgressInput,
  type EligibilityEvaluationContext,
} from "@/modules/prerequisites/engines/subject-eligibility.engine";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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

const {
  enrollmentFindFirst,
  progressFindFirst,
  progressFindMany,
  levelSubjectFindMany,
  findGroups,
  findGroupsBatch,
  findWaivers,
  findWaiversBatch,
} = vi.hoisted(() => ({
  enrollmentFindFirst: vi.fn(),
  progressFindFirst: vi.fn(),
  progressFindMany: vi.fn(),
  levelSubjectFindMany: vi.fn(),
  findGroups: vi.fn(),
  findGroupsBatch: vi.fn(),
  findWaivers: vi.fn(),
  findWaiversBatch: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  getDb: vi.fn(async () => ({
    enrollment: { findFirst: enrollmentFindFirst },
    studentSubjectProgress: { findFirst: progressFindFirst, findMany: progressFindMany },
    levelSubject: { findMany: levelSubjectFindMany },
  })),
}));

vi.mock("@/modules/prerequisites/repositories/prerequisite-item.repository", () => ({
  findAllActiveGroupsWithItems: findGroups,
  findActiveGroupsWithItemsForLevelSubjects: findGroupsBatch,
}));

vi.mock("@/modules/prerequisites/repositories/prerequisite-waiver.repository", () => ({
  findWaiversByEnrollmentAndSubject: findWaivers,
  findWaivers: findWaiversBatch,
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

// =============================================================================
// H4 — batch loader + PURE all-subjects engine. The whole-level evaluation must
// (1) produce IDENTICAL outputs to the per-subject path, (2) cost a CONSTANT
// number of queries regardless of subject count, (3) keep the evaluation pure
// (no IO), and (4) stay tenant/enrollment scoped.
// =============================================================================

// ── Pure-engine helpers (no IO) ───────────────────────────────────────────────

function ctx(overrides: Partial<EligibilityEvaluationContext> = {}): EligibilityEvaluationContext {
  return {
    organizationId: "org-1",
    enrollmentId: "enr-1",
    studentId: "s1",
    enrollmentExists: true,
    targetLevelSubjectIds: [],
    groupsByLevelSubjectId: new Map(),
    waiversByLevelSubjectId: new Map(),
    targetStatusByLevelSubjectId: new Map(),
    studentProgress: [],
    ...overrides,
  };
}

describe("evaluateEligibilityForAllSubjects (pure) — functional parity", () => {
  it("returns an empty map when the enrollment does not exist", () => {
    const map = evaluateEligibilityForAllSubjects(
      ctx({ enrollmentExists: false, targetLevelSubjectIds: ["a", "b"] })
    );
    expect(map.size).toBe(0);
  });

  it("no prerequisites → ELIGIBLE", () => {
    const map = evaluateEligibilityForAllSubjects(ctx({ targetLevelSubjectIds: ["t1"] }));
    expect(map.get("t1")?.status).toBe(S.ELIGIBLE);
  });

  it("ALL group satisfied → ELIGIBLE; partially satisfied → PENDING_PREREQUISITE", () => {
    const groups = new Map<string, EligibilityGroupInput[]>([
      [
        "t1",
        [
          group({
            logicType: "ALL",
            items: [
              item({ prerequisiteLevelSubjectId: "A", requirementType: "MUST_PASS" }),
              item({ prerequisiteLevelSubjectId: "B", requirementType: "MUST_PASS" }),
            ],
          }),
        ],
      ],
      [
        "t2",
        [
          group({
            logicType: "ALL",
            items: [
              item({ prerequisiteLevelSubjectId: "A", requirementType: "MUST_PASS" }),
              item({ prerequisiteLevelSubjectId: "B", requirementType: "MUST_PASS" }),
            ],
          }),
        ],
      ],
    ]);
    const map = evaluateEligibilityForAllSubjects(
      ctx({
        targetLevelSubjectIds: ["t1", "t2"],
        groupsByLevelSubjectId: groups,
        studentProgress: [prog("A", "PASSED"), prog("B", "PASSED")], // t2's B still passed → both eligible
      })
    );
    expect(map.get("t1")?.status).toBe(S.ELIGIBLE);
    expect(map.get("t2")?.status).toBe(S.ELIGIBLE);

    const partial = evaluateEligibilityForAllSubjects(
      ctx({
        targetLevelSubjectIds: ["t1"],
        groupsByLevelSubjectId: groups,
        studentProgress: [prog("A", "PASSED")], // B missing
      })
    );
    expect(partial.get("t1")?.status).toBe(S.PENDING_PREREQUISITE);
  });

  it("ANY group satisfied by one item → ELIGIBLE; none satisfied → PENDING_PREREQUISITE", () => {
    const groups = new Map<string, EligibilityGroupInput[]>([
      [
        "t1",
        [
          group({
            logicType: "ANY",
            items: [
              item({ prerequisiteLevelSubjectId: "A", requirementType: "MUST_PASS" }),
              item({ prerequisiteLevelSubjectId: "B", requirementType: "MUST_PASS" }),
            ],
          }),
        ],
      ],
    ]);
    expect(
      evaluateEligibilityForAllSubjects(
        ctx({ targetLevelSubjectIds: ["t1"], groupsByLevelSubjectId: groups, studentProgress: [prog("A", "PASSED")] })
      ).get("t1")?.status
    ).toBe(S.ELIGIBLE);
    expect(
      evaluateEligibilityForAllSubjects(
        ctx({
          targetLevelSubjectIds: ["t1"],
          groupsByLevelSubjectId: groups,
          studentProgress: [prog("A", "IN_PROGRESS"), prog("B", "FAILED")],
        })
      ).get("t1")?.status
    ).toBe(S.PENDING_PREREQUISITE);
  });

  it("MUST_PASS vs MUST_COMPLETE vs no-progress semantics are preserved per subject", () => {
    const groups = new Map<string, EligibilityGroupInput[]>([
      ["mustPass", [group({ items: [item({ prerequisiteLevelSubjectId: "A", requirementType: "MUST_PASS" })] })]],
      ["mustComplete", [group({ items: [item({ prerequisiteLevelSubjectId: "A", requirementType: "MUST_COMPLETE" })] })]],
      ["noProgress", [group({ items: [item({ prerequisiteLevelSubjectId: "Z", requirementType: "MUST_PASS" })] })]],
    ]);
    const map = evaluateEligibilityForAllSubjects(
      ctx({
        targetLevelSubjectIds: ["mustPass", "mustComplete", "noProgress"],
        groupsByLevelSubjectId: groups,
        studentProgress: [prog("A", "COMPLETED")], // COMPLETED: fails MUST_PASS, satisfies MUST_COMPLETE
      })
    );
    expect(map.get("mustPass")?.status).toBe(S.PENDING_PREREQUISITE);
    expect(map.get("mustComplete")?.status).toBe(S.ELIGIBLE);
    expect(map.get("noProgress")?.status).toBe(S.PENDING_PREREQUISITE); // Z never attempted
  });

  it("target already PASSED/COMPLETED → ALREADY_COMPLETED (before prereq eval)", () => {
    const map = evaluateEligibilityForAllSubjects(
      ctx({
        targetLevelSubjectIds: ["t1"],
        targetStatusByLevelSubjectId: new Map([["t1", "PASSED"]]),
        groupsByLevelSubjectId: new Map([
          ["t1", [group({ items: [item({ prerequisiteLevelSubjectId: "A" })] })]], // unmet, but irrelevant
        ]),
      })
    );
    expect(map.get("t1")?.status).toBe(S.ALREADY_COMPLETED);
  });

  it("a prerequisite OUTSIDE the current level (transitive) is satisfied from org-wide progress", () => {
    // "OUT" is not a target subject of this level, but the student passed it in a prior
    // level; because studentProgress is scoped by student (not level), the transitive
    // dependency is present and the target becomes eligible.
    const map = evaluateEligibilityForAllSubjects(
      ctx({
        targetLevelSubjectIds: ["t1"],
        groupsByLevelSubjectId: new Map([
          ["t1", [group({ items: [item({ prerequisiteLevelSubjectId: "OUT", requirementType: "MUST_PASS" })] })]],
        ]),
        studentProgress: [prog("OUT", "PASSED")], // earned in another (completed) level
      })
    );
    expect(map.get("t1")?.status).toBe(S.ELIGIBLE);
  });

  it("evaluates every target and returns exactly one result per subject", () => {
    const targets = Array.from({ length: 12 }, (_, i) => `t${i}`);
    const map = evaluateEligibilityForAllSubjects(ctx({ targetLevelSubjectIds: targets }));
    expect(map.size).toBe(12);
    for (const t of targets) expect(map.get(t)?.levelSubjectId).toBe(t);
  });
});

describe("evaluateEligibilityForAllSubjects (pure) — architecture", () => {
  const SOURCE = readFileSync(
    join(process.cwd(), "src/modules/prerequisites/engines/subject-eligibility.engine.ts"),
    "utf8"
  );

  it("the all-subjects engine is a SYNCHRONOUS pure function (not async)", () => {
    expect(SOURCE).toContain("export function evaluateEligibilityForAllSubjects(");
    expect(SOURCE).not.toContain("export async function evaluateEligibilityForAllSubjects(");
  });

  it("the evaluation body performs no IO (no await / getDb / db. inside the function)", () => {
    const start = SOURCE.indexOf("export function evaluateEligibilityForAllSubjects(");
    const body = SOURCE.slice(start);
    expect(body).not.toContain("await");
    expect(body).not.toContain("getDb");
    expect(body).not.toMatch(/\bdb\./);
  });
});

// ── Batch loader (IO): scoping + constant query count ─────────────────────────

function resetLoaderMocks() {
  enrollmentFindFirst.mockReset();
  progressFindFirst.mockReset();
  progressFindMany.mockReset();
  levelSubjectFindMany.mockReset();
  findGroups.mockReset();
  findGroupsBatch.mockReset();
  findWaivers.mockReset();
  findWaiversBatch.mockReset();
}

describe("loadEligibilityEvaluationContext (batch loader) — scoping", () => {
  beforeEach(resetLoaderMocks);

  it("gates on the enrollment (org + soft-delete); absent → empty context, no further queries", async () => {
    enrollmentFindFirst.mockResolvedValue(null);

    const context = await loadEligibilityEvaluationContext({
      organizationId: "org-1",
      studentId: "s1",
      enrollmentId: "e-missing",
      courseLevelId: "lvl-1",
    });

    expect(enrollmentFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "e-missing", organizationId: "org-1", deletedAt: null }),
      })
    );
    expect(context.enrollmentExists).toBe(false);
    expect(context.targetLevelSubjectIds).toEqual([]);
    // No level-subjects / progress / prerequisites loaded once the gate fails.
    expect(levelSubjectFindMany).not.toHaveBeenCalled();
    expect(progressFindMany).not.toHaveBeenCalled();
    expect(findGroupsBatch).not.toHaveBeenCalled();
    expect(findWaiversBatch).not.toHaveBeenCalled();
    // And the pure engine yields no rows for it.
    expect(evaluateEligibilityForAllSubjects(context).size).toBe(0);
  });

  it("scopes progress by the enrollment's OWN studentId and every read by organizationId", async () => {
    enrollmentFindFirst.mockResolvedValue({ studentId: "real-student" });
    levelSubjectFindMany.mockResolvedValue([{ id: "ls1" }, { id: "ls2" }]);
    progressFindMany.mockResolvedValue([]);
    findGroupsBatch.mockResolvedValue([]);
    findWaiversBatch.mockResolvedValue([]);

    const context = await loadEligibilityEvaluationContext({
      organizationId: "org-1",
      studentId: "IGNORED-HINT", // must not be trusted over the enrollment's student
      enrollmentId: "e1",
      courseLevelId: "lvl-1",
    });

    // Progress is scoped by the authoritative student, not the caller hint.
    expect(progressFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: "org-1", studentId: "real-student" }) })
    );
    expect(progressFindMany).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ studentId: "IGNORED-HINT" }) })
    );
    // Target subjects: ACTIVE, non-deleted, scoped by org + the resolved level.
    expect(levelSubjectFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ courseLevelId: "lvl-1", organizationId: "org-1", status: "ACTIVE", deletedAt: null }),
      })
    );
    // Prerequisites batched over the target ids; waivers scoped to the enrollment.
    expect(findGroupsBatch).toHaveBeenCalledWith(["ls1", "ls2"], "org-1");
    expect(findWaiversBatch).toHaveBeenCalledWith(
      "org-1",
      expect.objectContaining({ enrollmentId: "e1", status: "ACTIVE" })
    );
    expect(context.studentId).toBe("real-student");
    expect(context.targetLevelSubjectIds).toEqual(["ls1", "ls2"]);
  });

  it("indexes groups, waivers and target status by levelSubjectId", async () => {
    enrollmentFindFirst.mockResolvedValue({ studentId: "s1" });
    levelSubjectFindMany.mockResolvedValue([{ id: "ls1" }, { id: "ls2" }]);
    // studentProgress (by student) then target status (by enrollment) — mocked per call.
    progressFindMany
      .mockResolvedValueOnce([{ levelSubjectId: "A", status: "PASSED", finalGrade: 80 }])
      .mockResolvedValueOnce([{ levelSubjectId: "ls1", status: "COMPLETED" }]);
    findGroupsBatch.mockResolvedValue([
      {
        id: "g1",
        levelSubjectId: "ls1",
        name: "G1",
        logicType: "ALL",
        items: [
          {
            id: "i1",
            prerequisiteLevelSubjectId: "A",
            requirementType: "MUST_PASS",
            minimumRequiredGrade: null,
            prerequisiteLevelSubject: { subject: { name: "Álgebra" } },
          },
        ],
      },
    ]);
    findWaiversBatch.mockResolvedValue([
      { levelSubjectId: "ls2", prerequisiteGroupId: null, prerequisiteItemId: null },
    ]);

    const context = await loadEligibilityEvaluationContext({
      organizationId: "org-1",
      studentId: "s1",
      enrollmentId: "e1",
      courseLevelId: "lvl-1",
    });

    expect(context.groupsByLevelSubjectId.get("ls1")?.[0].items[0].subjectName).toBe("Álgebra");
    expect(context.waiversByLevelSubjectId.get("ls2")).toEqual([{ prerequisiteGroupId: null, prerequisiteItemId: null }]);
    expect(context.targetStatusByLevelSubjectId.get("ls1")).toBe("COMPLETED");
    expect(context.studentProgress).toEqual([{ levelSubjectId: "A", status: "PASSED", finalGrade: 80 }]);
  });
});

describe("loadEligibilityEvaluationContext — CONSTANT query count", () => {
  beforeEach(resetLoaderMocks);

  const loaderQueryCount = () =>
    enrollmentFindFirst.mock.calls.length +
    levelSubjectFindMany.mock.calls.length +
    progressFindMany.mock.calls.length +
    findGroupsBatch.mock.calls.length +
    findWaiversBatch.mock.calls.length;

  async function runForNSubjects(n: number): Promise<number> {
    resetLoaderMocks();
    enrollmentFindFirst.mockResolvedValue({ studentId: "s1" });
    levelSubjectFindMany.mockResolvedValue(Array.from({ length: n }, (_, i) => ({ id: `ls${i}` })));
    progressFindMany.mockResolvedValue([]);
    findGroupsBatch.mockResolvedValue([]);
    findWaiversBatch.mockResolvedValue([]);

    const context = await loadEligibilityEvaluationContext({
      organizationId: "org-1",
      studentId: "s1",
      enrollmentId: "e1",
      courseLevelId: "lvl-1",
    });
    const queriesAfterLoad = loaderQueryCount();

    // The pure evaluation must add ZERO queries no matter how many subjects.
    const map = evaluateEligibilityForAllSubjects(context);
    expect(map.size).toBe(n);
    expect(loaderQueryCount()).toBe(queriesAfterLoad);

    return queriesAfterLoad;
  }

  it("issues the same number of queries for 5, 20 and 50 subjects (no N+1)", async () => {
    const q5 = await runForNSubjects(5);
    const q20 = await runForNSubjects(20);
    const q50 = await runForNSubjects(50);

    expect(q5).toBe(q20);
    expect(q20).toBe(q50);
    // enrollment(1) + levelSubjects(1) + progress×2 + groups(1) + waivers(1) = 6, constant.
    expect(q5).toBe(6);
    // The old per-subject loop (evaluateSubjectEligibility) is never used by the batch path.
    expect(progressFindFirst).not.toHaveBeenCalled();
    expect(findGroups).not.toHaveBeenCalled();
    expect(findWaivers).not.toHaveBeenCalled();
  });
});
