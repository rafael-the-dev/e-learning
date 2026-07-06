import { getDb } from "@/server/db";
import type { PrismaClientOrTx } from "@/server/db";
import type {
  SourceStudentRecord,
  SourceEnrollmentRecord,
  SourceCourseProgressRecord,
  SourceLevelProgressRecord,
  SourceSubjectProgressRecord,
  SourceAssessmentResultRecord,
  SourceSubjectAttendanceSummaryRecord,
  SourcePeriodAttendanceSummaryRecord,
} from "@/modules/transcripts/types";

// =============================================================================
// ACADEMIC TRANSCRIPT SOURCE REPOSITORY (Phase 2) — READ ONLY
//
// Read-only loaders over the Academic Core models the Snapshot Builder (Phase 3)
// will freeze. This layer NEVER writes to source models and NEVER calculates:
// it selects fields (identity names/codes/thresholds included so the builder can
// freeze them) and surfaces Decimal columns as numbers verbatim. No averaging,
// no pass/fail derivation, no attendance recomputation, no eligibility — every
// value is copied as stored. Every query is scoped by `organizationId`; missing
// sources return `null` / `[]`.
// =============================================================================

const toNum = (v: unknown): number | null => (v == null ? null : Number(v));

export interface StudentSourceParams {
  organizationId: string;
  studentId: string;
}

export async function findStudentForTranscript(
  params: StudentSourceParams,
  client?: PrismaClientOrTx
): Promise<SourceStudentRecord | null> {
  const db = client ?? (await getDb());
  const row = await db.student.findFirst({
    where: { id: params.studentId, organizationId: params.organizationId, deletedAt: null },
    select: {
      id: true,
      organizationId: true,
      code: true,
      firstName: true,
      lastName: true,
      email: true,
      dateOfBirth: true,
      idType: true,
      idNumber: true,
      status: true,
    },
  });
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organizationId,
    code: row.code ?? null,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email ?? null,
    dateOfBirth: row.dateOfBirth ?? null,
    idType: row.idType ?? null,
    idNumber: row.idNumber ?? null,
    status: row.status,
  };
}

export interface EnrollmentSourceParams {
  organizationId: string;
  enrollmentId: string;
}

export async function findEnrollmentForTranscript(
  params: EnrollmentSourceParams,
  client?: PrismaClientOrTx
): Promise<SourceEnrollmentRecord | null> {
  const db = client ?? (await getDb());
  const row = await db.enrollment.findFirst({
    where: { id: params.enrollmentId, organizationId: params.organizationId, deletedAt: null },
    select: {
      id: true,
      organizationId: true,
      studentId: true,
      courseId: true,
      courseLevelId: true,
      academicYearId: true,
      academicTermId: true,
      enrollmentNumber: true,
      status: true,
      course: {
        select: {
          id: true,
          name: true,
          code: true,
          totalHours: true,
          category: { select: { id: true, name: true } },
        },
      },
    },
  });
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organizationId,
    studentId: row.studentId,
    courseId: row.courseId,
    courseLevelId: row.courseLevelId ?? null,
    academicYearId: row.academicYearId,
    academicTermId: row.academicTermId ?? null,
    enrollmentNumber: row.enrollmentNumber ?? null,
    status: row.status,
    course: row.course
      ? {
          id: row.course.id,
          name: row.course.name,
          code: row.course.code ?? null,
          totalHours: row.course.totalHours ?? null,
          category: row.course.category
            ? { id: row.course.category.id, name: row.course.category.name }
            : null,
        }
      : null,
  };
}

export async function findCourseProgressForTranscript(
  params: EnrollmentSourceParams,
  client?: PrismaClientOrTx
): Promise<SourceCourseProgressRecord | null> {
  const db = client ?? (await getDb());
  const row = await db.studentCourseProgress.findFirst({
    where: { enrollmentId: params.enrollmentId, organizationId: params.organizationId },
    select: {
      id: true,
      organizationId: true,
      enrollmentId: true,
      studentId: true,
      courseId: true,
      finalGrade: true,
      earnedCredits: true,
      status: true,
      completedAt: true,
      calculatedAt: true,
    },
  });
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organizationId,
    enrollmentId: row.enrollmentId,
    studentId: row.studentId,
    courseId: row.courseId,
    finalGrade: toNum(row.finalGrade),
    earnedCredits: row.earnedCredits ?? null,
    status: row.status,
    completedAt: row.completedAt ?? null,
    calculatedAt: row.calculatedAt ?? null,
  };
}

