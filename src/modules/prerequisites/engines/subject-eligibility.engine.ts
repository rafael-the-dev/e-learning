import { getDb } from "@/server/db";
import { findAllActiveGroupsWithItems } from "@/modules/prerequisites/repositories/prerequisite-item.repository";
import { findWaiversByEnrollmentAndSubject } from "@/modules/prerequisites/repositories/prerequisite-waiver.repository";
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

export async function evaluateEligibilityForAllSubjects(
  enrollmentId: string,
  organizationId: string
): Promise<Map<string, SubjectEligibilityResult>> {
  const db = await getDb();

  const enrollment = await db.enrollment.findFirst({
    where: { id: enrollmentId, organizationId, deletedAt: null },
    select: { courseId: true, currentLevelId: true, courseLevelId: true },
  });

  if (!enrollment) return new Map();

  const levelId = enrollment.currentLevelId ?? enrollment.courseLevelId;
  if (!levelId) return new Map();

  const levelSubjects = await db.levelSubject.findMany({
    where: { courseLevelId: levelId, organizationId, deletedAt: null, status: "ACTIVE" },
    select: { id: true },
  });

  const results = await Promise.all(
    levelSubjects.map(async (ls) => {
      const result = await evaluateSubjectEligibility(enrollmentId, ls.id, organizationId);
      return [ls.id, result] as [string, SubjectEligibilityResult];
    })
  );

  return new Map(results);
}
