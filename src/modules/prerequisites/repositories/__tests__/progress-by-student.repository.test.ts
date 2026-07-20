import { describe, it, expect, vi, beforeEach } from "vitest";

const mockLevelFindMany = vi.fn();
const mockCourseFindMany = vi.fn();

vi.mock("@/server/db", () => ({
  getDb: async () => ({
    studentLevelProgress: { findMany: mockLevelFindMany },
    studentCourseProgress: { findMany: mockCourseFindMany },
  }),
}));

import { findLevelProgressByStudent } from "../student-level-progress.repository";
import { findCourseProgressByStudent } from "../student-course-progress.repository";

const ORG = "org-1";
const STUDENT = "student-1";

beforeEach(() => vi.clearAllMocks());

// M1: these student-level academic reads are OWNED by the prerequisites module (moved out
// of the Student 360 repository, which must not query these tables).
describe("findLevelProgressByStudent", () => {
  it("scopes the query by studentId and organizationId, ordered by level", async () => {
    mockLevelFindMany.mockResolvedValue([]);
    await findLevelProgressByStudent(STUDENT, ORG);
    const args = mockLevelFindMany.mock.calls[0][0];
    expect(args.where).toEqual({ studentId: STUDENT, organizationId: ORG });
    expect(args.orderBy).toEqual({ courseLevel: { order: "asc" } });
  });

  it("maps finalGrade (Decimal) to a number and surfaces the level name/order", async () => {
    mockLevelFindMany.mockResolvedValue([
      {
        id: "lp-1", organizationId: ORG, enrollmentId: "enr-1", studentId: STUDENT,
        courseId: "c-1", courseLevelId: "cl-1", finalGrade: "84.5", earnedCredits: 10,
        status: "PASSED", progressReason: null, completedAt: null, calculatedAt: null,
        createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-01"),
        courseLevel: { name: "Nível 1", order: 1 },
      },
    ]);
    const rows = await findLevelProgressByStudent(STUDENT, ORG);
    expect(rows[0].finalGrade).toBe(84.5);
    expect(rows[0].courseLevelName).toBe("Nível 1");
    expect(rows[0].courseLevelOrder).toBe(1);
  });
});

describe("findCourseProgressByStudent", () => {
  it("scopes the query by studentId and organizationId", async () => {
    mockCourseFindMany.mockResolvedValue([]);
    await findCourseProgressByStudent(STUDENT, ORG);
    expect(mockCourseFindMany.mock.calls[0][0].where).toEqual({ studentId: STUDENT, organizationId: ORG });
  });

  it("maps finalGrade to a number and surfaces the course name", async () => {
    mockCourseFindMany.mockResolvedValue([
      {
        id: "cp-1", organizationId: ORG, enrollmentId: "enr-1", studentId: STUDENT,
        courseId: "c-1", finalGrade: "73.0", earnedCredits: 30, status: "IN_PROGRESS",
        progressReason: null, completedAt: null, calculatedAt: null,
        createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-01"),
        course: { name: "Curso A" },
      },
    ]);
    const rows = await findCourseProgressByStudent(STUDENT, ORG);
    expect(rows[0].finalGrade).toBe(73);
    expect(rows[0].courseName).toBe("Curso A");
  });
});
