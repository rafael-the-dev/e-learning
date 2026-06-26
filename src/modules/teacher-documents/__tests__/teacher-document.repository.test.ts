import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFindMany = vi.fn();
const mockFindFirst = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockCount = vi.fn();

vi.mock("@/server/db", () => ({
  getDb: async () => ({
    teacherDocument: {
      findMany: mockFindMany,
      findFirst: mockFindFirst,
      create: mockCreate,
      update: mockUpdate,
      count: mockCount,
    },
  }),
}));

import {
  findDocumentsByTeacher,
  findDocumentByIdInOrganization,
  createTeacherDocument,
  softDeleteTeacherDocument,
  countDocumentsByTeacher,
} from "../repositories/teacher-document.repository";

const ORG = "org-1";
const OTHER_ORG = "org-2";
const TEACHER = "teacher-1";

beforeEach(() => vi.clearAllMocks());

describe("findDocumentsByTeacher", () => {
  it("scopes the query by teacherId, organizationId and excludes soft-deleted rows", async () => {
    mockFindMany.mockResolvedValue([]);
    await findDocumentsByTeacher(TEACHER, ORG);
    expect(mockFindMany.mock.calls[0][0].where).toEqual({
      teacherId: TEACHER,
      organizationId: ORG,
      deletedAt: null,
    });
  });
});

describe("findDocumentByIdInOrganization", () => {
  it("never returns a document belonging to a different organization", async () => {
    mockFindFirst.mockImplementation(async ({ where }) => {
      return where.organizationId === ORG ? { id: "doc-1", organizationId: ORG } : null;
    });

    const ownOrgResult = await findDocumentByIdInOrganization("doc-1", ORG);
    const crossTenantResult = await findDocumentByIdInOrganization("doc-1", OTHER_ORG);

    expect(ownOrgResult).not.toBeNull();
    expect(crossTenantResult).toBeNull();
  });
});

describe("countDocumentsByTeacher", () => {
  it("scopes the count by teacherId, organizationId and excludes soft-deleted rows", async () => {
    mockCount.mockResolvedValue(3);
    const result = await countDocumentsByTeacher(TEACHER, ORG);
    expect(mockCount.mock.calls[0][0].where).toEqual({
      teacherId: TEACHER,
      organizationId: ORG,
      deletedAt: null,
    });
    expect(result).toBe(3);
  });
});

describe("createTeacherDocument", () => {
  it("stores the uploader and organization scope", async () => {
    mockCreate.mockResolvedValue({
      id: "doc-1",
      organizationId: ORG,
      teacherId: TEACHER,
      type: "CONTRACT",
      name: "contrato.pdf",
      url: "https://example.com/contrato.pdf",
      mimeType: null,
      size: null,
      uploadedById: "user-1",
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    });

    await createTeacherDocument({
      organizationId: ORG,
      teacherId: TEACHER,
      type: "CONTRACT",
      name: "contrato.pdf",
      url: "https://example.com/contrato.pdf",
      uploadedById: "user-1",
    });

    expect(mockCreate.mock.calls[0][0].data).toMatchObject({
      organizationId: ORG,
      teacherId: TEACHER,
      uploadedById: "user-1",
    });
  });
});

describe("softDeleteTeacherDocument", () => {
  it("scopes the soft-delete by id and organizationId", async () => {
    mockUpdate.mockResolvedValue({});
    await softDeleteTeacherDocument("doc-1", ORG);
    const call = mockUpdate.mock.calls[0][0];
    expect(call.where).toEqual({ id: "doc-1", organizationId: ORG });
    expect(call.data.deletedAt).toBeInstanceOf(Date);
  });
});
