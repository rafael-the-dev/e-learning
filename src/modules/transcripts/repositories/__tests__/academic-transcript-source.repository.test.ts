import { beforeEach, describe, expect, it } from "vitest";
import { asClient, makeFakeDb, seed, type FakeDb } from "./_fake-db";
import {
  findAssessmentResultsForTranscript,
  findCourseProgressForTranscript,
  findEnrollmentForTranscript,
  findLevelProgressForTranscript,
  findPeriodAttendanceSummariesForTranscript,
  findStudentForTranscript,
  findSubjectAttendanceSummariesForTranscript,
  findSubjectProgressForTranscript,
} from "../academic-transcript-source.repository";

const ORG_A = "org-A";
const ORG_B = "org-B";
const ENR = "enr-1";

let db: FakeDb;

beforeEach(() => {
  db = makeFakeDb();
});

describe("academic-transcript-source.repository — reads are org-scoped (test #17)", () => {
  it("findStudentForTranscript returns null for another org", async () => {
    seed(db, "student", {
      id: "s-1",
      organizationId: ORG_A,
      code: "AL-001",
      firstName: "Ana",
      lastName: "Silva",
      email: "ana@x.pt",
      dateOfBirth: new Date("2000-01-01"),
      idType: "BI",
      idNumber: "123",
      status: "ACTIVE",
      deletedAt: null,
    });

    await expect(
      findStudentForTranscript({ organizationId: ORG_A, studentId: "s-1" }, asClient(db))
    ).resolves.toMatchObject({ id: "s-1", firstName: "Ana", code: "AL-001" });

    await expect(
      findStudentForTranscript({ organizationId: ORG_B, studentId: "s-1" }, asClient(db))
    ).resolves.toBeNull();
  });

  it("findEnrollmentForTranscript is org-scoped and surfaces the nested course verbatim", async () => {
    seed(db, "enrollment", {
      id: ENR,
      organizationId: ORG_A,
      studentId: "s-1",
      courseId: "c-1",
      courseLevelId: "cl-1",
      academicYearId: "ay-1",
      academicTermId: "at-1",
      enrollmentNumber: "E-001",
      status: "ACTIVE",
      deletedAt: null,
      course: { id: "c-1", name: "Ligeiros", code: "B", totalHours: 32 },
    });

    const hit = await findEnrollmentForTranscript({ organizationId: ORG_A, enrollmentId: ENR }, asClient(db));
    expect(hit).toMatchObject({
      id: ENR,
      courseId: "c-1",
      course: { id: "c-1", name: "Ligeiros", code: "B", totalHours: 32 },
    });

    await expect(
      findEnrollmentForTranscript({ organizationId: ORG_B, enrollmentId: ENR }, asClient(db))
    ).resolves.toBeNull();
  });
});

