import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAttendanceRecordFindMany = vi.fn();
const mockAttendanceRecordCount = vi.fn();
const mockStudentTimelineEventFindFirst = vi.fn();

vi.mock("@/server/db", () => ({
  getDb: async () => ({
    attendanceRecord: {
      findMany: mockAttendanceRecordFindMany,
      count: mockAttendanceRecordCount,
    },
    studentTimelineEvent: { findFirst: mockStudentTimelineEventFindFirst },
  }),
}));

import {
  findAttendanceRecordsByStudent,
  findLastActivityAt,
} from "../repositories/student-360.repository";

const ORG = "org-1";
const STUDENT = "student-1";

beforeEach(() => vi.clearAllMocks());

describe("findAttendanceRecordsByStudent", () => {
  it("scopes the query by both studentId and organizationId", async () => {
    mockAttendanceRecordFindMany.mockResolvedValue([]);
    mockAttendanceRecordCount.mockResolvedValue(0);

    await findAttendanceRecordsByStudent(STUDENT, ORG, { page: 1, pageSize: 10 });

    const where = mockAttendanceRecordFindMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ studentId: STUDENT, organizationId: ORG, deletedAt: null });
    expect(mockAttendanceRecordCount.mock.calls[0][0].where).toMatchObject({
      studentId: STUDENT,
      organizationId: ORG,
    });
  });

  it("computes skip/take from the page and pageSize", async () => {
    mockAttendanceRecordFindMany.mockResolvedValue([]);
    mockAttendanceRecordCount.mockResolvedValue(0);

    await findAttendanceRecordsByStudent(STUDENT, ORG, { page: 3, pageSize: 10 });

    const callArgs = mockAttendanceRecordFindMany.mock.calls[0][0];
    expect(callArgs.skip).toBe(20);
    expect(callArgs.take).toBe(10);
  });

  it("maps raw rows into flat AttendanceRecordRow objects", async () => {
    mockAttendanceRecordFindMany.mockResolvedValue([
      {
        id: "rec-1",
        status: "ABSENT",
        notes: "chegou atrasado",
        attendanceSession: {
          sessionDate: new Date("2026-06-01"),
          subject: { name: "Matemática" },
          classGroup: { name: "Turma A" },
          teacher: { firstName: "Ana", lastName: "Silva" },
        },
      },
    ]);
    mockAttendanceRecordCount.mockResolvedValue(1);

    const result = await findAttendanceRecordsByStudent(STUDENT, ORG, { page: 1, pageSize: 10 });

    expect(result.data[0]).toEqual({
      id: "rec-1",
      sessionDate: new Date("2026-06-01"),
      subjectName: "Matemática",
      classGroupName: "Turma A",
      status: "ABSENT",
      teacherName: "Ana Silva",
      notes: "chegou atrasado",
    });
    expect(result.total).toBe(1);
  });

  it("returns null teacherName when no teacher is assigned to the session", async () => {
    mockAttendanceRecordFindMany.mockResolvedValue([
      {
        id: "rec-2",
        status: "PRESENT",
        notes: null,
        attendanceSession: {
          sessionDate: new Date("2026-06-02"),
          subject: { name: "Física" },
          classGroup: { name: "Turma B" },
          teacher: null,
        },
      },
    ]);
    mockAttendanceRecordCount.mockResolvedValue(1);

    const result = await findAttendanceRecordsByStudent(STUDENT, ORG, { page: 1, pageSize: 10 });
    expect(result.data[0].teacherName).toBeNull();
  });
});

// findLevelProgressByStudent / findCourseProgressByStudent moved to the prerequisites
// module (M1) and are covered by its repository tests.

describe("findLastActivityAt", () => {
  it("scopes the query by studentId and organizationId, never trusting studentId alone", async () => {
    mockStudentTimelineEventFindFirst.mockResolvedValue(null);
    await findLastActivityAt(STUDENT, ORG);
    expect(mockStudentTimelineEventFindFirst.mock.calls[0][0].where).toMatchObject({
      studentId: STUDENT,
      organizationId: ORG,
      deletedAt: null,
    });
  });

  it("returns null when the student has no timeline events", async () => {
    mockStudentTimelineEventFindFirst.mockResolvedValue(null);
    const result = await findLastActivityAt(STUDENT, ORG);
    expect(result).toBeNull();
  });

  it("returns the occurredAt of the most recent event", async () => {
    const occurredAt = new Date("2026-06-15");
    mockStudentTimelineEventFindFirst.mockResolvedValue({ occurredAt });
    const result = await findLastActivityAt(STUDENT, ORG);
    expect(result).toEqual(occurredAt);
  });
});
