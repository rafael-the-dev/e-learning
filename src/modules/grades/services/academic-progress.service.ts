import { findProgressByEnrollment } from "@/modules/assessments/repositories/student-subject-progress.repository";
import { findActivePolicyForLevelSubject } from "@/modules/assessments/repositories/assessment-policy.repository";
import { findActiveComponentsByPolicy } from "@/modules/assessments/repositories/assessment-component.repository";
import { findStudentAssessmentResults } from "@/modules/grades/repositories/student-assessment-result.repository";
import type { StudentSubjectProgress } from "@/modules/assessments/types";
import type { StudentAssessmentResult } from "@/modules/grades/types";
import { getDb } from "@/server/db";

export interface ComponentProgressItem {
  componentId: string;
  componentName: string;
  componentType: string;
  weight: number;
  maxGrade: number;
  isRequired: boolean;
  grade: number | null;
  maxGradeResult: number | null;
  normalizedGrade: number | null;
  sourceType: string | null;
  gradedAt: Date | null;
  gradedBy: string | null;
  assessmentEventId: string | null;
  status: string | null;
}

export interface SubjectProgressSummary {
  levelSubjectId: string;
  subjectName: string;
  courseLevelName: string | null;
  finalGrade: number | null;
  minimumPassingGrade: number | null;
  status: string;
  progressReason: string | null;
  completedAt: Date | null;
  updatedAt: Date;
  components: ComponentProgressItem[];
  gradedCount: number;
  requiredCount: number;
  missingRequiredCount: number;
}

export interface TranscriptEnrollment {
  enrollmentId: string;
  courseName: string;
  courseLevelName: string | null;
  enrollmentStatus: string;
  enrollmentDate: Date;
  startDate: Date | null;
  completedAt: Date | null;
  subjects: StudentSubjectProgress[];
}

export async function getEnrollmentAcademicProgress(
  enrollmentId: string,
  organizationId: string
): Promise<SubjectProgressSummary[]> {
  const [progressRecords, resultsPage] = await Promise.all([
    findProgressByEnrollment(enrollmentId, organizationId),
    findStudentAssessmentResults(organizationId, { enrollmentId, pageSize: 500 }),
  ]);

  const allResults: StudentAssessmentResult[] = resultsPage.data.filter(
    (r) => r.status !== "CANCELLED"
  );

  // Group results by levelSubjectId
  const resultsBySubject = new Map<string, StudentAssessmentResult[]>();
  for (const r of allResults) {
    if (!resultsBySubject.has(r.levelSubjectId)) {
      resultsBySubject.set(r.levelSubjectId, []);
    }
    resultsBySubject.get(r.levelSubjectId)!.push(r);
  }

  // Union of levelSubjectIds from progress + results
  const levelSubjectIds = new Set<string>([
    ...progressRecords.map((p) => p.levelSubjectId),
    ...resultsBySubject.keys(),
  ]);

  // Load policy + components for each levelSubject (parallel)
  const componentsBySubject = new Map<string, Awaited<ReturnType<typeof findActiveComponentsByPolicy>>>();
  await Promise.all(
    Array.from(levelSubjectIds).map(async (lsId) => {
      const policy = await findActivePolicyForLevelSubject(lsId, organizationId);
      if (policy) {
        const comps = await findActiveComponentsByPolicy(policy.id, organizationId);
        componentsBySubject.set(lsId, comps);
      }
    })
  );

  const progressBySubject = new Map(progressRecords.map((p) => [p.levelSubjectId, p]));

  return Array.from(levelSubjectIds).map((lsId): SubjectProgressSummary => {
    const progress = progressBySubject.get(lsId) ?? null;
    const results = resultsBySubject.get(lsId) ?? [];
    const components = componentsBySubject.get(lsId) ?? [];

    const resultByComponent = new Map(results.map((r) => [r.assessmentComponentId, r]));

    const componentItems: ComponentProgressItem[] = components.map((comp) => {
      const result = resultByComponent.get(comp.id) ?? null;
      return {
        componentId: comp.id,
        componentName: comp.name,
        componentType: comp.componentType,
        weight: comp.weight,
        maxGrade: comp.maxGrade,
        isRequired: comp.isRequired,
        grade: result != null ? parseFloat(String(result.grade)) : null,
        maxGradeResult: result != null ? parseFloat(String(result.maxGrade)) : null,
        normalizedGrade: result != null ? parseFloat(String(result.normalizedGrade)) : null,
        sourceType: result?.sourceType ?? null,
        gradedAt: result?.gradedAt ?? null,
        gradedBy: result?.gradedBy ?? null,
        assessmentEventId: result?.assessmentEventId ?? null,
        status: result?.status ?? null,
      };
    });

    // Add orphaned results (component not in active policy)
    for (const r of results) {
      if (!componentItems.find((c) => c.componentId === r.assessmentComponentId)) {
        componentItems.push({
          componentId: r.assessmentComponentId,
          componentName: r.componentName ?? r.assessmentComponentId,
          componentType: r.componentType ?? "OTHER",
          weight: 0,
          maxGrade: parseFloat(String(r.maxGrade)),
          isRequired: false,
          grade: parseFloat(String(r.grade)),
          maxGradeResult: parseFloat(String(r.maxGrade)),
          normalizedGrade: parseFloat(String(r.normalizedGrade)),
          sourceType: r.sourceType,
          gradedAt: r.gradedAt ?? null,
          gradedBy: r.gradedBy ?? null,
          assessmentEventId: r.assessmentEventId ?? null,
          status: r.status,
        });
      }
    }

    const gradedCount = componentItems.filter((c) => c.status === "GRADED").length;
    const requiredCount = componentItems.filter((c) => c.isRequired).length;
    const missingRequiredCount = componentItems.filter(
      (c) => c.isRequired && c.status !== "GRADED"
    ).length;

    return {
      levelSubjectId: lsId,
      subjectName: progress?.subjectName ?? results[0]?.subjectName ?? lsId,
      courseLevelName: progress?.courseLevelName ?? null,
      finalGrade: progress?.finalGrade ?? null,
      minimumPassingGrade: progress?.minimumPassingGrade ?? null,
      status: progress?.status ?? "IN_PROGRESS",
      progressReason: progress?.progressReason ?? null,
      completedAt: progress?.completedAt ?? null,
      updatedAt: progress?.updatedAt ?? results[0]?.updatedAt ?? new Date(),
      components: componentItems,
      gradedCount,
      requiredCount,
      missingRequiredCount,
    };
  });
}

export async function getStudentTranscript(
  studentId: string,
  organizationId: string
): Promise<TranscriptEnrollment[]> {
  const db = await getDb();

  const enrollments = await db.enrollment.findMany({
    where: { studentId, organizationId, deletedAt: null },
    select: {
      id: true,
      status: true,
      enrollmentDate: true,
      startDate: true,
      expectedEndDate: true,
      course: { select: { name: true } },
      courseLevel: { select: { name: true } },
    },
    orderBy: { enrollmentDate: "desc" },
  });

  const results = await Promise.all(
    enrollments.map(async (enr) => ({
      enrollmentId: enr.id,
      courseName: enr.course.name,
      courseLevelName: enr.courseLevel?.name ?? null,
      enrollmentStatus: enr.status,
      enrollmentDate: enr.enrollmentDate,
      startDate: enr.startDate ?? null,
      completedAt: enr.expectedEndDate ?? null,
      subjects: await findProgressByEnrollment(enr.id, organizationId),
    }))
  );

  return results;
}
