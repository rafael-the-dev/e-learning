import { getDb } from "@/server/db";
import {
  findAllActiveGroupsWithItems,
  findActiveGroupsWithItemsForLevelSubjects,
} from "@/modules/prerequisites/repositories/prerequisite-item.repository";
import {
  findWaiversByEnrollmentAndSubject,
  findWaivers,
} from "@/modules/prerequisites/repositories/prerequisite-waiver.repository";
import type {
  SubjectEligibilityResult,
  MissingPrerequisite,
  MissingPrerequisiteItem,
} from "@/modules/prerequisites/types";
import { SUBJECT_ELIGIBILITY_STATUS } from "@/modules/prerequisites/types";

// ─── Pure decision helper ─────────────────────────────────────────────────────
// Subject eligibility is a pure function of the target subject's own progress,
// the prerequisite groups/items, any active waivers, and the student's progress
// across the org. It performs NO IO so it can be unit-tested directly. The
// exported async `evaluateSubjectEligibility` below loads the (tenant-scoped)
// data and delegates. Tenant isolation lives in the IO layer: every query is
// scoped by organizationId, so cross-tenant progress never enters `studentProgress`.

export interface EligibilityPrerequisiteItemInput {
  id: string;
  prerequisiteLevelSubjectId: string;
  requirementType: string;
  minimumRequiredGrade: number | string | null;
  subjectName: string;
}

export interface EligibilityGroupInput {
  id: string;
  name: string | null;
  logicType: string;
  items: EligibilityPrerequisiteItemInput[];
}

export interface EligibilityWaiverInput {
  prerequisiteGroupId: string | null;
  prerequisiteItemId: string | null;
}

export interface EligibilityStudentProgressInput {
  levelSubjectId: string;
  status: string;
  finalGrade: number | string | null;
}

export interface SubjectEligibilityDecisionInput {
  levelSubjectId: string;
  /** Whether the enrollment exists (and is scoped to the active org). */
  enrollmentExists: boolean;
  /** The student's progress status on the TARGET subject, if any. */
  targetSubjectStatus: string | null;
  groups: EligibilityGroupInput[];
  waivers: EligibilityWaiverInput[];
  studentProgress: EligibilityStudentProgressInput[];
}

