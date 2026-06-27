import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAttendanceSessionFindMany = vi.fn();
const mockAssessmentFindMany = vi.fn();
const mockAssessmentResultFindMany = vi.fn();
const mockAttendanceRecordFindMany = vi.fn();
const mockSubjectFindMany = vi.fn();

vi.mock("@/server/db", () => ({
  getDb: async () => ({
    attendanceSession: { findMany: mockAttendanceSessionFindMany },
    assessment: { findMany: mockAssessmentFindMany },
    assessmentResult: { findMany: mockAssessmentResultFindMany },
    attendanceRecord: { findMany: mockAttendanceRecordFindMany },
    subject: { findMany: mockSubjectFindMany },
  }),
}));

import {
  findStudentUpcomingClasses,
  findStudentAssessments,
  findStudentPublishedGrades,
  findStudentAttendanceForStats,
  findSubjectNamesByIds,
} from "../repositories/student-portal.repository";

const ORG = "org-1";
const STUDENT = "student-1";
const GROUPS = ["cg-1", "cg-2"];
const FROM = new Date("2026-06-26T00:00:00");
const TO = new Date("2026-07-03T00:00:00");

beforeEach(() => vi.clearAllMocks());

describe("findStudentUpcomingClasses", () => {
  it("returns [] without querying when the student has no active class groups", async () => {
    const result = await findStudentUpcomingClasses(ORG, [], FROM, TO, 20);
    expect(result).toEqual([]);
    expect(mockAttendanceSessionFindMany).not.toHaveBeenCalled();
  });

  it("scopes to org + the student's own class groups, the date window, and excludes CANCELLED/ARCHIVED", async () => {
    mockAttendanceSessionFindMany.mockResolvedValue([]);
    await findStudentUpcomingClasses(ORG, GROUPS, FROM, TO, 20);
    const where = mockAttendanceSessionFindMany.mock.calls[0][0].where;
    expect(where).toMatchObject({
      organizationId: ORG,
      classGroupId: { in: GROUPS },
      deletedAt: null,
      status: { notIn: ["CANCELLED", "ARCHIVED"] },
    });
    expect(where.sessionDate).toEqual({ gte: FROM, lte: TO });
  });

  it("applies the top-N limit", async () => {
    mockAttendanceSessionFindMany.mockResolvedValue([]);
    await findStudentUpcomingClasses(ORG, GROUPS, FROM, TO, 5);
    expect(mockAttendanceSessionFindMany.mock.calls[0][0].take).toBe(5);
  });
});

describe("findStudentAssessments — published-grade masking", () => {
  it("scopes to the student's class groups and excludes DRAFT/CANCELLED/ARCHIVED assessments", async () => {
    mockAssessmentFindMany.mockResolvedValue([]);
    await findStudentAssessments(ORG, GROUPS, STUDENT, 12);
    const where = mockAssessmentFindMany.mock.calls[0][0].where;
    expect(where).toMatchObject({
      organizationId: ORG,
      classGroupId: { in: GROUPS },
      status: { in: ["SCHEDULED", "OPEN", "GRADED"] },
    });
  });

  it("fetches ONLY the current student's own result row", async () => {
    mockAssessmentFindMany.mockResolvedValue([]);
    await findStudentAssessments(ORG, GROUPS, STUDENT, 12);
    const select = mockAssessmentFindMany.mock.calls[0][0].select;
    expect(select.results.where).toMatchObject({ studentId: STUDENT, deletedAt: null });
  });

  it("exposes the score when results are PUBLISHED", async () => {
    mockAssessmentFindMany.mockResolvedValue([
      {
        id: "a1",
        title: "Teste 1",
        subjectId: "subj-1",
        assessmentDate: new Date("2026-06-20"),
        status: "GRADED",
        maxScore: 20,
        publication: { publicationStatus: "PUBLISHED" },
        results: [{ score: 16 }],
      },
    ]);
    const rows = await findStudentAssessments(ORG, GROUPS, STUDENT, 12);
    expect(rows[0]).toMatchObject({ isPublished: true, score: 16, maxScore: 20 });
  });

  it("MASKS the score (null) when the assessment is not published, even if a result row exists", async () => {
    mockAssessmentFindMany.mockResolvedValue([
      {
        id: "a1",
        title: "Teste 1",
        subjectId: "subj-1",
        assessmentDate: new Date("2026-06-20"),
        status: "GRADED",
        maxScore: 20,
        publication: { publicationStatus: "READY" }, // graded but NOT published
        results: [{ score: 16 }],
      },
    ]);
    const rows = await findStudentAssessments(ORG, GROUPS, STUDENT, 12);
    expect(rows[0]).toMatchObject({ isPublished: false, score: null });
  });

  it("treats a missing publication as unpublished (score masked)", async () => {
    mockAssessmentFindMany.mockResolvedValue([
      {
        id: "a1",
        title: "Teste 1",
        subjectId: "subj-1",
        assessmentDate: new Date("2026-06-20"),
        status: "OPEN",
        maxScore: 20,
        publication: null,
        results: [{ score: 16 }],
      },
    ]);
    const rows = await findStudentAssessments(ORG, GROUPS, STUDENT, 12);
    expect(rows[0]).toMatchObject({ isPublished: false, score: null });
  });
});

