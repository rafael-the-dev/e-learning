import { getDb } from "@/server/db";
import { findAllActiveGroupsWithItems } from "@/modules/prerequisites/repositories/prerequisite-item.repository";
import { findWaiversByEnrollmentAndSubject } from "@/modules/prerequisites/repositories/prerequisite-waiver.repository";
import type {
  SubjectEligibilityResult,
  MissingPrerequisite,
  MissingPrerequisiteItem,
} from "@/modules/prerequisites/types";
import { SUBJECT_ELIGIBILITY_STATUS } from "@/modules/prerequisites/types";

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
    return {
      status: SUBJECT_ELIGIBILITY_STATUS.BLOCKED,
      levelSubjectId,
      missingPrerequisites: [],
      isEligible: false,
    };
  }

  // Check if student already completed this subject
  const existing = await db.studentSubjectProgress.findFirst({
    where: { enrollmentId, levelSubjectId, organizationId },
    select: { status: true },
  });

  if (existing?.status === "PASSED" || existing?.status === "COMPLETED") {
    return {
      status: SUBJECT_ELIGIBILITY_STATUS.ALREADY_COMPLETED,
      levelSubjectId,
      missingPrerequisites: [],
      isEligible: false,
    };
  }

  // Load prerequisite groups
  const groups = await findAllActiveGroupsWithItems(levelSubjectId, organizationId);

  if (groups.length === 0) {
    return {
      status: SUBJECT_ELIGIBILITY_STATUS.ELIGIBLE,
      levelSubjectId,
      missingPrerequisites: [],
      isEligible: true,
    };
  }

  // Load active waivers for this enrollment + subject
  const waivers = await findWaiversByEnrollmentAndSubject(enrollmentId, levelSubjectId, organizationId);
  const hasFullWaiver = waivers.some((w) => w.prerequisiteGroupId === null && w.prerequisiteItemId === null);

  if (hasFullWaiver) {
    return {
      status: SUBJECT_ELIGIBILITY_STATUS.ELIGIBLE,
      levelSubjectId,
      missingPrerequisites: [],
      isEligible: true,
    };
  }

  // Load student's subject progress across all enrollments in this org
  const studentProgress = await db.studentSubjectProgress.findMany({
    where: { organizationId, studentId: enrollment.studentId },
    select: { levelSubjectId: true, status: true, finalGrade: true },
  });
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
          subjectName: item.prerequisiteLevelSubject.subject.name,
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

  return {
    status: SUBJECT_ELIGIBILITY_STATUS.PENDING_PREREQUISITE,
    levelSubjectId,
    missingPrerequisites,
    isEligible: false,
  };
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