export function decideSubjectEligibility(
  input: SubjectEligibilityDecisionInput
): SubjectEligibilityResult {
  const { levelSubjectId, enrollmentExists, targetSubjectStatus, groups, waivers, studentProgress } = input;

  if (!enrollmentExists) {
    return {
      status: SUBJECT_ELIGIBILITY_STATUS.BLOCKED,
      levelSubjectId,
      missingPrerequisites: [],
      isEligible: false,
    };
  }

  // Student already completed this subject
  if (targetSubjectStatus === "PASSED" || targetSubjectStatus === "COMPLETED") {
    return {
      status: SUBJECT_ELIGIBILITY_STATUS.ALREADY_COMPLETED,
      levelSubjectId,
      missingPrerequisites: [],
      isEligible: false,
    };
  }

  // No prerequisites → eligible
  if (groups.length === 0) {
    return {
      status: SUBJECT_ELIGIBILITY_STATUS.ELIGIBLE,
      levelSubjectId,
      missingPrerequisites: [],
      isEligible: true,
    };
  }

  // Full waiver (null group + null item) bypasses everything
  const hasFullWaiver = waivers.some((w) => w.prerequisiteGroupId === null && w.prerequisiteItemId === null);
  if (hasFullWaiver) {
    return {
      status: SUBJECT_ELIGIBILITY_STATUS.ELIGIBLE,
      levelSubjectId,
      missingPrerequisites: [],
      isEligible: true,
    };
  }

  const progressMap = new Map(studentProgress.map((p) => [p.levelSubjectId, p]));

  // Evaluate each group (groups are AND-ed)
  const missingPrerequisites: MissingPrerequisite[] = [];

  for (const group of groups) {
    const groupWaiver = waivers.find((w) => w.prerequisiteGroupId === group.id && w.prerequisiteItemId === null);
    if (groupWaiver) continue; // entire group waived

    const missingItems: MissingPrerequisiteItem[] = [];

    for (const item of group.items) {
      const itemWaiver = waivers.find((w) => w.prerequisiteItemId === item.id);
      if (itemWaiver) continue;

      const progress = progressMap.get(item.prerequisiteLevelSubjectId);
      let satisfied = false;

      if (item.requirementType === "MUST_PASS") {
        satisfied = progress?.status === "PASSED";
      } else if (item.requirementType === "MUST_COMPLETE") {
        satisfied = progress?.status === "PASSED" || progress?.status === "COMPLETED" || progress?.status === "FAILED";
      } else if (item.requirementType === "MINIMUM_GRADE") {
        const grade = progress?.finalGrade != null ? parseFloat(String(progress.finalGrade)) : null;
        const minGrade = item.minimumRequiredGrade != null ? parseFloat(String(item.minimumRequiredGrade)) : 50;
        satisfied = grade !== null && grade >= minGrade;
      }

      if (!satisfied) {
        missingItems.push({
          itemId: item.id,
          levelSubjectId: item.prerequisiteLevelSubjectId,
          subjectName: item.subjectName,
          requirementType: item.requirementType,
          minimumRequiredGrade: item.minimumRequiredGrade != null ? parseFloat(String(item.minimumRequiredGrade)) : null,
          currentStatus: progress?.status ?? null,
          currentGrade: progress?.finalGrade != null ? parseFloat(String(progress.finalGrade)) : null,
        });
      }
    }

    // Evaluate group logic
    const groupSatisfied =
      group.logicType === "ALL"
        ? missingItems.length === 0
        : missingItems.length < group.items.length; // ANY: at least one satisfied

    if (!groupSatisfied) {
      missingPrerequisites.push({
        groupId: group.id,
        groupName: group.name,
        logicType: group.logicType,
        items: missingItems,
      });
    }
  }

  if (missingPrerequisites.length === 0) {
    return {
      status: SUBJECT_ELIGIBILITY_STATUS.ELIGIBLE,
      levelSubjectId,
      missingPrerequisites: [],
      isEligible: true,
    };
  }

  // NOTE (financial clearance): PENDING_PAYMENT is a defined status but is NOT
  // produced here — FinancialEligibilityService is not implemented. Prerequisite
  // failures surface as PENDING_PREREQUISITE. This is a known stub, not a silent
  // omission; wire the finance check in the IO wrapper when it lands.
  return {
    status: SUBJECT_ELIGIBILITY_STATUS.PENDING_PREREQUISITE,
    levelSubjectId,
    missingPrerequisites,
    isEligible: false,
  };
}

// ─── IO wrapper ───────────────────────────────────────────────────────────────

export async function evaluateSubjectEligibility(
  enrollmentId: string,
  levelSubjectId: string,
  organizationId: string
): Promise<SubjectEligibilityResult> {
  const db = await getDb();

  // Validate enrollment belongs to org
  const enrollment = await db.enrollment.findFirst({
    where: { id: enrollmentId, organizationId, deletedAt: null },
    select: { id: true, studentId: true, courseId: true },
  });

  if (!enrollment) {
    return decideSubjectEligibility({
      levelSubjectId,
      enrollmentExists: false,
      targetSubjectStatus: null,
      groups: [],
      waivers: [],
      studentProgress: [],
    });
  }

  // Student's progress on the target subject (for ALREADY_COMPLETED)
  const existing = await db.studentSubjectProgress.findFirst({
    where: { enrollmentId, levelSubjectId, organizationId },
    select: { status: true },
  });

  // Prerequisite groups + items (tenant-scoped by the repository)
  const groups = await findAllActiveGroupsWithItems(levelSubjectId, organizationId);

  // Active waivers for this enrollment + subject (tenant-scoped)
  const waivers = await findWaiversByEnrollmentAndSubject(enrollmentId, levelSubjectId, organizationId);

  // Student's subject progress across all enrollments in this org
  const studentProgress = await db.studentSubjectProgress.findMany({
    where: { organizationId, studentId: enrollment.studentId },
    select: { levelSubjectId: true, status: true, finalGrade: true },
  });

  return decideSubjectEligibility({
    levelSubjectId,
    enrollmentExists: true,
    targetSubjectStatus: existing?.status ?? null,
    groups: groups.map((g) => ({
      id: g.id,
      name: g.name,
      logicType: g.logicType,
      items: g.items.map((item) => ({
        id: item.id,
        prerequisiteLevelSubjectId: item.prerequisiteLevelSubjectId,
        requirementType: item.requirementType,
        minimumRequiredGrade: item.minimumRequiredGrade != null ? parseFloat(String(item.minimumRequiredGrade)) : null,
        subjectName: item.prerequisiteLevelSubject.subject.name,
      })),
    })),
    waivers: waivers.map((w) => ({
      prerequisiteGroupId: w.prerequisiteGroupId,
      prerequisiteItemId: w.prerequisiteItemId,
    })),
    studentProgress: studentProgress.map((p) => ({
      levelSubjectId: p.levelSubjectId,
      status: p.status,
      finalGrade: p.finalGrade != null ? parseFloat(String(p.finalGrade)) : null,
    })),
  });
}

