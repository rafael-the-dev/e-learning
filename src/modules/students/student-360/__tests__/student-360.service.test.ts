import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

// ---------------------------------------------------------------------------
// Module mocks — hoisted before any import that touches the module under test
// ---------------------------------------------------------------------------

vi.mock("@/modules/courses/services/course.service", () => ({
  getLevelSubjectsByLevel: vi.fn(),
}));

vi.mock("@/modules/prerequisites/engines/subject-eligibility.engine", () => ({
  evaluateEligibilityForAllSubjects: vi.fn(),
  evaluateSubjectEligibility: vi.fn(),
}));

import {
  resolveCurrentEnrollmentLevel,
  getProgressTabData,
} from "@/modules/students/student-360/services/student-360.service";
import { getLevelSubjectsByLevel } from "@/modules/courses/services/course.service";
import {
  evaluateEligibilityForAllSubjects,
  evaluateSubjectEligibility,
} from "@/modules/prerequisites/engines/subject-eligibility.engine";
import type { Enrollment } from "@/modules/enrollments/types";
import type { LevelSubject } from "@/modules/courses/types";

const getLevelSubjectsByLevelMock = getLevelSubjectsByLevel as Mock;
const evaluateEligibilityForAllSubjectsMock = evaluateEligibilityForAllSubjects as Mock;
const evaluateSubjectEligibilityMock = evaluateSubjectEligibility as Mock;

const ORG = "org-1";

function makeEnrollment(overrides: Partial<Enrollment> = {}): Enrollment {
  return {
    id: "enr-1",
    organizationId: ORG,
    branchId: null,
    studentId: "student-1",
    courseId: "course-1",
    courseLevelId: "level-1",
    currentLevelId: null,
    classGroupId: null,
    academicYearId: "year-1",
    academicTermId: null,
    enrollmentNumber: "ENR-0001",
    enrollmentDate: new Date("2025-01-01"),
    startDate: null,
    expectedEndDate: null,
    status: "ACTIVE",
    notes: null,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    deletedAt: null,
    createdBy: null,
    updatedBy: null,
    courseLevelName: "Nível 1",
    currentLevelName: null,
    ...overrides,
  };
}