describe("findStudentPublishedGrades", () => {
  it("scopes to org + studentId and filters to PUBLISHED publications only", async () => {
    mockAssessmentResultFindMany.mockResolvedValue([]);
    await findStudentPublishedGrades(ORG, STUDENT, 15);
    const where = mockAssessmentResultFindMany.mock.calls[0][0].where;
    expect(where).toMatchObject({
      organizationId: ORG,
      studentId: STUDENT,
      deletedAt: null,
      assessment: { publication: { publicationStatus: "PUBLISHED" } },
    });
  });

  it("applies the top-N limit and sorts newest-published first", async () => {
    mockAssessmentResultFindMany.mockResolvedValue([
      {
        id: "r-old",
        score: 10,
        status: "GRADED",
        assessment: { title: "T1", subjectId: "s1", maxScore: 20, publication: { publishedAt: new Date("2026-05-01") } },
      },
      {
        id: "r-new",
        score: 18,
        status: "GRADED",
        assessment: { title: "T2", subjectId: "s1", maxScore: 20, publication: { publishedAt: new Date("2026-06-01") } },
      },
    ]);
    const rows = await findStudentPublishedGrades(ORG, STUDENT, 15);
    expect(mockAssessmentResultFindMany.mock.calls[0][0].take).toBe(15);
    expect(rows.map((r) => r.id)).toEqual(["r-new", "r-old"]);
  });
});

describe("findSubjectNamesByIds", () => {
  it("returns an empty map without querying when given no ids", async () => {
    const map = await findSubjectNamesByIds(ORG, []);
    expect(map.size).toBe(0);
    expect(mockSubjectFindMany).not.toHaveBeenCalled();
  });

  it("re-asserts organizationId on the lookup (tenant-bound on its own)", async () => {
    mockSubjectFindMany.mockResolvedValue([{ id: "s1", name: "Matemática" }]);
    const map = await findSubjectNamesByIds(ORG, ["s1"]);
    expect(mockSubjectFindMany.mock.calls[0][0].where).toMatchObject({ organizationId: ORG, id: { in: ["s1"] } });
    expect(map.get("s1")).toBe("Matemática");
  });
});

// ── Cross-student isolation — Student A must never see Student B's data ───────
describe("cross-student isolation (student A cannot see student B's data)", () => {
  const A = "student-A";
  const B = "student-B";

  beforeEach(() => {
    mockAssessmentFindMany.mockResolvedValue([]);
    mockAssessmentResultFindMany.mockResolvedValue([]);
    mockAttendanceRecordFindMany.mockResolvedValue([]);
  });

  it("A's assessment result lookup is bound to studentId=A, never B", async () => {
    await findStudentAssessments(ORG, GROUPS, A, 12);
    const resultsWhere = mockAssessmentFindMany.mock.calls[0][0].select.results.where;
    expect(resultsWhere.studentId).toBe(A);
    expect(resultsWhere.studentId).not.toBe(B);
  });

  it("A's published grades are bound to studentId=A", async () => {
    await findStudentPublishedGrades(ORG, A, 15);
    expect(mockAssessmentResultFindMany.mock.calls[0][0].where.studentId).toBe(A);
  });

  it("A's attendance stats are bound to studentId=A", async () => {
    await findStudentAttendanceForStats(ORG, A);
    expect(mockAttendanceRecordFindMany.mock.calls[0][0].where).toMatchObject({ studentId: A, organizationId: ORG });
  });
});