// ─── Batch loader + pure all-subjects engine (H4) ─────────────────────────────
// Evaluating a whole level used to run one full query set PER subject (the N+1:
// `evaluateSubjectEligibility` in a loop re-loaded the enrollment + the student's
// entire progress for every subject). The batch loader below fetches everything the
// decision needs in a CONSTANT number of queries (independent of subject count), and
// `evaluateEligibilityForAllSubjects(context)` is a PURE function over that context —
// no IO, no `await`, just the same `decideSubjectEligibility` rules applied per subject.
// Outputs are identical to the per-subject path; this is a data-access optimization,
// not a change to the academic rules.

/** In-memory bundle of everything needed to evaluate every subject of a level. */
export interface EligibilityEvaluationContext {
  organizationId: string;
  enrollmentId: string;
  /** The student the (validated) enrollment belongs to; null when the enrollment is absent. */
  studentId: string | null;
  /** Whether the enrollment exists for this org and is not soft-deleted (the tenant gate). */
  enrollmentExists: boolean;
  /** ACTIVE level-subjects of the resolved level — the subjects to evaluate. */
  targetLevelSubjectIds: string[];
  /** Prerequisite groups (with items) for every target subject, keyed by target levelSubjectId. */
  groupsByLevelSubjectId: Map<string, EligibilityGroupInput[]>;
  /** Active waivers for this enrollment, keyed by target levelSubjectId. */
  waiversByLevelSubjectId: Map<string, EligibilityWaiverInput[]>;
  /** Target-subject progress status scoped to THIS enrollment (drives ALREADY_COMPLETED). */
  targetStatusByLevelSubjectId: Map<string, string>;
  /**
   * The student's subject progress across the whole org. Because it is scoped by
   * studentId (not by the current level) it already carries the progress of every
   * prerequisite subject an item can reference — including transitive prerequisites
   * that live OUTSIDE the current level. Tenant-scoped, so cross-org progress never
   * enters the decision.
   */
  studentProgress: EligibilityStudentProgressInput[];
}

function emptyEligibilityContext(
  organizationId: string,
  enrollmentId: string
): EligibilityEvaluationContext {
  return {
    organizationId,
    enrollmentId,
    studentId: null,
    enrollmentExists: false,
    targetLevelSubjectIds: [],
    groupsByLevelSubjectId: new Map(),
    waiversByLevelSubjectId: new Map(),
    targetStatusByLevelSubjectId: new Map(),
    studentProgress: [],
  };
}

/**
 * Batch-load the full eligibility evaluation context for a level in a CONSTANT number
 * of queries (enrollment gate + level subjects + student progress + target progress +
 * prerequisite groups + waivers), regardless of how many subjects the level has.
 * Tenant isolation lives here: the enrollment is validated against the org (and
 * soft-delete), and every read is scoped by organizationId.
 */