function makeLevelSubject(overrides: Partial<LevelSubject> = {}): LevelSubject {
  return {
    id: "ls-1",
    organizationId: ORG,
    courseId: "course-1",
    courseLevelId: "level-1",
    subjectId: "subj-1",
    order: 1,
    workloadHours: null,
    theoryHours: null,
    practicalHours: null,
    minimumPassingGrade: null,
    minimumAttendancePercentage: null,
    maxAbsences: null,
    isRequired: true,
    allowRetakeExam: false,
    allowCompensation: false,
    certificateRequired: false,
    status: "ACTIVE",
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    deletedAt: null,
    subjectName: "Matemática",
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("resolveCurrentEnrollmentLevel", () => {
  it("returns the currentLevel when currentLevelId is set (promoted student)", () => {
    const enrollment = makeEnrollment({
      courseLevelId: "level-1",
      courseLevelName: "Nível 1",
      currentLevelId: "level-2",
      currentLevelName: "Nível 2",
    });

    expect(resolveCurrentEnrollmentLevel(enrollment)).toEqual({ id: "level-2", name: "Nível 2" });
  });

  it("falls back to courseLevel when currentLevelId is null (never promoted)", () => {
    const enrollment = makeEnrollment({
      courseLevelId: "level-1",
      courseLevelName: "Nível 1",
      currentLevelId: null,
      currentLevelName: null,
    });

    expect(resolveCurrentEnrollmentLevel(enrollment)).toEqual({ id: "level-1", name: "Nível 1" });
  });

  it("never shows the stale courseLevelName once a promotion has happened", () => {
    const promoted = makeEnrollment({
      courseLevelId: "level-1",
      courseLevelName: "Nível 1",
      currentLevelId: "level-2",
      currentLevelName: "Nível 2",
    });

    const resolved = resolveCurrentEnrollmentLevel(promoted);
    expect(resolved.name).toBe("Nível 2");
    expect(resolved.name).not.toBe(promoted.courseLevelName);
  });

  it("returns nulls when there is no enrollment", () => {
    expect(resolveCurrentEnrollmentLevel(null)).toEqual({ id: null, name: null });
  });
});

describe("getProgressTabData", () => {
  it("looks up level subjects using currentLevelId when the student has been promoted", async () => {
    const enrollment = makeEnrollment({ courseLevelId: "level-1", currentLevelId: "level-2" });
    getLevelSubjectsByLevelMock.mockResolvedValue([]);
    evaluateEligibilityForAllSubjectsMock.mockResolvedValue(new Map());

    await getProgressTabData(ORG, enrollment);

    expect(getLevelSubjectsByLevelMock).toHaveBeenCalledWith("level-2", ORG);
  });

  it("falls back to courseLevelId for level subject lookup when currentLevelId is null", async () => {
    const enrollment = makeEnrollment({ courseLevelId: "level-1", currentLevelId: null });
    getLevelSubjectsByLevelMock.mockResolvedValue([]);
    evaluateEligibilityForAllSubjectsMock.mockResolvedValue(new Map());

    await getProgressTabData(ORG, enrollment);

    expect(getLevelSubjectsByLevelMock).toHaveBeenCalledWith("level-1", ORG);
  });

  it("calls evaluateEligibilityForAllSubjects with the enrollmentId and organizationId, tenant-scoped", async () => {
    const enrollment = makeEnrollment({ id: "enr-99", currentLevelId: "level-2" });
    getLevelSubjectsByLevelMock.mockResolvedValue([]);
    evaluateEligibilityForAllSubjectsMock.mockResolvedValue(new Map());

    await getProgressTabData(ORG, enrollment);

    expect(evaluateEligibilityForAllSubjectsMock).toHaveBeenCalledWith("enr-99", ORG);
  });

  it("never calls the manual per-subject evaluateSubjectEligibility loop", async () => {
    const enrollment = makeEnrollment({ currentLevelId: "level-2" });
    getLevelSubjectsByLevelMock.mockResolvedValue([makeLevelSubject()]);
    evaluateEligibilityForAllSubjectsMock.mockResolvedValue(
      new Map([["ls-1", { status: "ELIGIBLE", levelSubjectId: "ls-1", missingPrerequisites: [], isEligible: true }]])
    );

    await getProgressTabData(ORG, enrollment);

    expect(evaluateSubjectEligibilityMock).not.toHaveBeenCalled();
  });

  it("builds eligibility rows from the engine's batched output, joined by levelSubjectId", async () => {
    const enrollment = makeEnrollment({ currentLevelId: "level-2" });
    const levelSubject = makeLevelSubject({ id: "ls-1", subjectName: "Física" });
    getLevelSubjectsByLevelMock.mockResolvedValue([levelSubject]);
    const result = { status: "PENDING_PREREQUISITE", levelSubjectId: "ls-1", missingPrerequisites: [], isEligible: false };
    evaluateEligibilityForAllSubjectsMock.mockResolvedValue(new Map([["ls-1", result]]));

    const { eligibility } = await getProgressTabData(ORG, enrollment);

    expect(eligibility).toEqual([{ levelSubject, eligibility: result }]);
  });

  it("only renders ACTIVE level subjects, matching what the engine actually evaluates", async () => {
    const enrollment = makeEnrollment({ currentLevelId: "level-2" });
    const active = makeLevelSubject({ id: "ls-active", status: "ACTIVE" });
    const inactive = makeLevelSubject({ id: "ls-inactive", status: "INACTIVE" });
    getLevelSubjectsByLevelMock.mockResolvedValue([active, inactive]);
    evaluateEligibilityForAllSubjectsMock.mockResolvedValue(
      new Map([["ls-active", { status: "ELIGIBLE", levelSubjectId: "ls-active", missingPrerequisites: [], isEligible: true }]])
    );

    const { levelSubjects, eligibility } = await getProgressTabData(ORG, enrollment);

    expect(levelSubjects).toEqual([active]);
    expect(eligibility).toHaveLength(1);
    expect(eligibility[0].levelSubject.id).toBe("ls-active");
  });

  it("falls back to a BLOCKED result if a level subject has no entry in the engine's map", async () => {
    const enrollment = makeEnrollment({ currentLevelId: "level-2" });
    const levelSubject = makeLevelSubject({ id: "ls-1" });
    getLevelSubjectsByLevelMock.mockResolvedValue([levelSubject]);
    evaluateEligibilityForAllSubjectsMock.mockResolvedValue(new Map());

    const { eligibility } = await getProgressTabData(ORG, enrollment);

    expect(eligibility[0].eligibility.status).toBe("BLOCKED");
    expect(eligibility[0].eligibility.isEligible).toBe(false);
  });

  it("returns empty results without querying when there is no enrollment", async () => {
    const result = await getProgressTabData(ORG, null);
    expect(result).toEqual({ levelSubjects: [], eligibility: [] });
    expect(getLevelSubjectsByLevelMock).not.toHaveBeenCalled();
    expect(evaluateEligibilityForAllSubjectsMock).not.toHaveBeenCalled();
  });

  it("returns empty results when neither currentLevelId nor courseLevelId is set", async () => {
    const enrollment = makeEnrollment({ courseLevelId: null, currentLevelId: null });
    const result = await getProgressTabData(ORG, enrollment);
    expect(result).toEqual({ levelSubjects: [], eligibility: [] });
    expect(getLevelSubjectsByLevelMock).not.toHaveBeenCalled();
  });
});
