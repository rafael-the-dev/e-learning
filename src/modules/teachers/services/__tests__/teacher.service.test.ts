import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockFindTeacherByUserId } = vi.hoisted(() => ({ mockFindTeacherByUserId: vi.fn() }));

vi.mock("@/modules/teachers/repositories/teacher.repository", () => ({
  findManyByOrganization: vi.fn(),
  findByIdInOrganization: vi.fn(),
  findByIdWithSubjects: vi.fn(),
  findTeacherByUserId: mockFindTeacherByUserId,
  countByStatus: vi.fn(),
  listActiveBranches: vi.fn(),
  listLinkableTeacherUsers: vi.fn(),
}));

import { getTeacherByUserId } from "../teacher.service";

const ORG = "org-1";
const USER = "user-1";

beforeEach(() => vi.clearAllMocks());

describe("getTeacherByUserId", () => {
  it("resolves the teacher linked to the given userId within the organization", async () => {
    const teacher = { id: "teacher-1", userId: USER, organizationId: ORG };
    mockFindTeacherByUserId.mockResolvedValue(teacher);

    const result = await getTeacherByUserId(ORG, USER);

    expect(mockFindTeacherByUserId).toHaveBeenCalledWith(ORG, USER);
    expect(result).toEqual(teacher);
  });

  it("returns null (not an error) when the current user has no linked Teacher profile", async () => {
    mockFindTeacherByUserId.mockResolvedValue(null);

    const result = await getTeacherByUserId(ORG, USER);

    expect(result).toBeNull();
  });

  it("never resolves a teacher linked to the same userId in a different organization", async () => {
    // The repository scopes by organizationId in its WHERE clause — this test
    // documents that getTeacherByUserId passes organizationId through
    // unmodified rather than e.g. only filtering by userId.
    mockFindTeacherByUserId.mockResolvedValue(null);

    await getTeacherByUserId("org-2", USER);

    expect(mockFindTeacherByUserId).toHaveBeenCalledWith("org-2", USER);
  });
});