describe("academic-transcript-source.repository — copies values verbatim, no calculation (test #18)", () => {
  it("findCourseProgressForTranscript returns the stored finalGrade unchanged", async () => {
    seed(db, "studentCourseProgress", {
      id: "cp-1",
      organizationId: ORG_A,
      enrollmentId: ENR,
      studentId: "s-1",
      courseId: "c-1",
      finalGrade: 15.5,
      earnedCredits: 12,
      status: "COMPLETED",
      completedAt: new Date("2026-06-01"),
      calculatedAt: new Date("2026-06-01"),
    });
    const cp = await findCourseProgressForTranscript({ organizationId: ORG_A, enrollmentId: ENR }, asClient(db));
    expect(cp?.finalGrade).toBe(15.5); // exact copy, not re-derived
    expect(cp?.earnedCredits).toBe(12);
    expect(cp?.status).toBe("COMPLETED");
  });

  it("findSubjectProgressForTranscript copies grade + attendance verbatim and freezes identity thresholds", async () => {
    seed(db, "studentSubjectProgress", {
      id: "sp-1",
      organizationId: ORG_A,
      enrollmentId: ENR,
      studentId: "s-1",
      levelSubjectId: "ls-1",
      finalGrade: 8, // a failing grade — repo must NOT normalise/round it
      attendancePercentage: 73.25,
      status: "FAILED",
      completedAt: null,
      levelSubject: {
        id: "ls-1",
        courseLevelId: "cl-1",
        order: 1,
        minimumPassingGrade: 10,
        minimumAttendancePercentage: 75,
        credits: 4,
        workloadHours: 20,
        isRequired: true,
        attendancePolicyId: "pol-1",
        subject: { id: "sub-1", name: "Código", code: "COD" },
      },
    });
    const rows = await findSubjectProgressForTranscript({ organizationId: ORG_A, enrollmentId: ENR }, asClient(db));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      finalGrade: 8,
      attendancePercentage: 73.25,
      status: "FAILED", // status copied, not derived from grade vs threshold
      levelSubject: {
        minimumPassingGrade: 10,
        minimumAttendancePercentage: 75,
        credits: 4,
        subject: { name: "Código", code: "COD" },
      },
    });
  });

  it("findAssessmentResultsForTranscript copies raw grade/maxGrade/normalizedGrade", async () => {
    seed(db, "studentAssessmentResult", {
      id: "ar-1",
      organizationId: ORG_A,
      enrollmentId: ENR,
      studentId: "s-1",
      levelSubjectId: "ls-1",
      subjectId: "sub-1",
      assessmentComponentId: "ac-1",
      assessmentEventId: null,
      sourceType: "CONTINUOUS",
      grade: 14,
      maxGrade: 20,
      normalizedGrade: 14,
      status: "GRADED",
      gradedAt: new Date("2026-05-01"),
      assessmentComponent: { id: "ac-1", name: "Teste", componentType: "TEST" },
      assessmentEvent: null,
    });
    const rows = await findAssessmentResultsForTranscript({ organizationId: ORG_A, enrollmentId: ENR }, asClient(db));
    expect(rows[0]).toMatchObject({ grade: 14, maxGrade: 20, normalizedGrade: 14, status: "GRADED" });
    expect(rows[0].assessmentComponent).toMatchObject({ name: "Teste", componentType: "TEST" });
  });

  it("attendance summaries copy stored minutes/percentages verbatim (no recomputation)", async () => {
    seed(db, "studentSubjectAttendanceSummary", {
      id: "sas-1",
      organizationId: ORG_A,
      enrollmentId: ENR,
      studentId: "s-1",
      levelSubjectId: "ls-1",
      attendancePolicyId: "pol-1",
      totalSessions: 10,
      totalScheduledMinutes: 600,
      totalPresentMinutes: 480,
      attendancePercentage: 80, // stored; repo must not recompute 480/600
      status: "SUFFICIENT",
      calculatedAt: new Date("2026-05-01"),
      attendancePolicy: { id: "pol-1", name: "Padrão" },
      levelSubject: { minimumAttendancePercentage: 75 },
    });
    const rows = await findSubjectAttendanceSummariesForTranscript({ organizationId: ORG_A, enrollmentId: ENR }, asClient(db));
    expect(rows[0]).toMatchObject({
      totalPresentMinutes: 480,
      totalScheduledMinutes: 600,
      attendancePercentage: 80,
      status: "SUFFICIENT",
      attendancePolicy: { name: "Padrão" },
    });
  });
});

describe("academic-transcript-source.repository — missing sources return null/empty (test #19)", () => {
  it("returns null for a missing single-record source", async () => {
    await expect(
      findStudentForTranscript({ organizationId: ORG_A, studentId: "missing" }, asClient(db))
    ).resolves.toBeNull();
    await expect(
      findEnrollmentForTranscript({ organizationId: ORG_A, enrollmentId: "missing" }, asClient(db))
    ).resolves.toBeNull();
    await expect(
      findCourseProgressForTranscript({ organizationId: ORG_A, enrollmentId: "missing" }, asClient(db))
    ).resolves.toBeNull();
  });

  it("returns [] for missing list sources", async () => {
    await expect(
      findLevelProgressForTranscript({ organizationId: ORG_A, enrollmentId: "missing" }, asClient(db))
    ).resolves.toEqual([]);
    await expect(
      findSubjectProgressForTranscript({ organizationId: ORG_A, enrollmentId: "missing" }, asClient(db))
    ).resolves.toEqual([]);
    await expect(
      findAssessmentResultsForTranscript({ organizationId: ORG_A, enrollmentId: "missing" }, asClient(db))
    ).resolves.toEqual([]);
    await expect(
      findPeriodAttendanceSummariesForTranscript({ organizationId: ORG_A, enrollmentId: "missing" }, asClient(db))
    ).resolves.toEqual([]);
  });
});
