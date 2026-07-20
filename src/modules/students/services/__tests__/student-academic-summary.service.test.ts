import { describe, it, expect } from "vitest";
import {
  buildStudentAcademicSummary,
  type StudentAcademicSummaryInput,
} from "../student-academic-summary.service";
import type { StudentSubjectProgress } from "@/modules/assessments/types";
import type { StudentLevelProgress, StudentCourseProgress } from "@/modules/prerequisites/types";
import type { Enrollment } from "@/modules/enrollments/types";

function subject(status: string, finalGrade: number | null): StudentSubjectProgress {
  return { status, finalGrade } as unknown as StudentSubjectProgress;
}
function level(status: string): StudentLevelProgress {
  return { status } as unknown as StudentLevelProgress;
}
function courseProgress(enrollmentId: string, finalGrade: number | null): StudentCourseProgress {
  return { enrollmentId, finalGrade } as unknown as StudentCourseProgress;
}
function enrollment(overrides: Partial<Enrollment> = {}): Enrollment {
  return {
    id: "enr-1",
    currentLevelId: null,
    courseLevelId: "level-1",
    currentLevelName: null,
    courseLevelName: "Nível 1",
    ...overrides,
  } as unknown as Enrollment;
}

function input(overrides: Partial<StudentAcademicSummaryInput> = {}): StudentAcademicSummaryInput {
  return {
    subjectProgress: [],
    levelProgress: [],
    courseProgress: [],
    currentEnrollment: enrollment(),
    ...overrides,
  };
}

describe("buildStudentAcademicSummary", () => {
  it("subjectAverage is the simple mean of graded subjects' finalGrade, 1 dp", () => {
    const s = buildStudentAcademicSummary(
      input({ subjectProgress: [subject("PASSED", 80), subject("PASSED", 91)] })
    );
    expect(s.subjectAverage).toBe(85.5);
    expect(s.scale).toBe(100);
  });

  it("excludes subjects with a null finalGrade from the average but still tallies them", () => {
    const s = buildStudentAcademicSummary(
      input({
        subjectProgress: [subject("PASSED", 90), subject("IN_PROGRESS", null), subject("FAILED", 40)],
      })
    );
    // (90 + 40) / 2 = 65, the IN_PROGRESS ungraded subject is not averaged
    expect(s.subjectAverage).toBe(65);
    expect(s.gradedSubjects).toBe(2);
    expect(s.passedSubjects).toBe(1);
    expect(s.failedSubjects).toBe(1);
    expect(s.inProgressSubjects).toBe(1);
  });

  it("is independent of subject ordering (no pagination / order sensitivity)", () => {
    const a = buildStudentAcademicSummary(
      input({ subjectProgress: [subject("PASSED", 70), subject("PASSED", 80), subject("PASSED", 90)] })
    );
    const b = buildStudentAcademicSummary(
      input({ subjectProgress: [subject("PASSED", 90), subject("PASSED", 70), subject("PASSED", 80)] })
    );
    expect(a.subjectAverage).toBe(80);
    expect(a.subjectAverage).toBe(b.subjectAverage);
  });

  it("courseFinalGrade comes from the CURRENT enrollment's course rollup (1 dp), matching the Transcript", () => {
    const s = buildStudentAcademicSummary(
      input({
        currentEnrollment: enrollment({ id: "enr-9" }),
        courseProgress: [courseProgress("enr-other", 60), courseProgress("enr-9", 84.25)],
      })
    );
    expect(s.courseFinalGrade).toBe(84.3);
  });

  it("courseFinalGrade is null when there is no course rollup for the current enrollment", () => {
    const s = buildStudentAcademicSummary(
      input({ currentEnrollment: enrollment({ id: "enr-9" }), courseProgress: [courseProgress("enr-other", 60)] })
    );
    expect(s.courseFinalGrade).toBeNull();
  });

  it("progressionStatus follows the precedence BLOCKED > RECOVERY > FAILED > IN_PROGRESS > Regular", () => {
    expect(
      buildStudentAcademicSummary(input({ levelProgress: [level("BLOCKED")], subjectProgress: [subject("FAILED", 10)] }))
        .progressionStatus
    ).toBe("Bloqueado");
    expect(
      buildStudentAcademicSummary(input({ levelProgress: [level("RECOVERY_REQUIRED")] })).progressionStatus
    ).toBe("Em Recuperação");
    expect(
      buildStudentAcademicSummary(input({ subjectProgress: [subject("FAILED", 10)] })).progressionStatus
    ).toBe("Risco Académico");
    expect(
      buildStudentAcademicSummary(input({ subjectProgress: [subject("IN_PROGRESS", null)] })).progressionStatus
    ).toBe("Em Curso");
    expect(buildStudentAcademicSummary(input()).progressionStatus).toBe("Regular");
  });

  it("resolves the current level: currentLevelId wins over the frozen courseLevelId", () => {
    const promoted = buildStudentAcademicSummary(
      input({ currentEnrollment: enrollment({ currentLevelId: "level-2", currentLevelName: "Nível 2" }) })
    );
    expect(promoted.currentLevel).toEqual({ id: "level-2", name: "Nível 2" });

    const notPromoted = buildStudentAcademicSummary(input());
    expect(notPromoted.currentLevel).toEqual({ id: "level-1", name: "Nível 1" });
  });

  it("empty case: no graded subjects → subjectAverage null (never 0), tallies 0, status Regular", () => {
    const s = buildStudentAcademicSummary(input({ currentEnrollment: null }));
    expect(s.subjectAverage).toBeNull();
    expect(s.courseFinalGrade).toBeNull();
    expect(s.gradedSubjects).toBe(0);
    expect(s.passedSubjects).toBe(0);
    expect(s.progressionStatus).toBe("Regular");
    expect(s.currentLevel).toEqual({ id: null, name: null });
  });

  // Consistency guarantee (H2): the average is defined ONCE. Any two consumers that read
  // subjectAverage for the same student get the identical number, by construction.
  it("consistency: the same subjectProgress yields one and only one subjectAverage", () => {
    const subjectProgress = [subject("PASSED", 88), subject("FAILED", 47), subject("PASSED", 75)];
    const first = buildStudentAcademicSummary(input({ subjectProgress }));
    const second = buildStudentAcademicSummary(input({ subjectProgress }));
    expect(first.subjectAverage).toBe(70); // (88+47+75)/3 = 70
    expect(first.subjectAverage).toBe(second.subjectAverage);
  });
});