export async function findLevelProgressForTranscript(
  params: EnrollmentSourceParams,
  client?: PrismaClientOrTx
): Promise<SourceLevelProgressRecord[]> {
  const db = client ?? (await getDb());
  const rows = await db.studentLevelProgress.findMany({
    where: { enrollmentId: params.enrollmentId, organizationId: params.organizationId },
    select: {
      id: true,
      organizationId: true,
      enrollmentId: true,
      studentId: true,
      courseId: true,
      courseLevelId: true,
      finalGrade: true,
      earnedCredits: true,
      status: true,
      completedAt: true,
      calculatedAt: true,
      createdAt: true,
      courseLevel: {
        select: { id: true, name: true, code: true, order: true, totalHours: true },
      },
    },
    orderBy: [{ courseLevel: { order: "asc" } }, { id: "asc" }],
  });
  return rows.map((row) => ({
    id: row.id,
    organizationId: row.organizationId,
    enrollmentId: row.enrollmentId,
    studentId: row.studentId,
    courseId: row.courseId,
    courseLevelId: row.courseLevelId,
    finalGrade: toNum(row.finalGrade),
    earnedCredits: row.earnedCredits ?? null,
    status: row.status,
    completedAt: row.completedAt ?? null,
    calculatedAt: row.calculatedAt ?? null,
    createdAt: row.createdAt,
    courseLevel: row.courseLevel
      ? {
          id: row.courseLevel.id,
          name: row.courseLevel.name,
          code: row.courseLevel.code ?? null,
          order: row.courseLevel.order,
          totalHours: row.courseLevel.totalHours ?? null,
        }
      : null,
  }));
}

export async function findSubjectProgressForTranscript(
  params: EnrollmentSourceParams,
  client?: PrismaClientOrTx
): Promise<SourceSubjectProgressRecord[]> {
  const db = client ?? (await getDb());
  const rows = await db.studentSubjectProgress.findMany({
    where: { enrollmentId: params.enrollmentId, organizationId: params.organizationId },
    select: {
      id: true,
      organizationId: true,
      enrollmentId: true,
      studentId: true,
      levelSubjectId: true,
      finalGrade: true,
      attendancePercentage: true,
      status: true,
      completedAt: true,
      levelSubject: {
        select: {
          id: true,
          courseLevelId: true,
          order: true,
          minimumPassingGrade: true,
          minimumAttendancePercentage: true,
          credits: true,
          workloadHours: true,
          isRequired: true,
          attendancePolicyId: true,
          subject: { select: { id: true, name: true, code: true } },
        },
      },
    },
    orderBy: [{ levelSubject: { order: "asc" } }, { id: "asc" }],
  });
  return rows.map((row) => ({
    id: row.id,
    organizationId: row.organizationId,
    enrollmentId: row.enrollmentId,
    studentId: row.studentId,
    levelSubjectId: row.levelSubjectId,
    finalGrade: toNum(row.finalGrade),
    attendancePercentage: toNum(row.attendancePercentage),
    status: row.status,
    completedAt: row.completedAt ?? null,
    levelSubject: row.levelSubject
      ? {
          id: row.levelSubject.id,
          courseLevelId: row.levelSubject.courseLevelId,
          order: row.levelSubject.order,
          minimumPassingGrade: toNum(row.levelSubject.minimumPassingGrade),
          minimumAttendancePercentage: toNum(row.levelSubject.minimumAttendancePercentage),
          credits: row.levelSubject.credits ?? null,
          workloadHours: row.levelSubject.workloadHours ?? null,
          isRequired: row.levelSubject.isRequired,
          attendancePolicyId: row.levelSubject.attendancePolicyId ?? null,
          subject: row.levelSubject.subject
            ? {
                id: row.levelSubject.subject.id,
                name: row.levelSubject.subject.name,
                code: row.levelSubject.subject.code ?? null,
              }
            : null,
        }
      : null,
  }));
}