export async function loadEligibilityEvaluationContext(params: {
  organizationId: string;
  studentId: string;
  enrollmentId: string;
  courseLevelId: string;
}): Promise<EligibilityEvaluationContext> {
  const { organizationId, enrollmentId, courseLevelId } = params;
  const db = await getDb();

  // Tenant gate: the enrollment must belong to this org and not be soft-deleted.
  const enrollment = await db.enrollment.findFirst({
    where: { id: enrollmentId, organizationId, deletedAt: null },
    select: { studentId: true },
  });
  if (!enrollment) return emptyEligibilityContext(organizationId, enrollmentId);

  // Authoritative student for scoping (the enrollment's own student, not a caller hint).
  const studentId = enrollment.studentId;

  const [levelSubjects, allProgress, enrollmentProgress] = await Promise.all([
    // ACTIVE target subjects of the resolved level.
    db.levelSubject.findMany({
      where: { courseLevelId, organizationId, deletedAt: null, status: "ACTIVE" },
      select: { id: true },
    }),
    // All of the student's progress across the org — covers prerequisites, incl. transitive.
    db.studentSubjectProgress.findMany({
      where: { organizationId, studentId },
      select: { levelSubjectId: true, status: true, finalGrade: true },
    }),
    // Target-subject status scoped to THIS enrollment (matches the old ALREADY_COMPLETED read).
    db.studentSubjectProgress.findMany({
      where: { organizationId, enrollmentId },
      select: { levelSubjectId: true, status: true },
    }),
  ]);

  const targetLevelSubjectIds = levelSubjects.map((ls) => ls.id);

  const [groups, waivers] = await Promise.all([
    findActiveGroupsWithItemsForLevelSubjects(targetLevelSubjectIds, organizationId),
    findWaivers(organizationId, { enrollmentId, status: "ACTIVE" }),
  ]);

  const groupsByLevelSubjectId = new Map<string, EligibilityGroupInput[]>();
  for (const g of groups) {
    const mapped: EligibilityGroupInput = {
      id: g.id,
      name: g.name,
      logicType: g.logicType,
      items: g.items.map((item) => ({
        id: item.id,
        prerequisiteLevelSubjectId: item.prerequisiteLevelSubjectId,
        requirementType: item.requirementType,
        minimumRequiredGrade:
          item.minimumRequiredGrade != null ? parseFloat(String(item.minimumRequiredGrade)) : null,
        subjectName: item.prerequisiteLevelSubject.subject.name,
      })),
    };
    const existing = groupsByLevelSubjectId.get(g.levelSubjectId);
    if (existing) existing.push(mapped);
    else groupsByLevelSubjectId.set(g.levelSubjectId, [mapped]);
  }

  const waiversByLevelSubjectId = new Map<string, EligibilityWaiverInput[]>();
  for (const w of waivers) {
    const mapped: EligibilityWaiverInput = {
      prerequisiteGroupId: w.prerequisiteGroupId,
      prerequisiteItemId: w.prerequisiteItemId,
    };
    const existing = waiversByLevelSubjectId.get(w.levelSubjectId);
    if (existing) existing.push(mapped);
    else waiversByLevelSubjectId.set(w.levelSubjectId, [mapped]);
  }

  const targetStatusByLevelSubjectId = new Map<string, string>();
  for (const p of enrollmentProgress) {
    if (!targetStatusByLevelSubjectId.has(p.levelSubjectId)) {
      targetStatusByLevelSubjectId.set(p.levelSubjectId, p.status);
    }
  }

  const studentProgress: EligibilityStudentProgressInput[] = allProgress.map((p) => ({
    levelSubjectId: p.levelSubjectId,
    status: p.status,
    finalGrade: p.finalGrade != null ? parseFloat(String(p.finalGrade)) : null,
  }));

  return {
    organizationId,
    enrollmentId,
    studentId,
    enrollmentExists: true,
    targetLevelSubjectIds,
    groupsByLevelSubjectId,
    waiversByLevelSubjectId,
    targetStatusByLevelSubjectId,
    studentProgress,
  };
}

/**
 * Pure evaluation of every subject of a level from a pre-loaded context. Performs NO IO
 * and no `await` — it applies the same `decideSubjectEligibility` rules per subject using
 * in-memory Maps, so the query count is whatever `loadEligibilityEvaluationContext` spent
 * (constant), never proportional to the number of subjects.
 */
export function evaluateEligibilityForAllSubjects(
  context: EligibilityEvaluationContext
): Map<string, SubjectEligibilityResult> {
  const results = new Map<string, SubjectEligibilityResult>();
  if (!context.enrollmentExists) return results;

  for (const levelSubjectId of context.targetLevelSubjectIds) {
    results.set(
      levelSubjectId,
      decideSubjectEligibility({
        levelSubjectId,
        enrollmentExists: true,
        targetSubjectStatus: context.targetStatusByLevelSubjectId.get(levelSubjectId) ?? null,
        groups: context.groupsByLevelSubjectId.get(levelSubjectId) ?? [],
        waivers: context.waiversByLevelSubjectId.get(levelSubjectId) ?? [],
        studentProgress: context.studentProgress,
      })
    );
  }

  return results;
}
