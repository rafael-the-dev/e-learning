import { describe, it, expect, vi, beforeEach } from "vitest";

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));

// getSessionFormOptions runs four findMany calls (academicYear, classGroup,
// teacher, classroom) against the same db mock; we only assert the classGroup one.
vi.mock("@/server/db", () => ({
  getDb: vi.fn().mockResolvedValue({
    academicYear: { findMany },
    classGroup: { findMany },
    teacher: { findMany },
    classroom: { findMany },
  }),
}));

import { getSessionFormOptions } from "../attendance.service";

beforeEach(() => {
  vi.clearAllMocks();
  findMany.mockResolvedValue([]);
});

function classGroupWhere() {
  // The classGroup query is the one whose `where` carries status: { in: [...] }.
  const call = findMany.mock.calls.find((c) => c[0]?.where?.status?.in);
  return call?.[0]?.where;
}

function teacherWhere() {
  // The teacher query selects firstName/lastName and filters status: "ACTIVE".
  const call = findMany.mock.calls.find(
    (c) => c[0]?.select?.firstName && c[0]?.where?.status === "ACTIVE"
  );
  return call?.[0]?.where;
}

describe("getSessionFormOptions — class-group dropdown scope", () => {
  it("is org-wide (no teacher filter) when no teacher scope is passed", async () => {
    await getSessionFormOptions("org-1");
    expect(classGroupWhere().teacherId).toBeUndefined();
  });

  it("restricts class groups to the teacher when teacher-scoped", async () => {
    await getSessionFormOptions("org-1", "teacher-A");
    expect(classGroupWhere().teacherId).toBe("teacher-A");
  });

  it("an unlinked teacher (sentinel id) matches no real class group", async () => {
    await getSessionFormOptions("org-1", "__none__");
    expect(classGroupWhere().teacherId).toBe("__none__");
  });
});

describe("getSessionFormOptions — assigned-teacher dropdown scope", () => {
  it("lists all org teachers when no teacher scope is passed", async () => {
    await getSessionFormOptions("org-1");
    expect(teacherWhere().id).toBeUndefined();
  });

  it("restricts the teacher dropdown to the teacher themselves when teacher-scoped", async () => {
    await getSessionFormOptions("org-1", "teacher-A");
    expect(teacherWhere().id).toBe("teacher-A");
  });

  it("an unlinked teacher (sentinel id) sees no teacher option", async () => {
    await getSessionFormOptions("org-1", "__none__");
    expect(teacherWhere().id).toBe("__none__");
  });
});