export async function findAssessmentResultsForTranscript(
  params: EnrollmentSourceParams,
  client?: PrismaClientOrTx
): Promise<SourceAssessmentResultRecord[]> {
  const db = client ?? (await getDb());
  const rows = await db.studentAssessmentResult.findMany({
    where: { enrollmentId: params.enrollmentId, organizationId: params.organizationId },
    select: {
      id: true,
      organizationId: true,
      enrollmentId: true,
      studentId: true,
      levelSubjectId: true,
      subjectId: true,
      assessmentComponentId: true,
      assessmentEventId: true,
      sourceType: true,
      grade: true,
      maxGrade: true,
      normalizedGrade: true,
      status: true,
      gradedAt: true,
      assessmentComponent: {
        select: { id: true, name: true, componentType: true, order: true },
      },
      assessmentEvent: { select: { id: true, title: true } },
    },
    orderBy: [{ levelSubjectId: "asc" }, { id: "asc" }],
  });
  return rows.map((row) => ({
    id: row.id,
    organizationId: row.organizationId,
    enrollmentId: row.enrollmentId,
    studentId: row.studentId,
    levelSubjectId: row.levelSubjectId,
    subjectId: row.subjectId,
    assessmentComponentId: row.assessmentComponentId,
    assessmentEventId: row.assessmentEventId ?? null,
    sourceType: row.sourceType,
    grade: Number(row.grade),
    maxGrade: Number(row.maxGrade),
    normalizedGrade: Number(row.normalizedGrade),
    status: row.status,
    gradedAt: row.gradedAt ?? null,
    assessmentComponent: row.assessmentComponent
      ? {
          id: row.assessmentComponent.id,
          name: row.assessmentComponent.name,
          componentType: row.assessmentComponent.componentType,
          order: row.assessmentComponent.order,
        }
      : null,
    assessmentEvent: row.assessmentEvent
      ? { id: row.assessmentEvent.id, title: row.assessmentEvent.title }
      : null,
  }));
}

export async function findSubjectAttendanceSummariesForTranscript(
  params: EnrollmentSourceParams,
  client?: PrismaClientOrTx
): Promise<SourceSubjectAttendanceSummaryRecord[]> {
  const db = client ?? (await getDb());
  const rows = await db.studentSubjectAttendanceSummary.findMany({
    where: { enrollmentId: params.enrollmentId, organizationId: params.organizationId },
    select: {
      id: true,
      organizationId: true,
      enrollmentId: true,
      studentId: true,
      levelSubjectId: true,
      attendancePolicyId: true,
      totalSessions: true,
      totalScheduledMinutes: true,
      totalPresentMinutes: true,
      attendancePercentage: true,
      status: true,
      calculatedAt: true,
      attendancePolicy: { select: { id: true, name: true } },
      levelSubject: { select: { minimumAttendancePercentage: true } },
    },
    orderBy: [{ levelSubjectId: "asc" }, { id: "asc" }],
  });
  return rows.map((row) => ({
    id: row.id,
    organizationId: row.organizationId,
    enrollmentId: row.enrollmentId,
    studentId: row.studentId,
    levelSubjectId: row.levelSubjectId,
    attendancePolicyId: row.attendancePolicyId ?? null,
    totalSessions: row.totalSessions,
    totalScheduledMinutes: row.totalScheduledMinutes,
    totalPresentMinutes: row.totalPresentMinutes,
    attendancePercentage: toNum(row.attendancePercentage),
    status: row.status,
    calculatedAt: row.calculatedAt ?? null,
    attendancePolicy: row.attendancePolicy
      ? { id: row.attendancePolicy.id, name: row.attendancePolicy.name }
      : null,
    levelSubject: row.levelSubject
      ? { minimumAttendancePercentage: toNum(row.levelSubject.minimumAttendancePercentage) }
      : null,
  }));
}

export async function findPeriodAttendanceSummariesForTranscript(
  params: EnrollmentSourceParams,
  client?: PrismaClientOrTx
): Promise<SourcePeriodAttendanceSummaryRecord[]> {
  const db = client ?? (await getDb());
  const rows = await db.studentPeriodAttendanceSummary.findMany({
    where: { enrollmentId: params.enrollmentId, organizationId: params.organizationId },
    select: {
      id: true,
      organizationId: true,
      enrollmentId: true,
      studentId: true,
      courseId: true,
      courseLevelId: true,
      academicYearId: true,
      academicTermId: true,
      totalSessions: true,
      totalScheduledMinutes: true,
      totalPresentMinutes: true,
      attendancePercentage: true,
      status: true,
      calculatedAt: true,
    },
    orderBy: [{ academicYearId: "asc" }, { id: "asc" }],
  });
  return rows.map((row) => ({
    id: row.id,
    organizationId: row.organizationId,
    enrollmentId: row.enrollmentId,
    studentId: row.studentId,
    courseId: row.courseId,
    courseLevelId: row.courseLevelId ?? null,
    academicYearId: row.academicYearId,
    academicTermId: row.academicTermId ?? null,
    totalSessions: row.totalSessions,
    totalScheduledMinutes: row.totalScheduledMinutes,
    totalPresentMinutes: row.totalPresentMinutes,
    attendancePercentage: toNum(row.attendancePercentage),
    status: row.status,
    calculatedAt: row.calculatedAt ?? null,
  }));
}
