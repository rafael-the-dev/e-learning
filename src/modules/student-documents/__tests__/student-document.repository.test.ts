import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFindMany = vi.fn();
const mockFindFirst = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockCount = vi.fn();

vi.mock("@/server/db", () => ({
  getDb: async () => ({
    studentDocument: {
      findMany: mockFindMany,
      findFirst: mockFindFirst,
      create: mockCreate,
      update: mockUpdate,
      count: mockCount,
    },
  }),
}));

import {
  findDocumentsByStudent,
  findDocumentByIdInOrganization,
  createStudentDocument,
  verifyStudentDocument,
  softDeleteStudentDocument,
} from "../repositories/student-document.repository";

const ORG = "org-1";
const OTHER_ORG = "org-2";
const STUDENT = "student-1";

beforeEach(() => vi.clearAllMocks());

describe("findDocumentsByStudent", () => {
  it("scopes the query by studentId, organizationId and excludes soft-deleted rows", async () => {
    mockFindMany.mockResolvedValue([]);
    await findDocumentsByStudent(STUDENT, ORG);
    expect(mockFindMany.mock.calls[0][0].where).toEqual({
      studentId: STUDENT,
      organizationId: ORG,
      deletedAt: null,
    });
  });
});

describe("findDocumentByIdInOrganization", () => {
  it("never returns a document belonging to a different organization", async () => {
    // Simulates the DB correctly filtering out cross-tenant rows.
    mockFindFirst.mockImplementation(async ({ where }) => {
      return where.organizationId === ORG ? { id: "doc-1", organizationId: ORG } : null;
    });

    const ownOrgResult = await findDocumentByIdInOrganization("doc-1", ORG);
    const crossTenantResult = await findDocumentByIdInOrganization("doc-1", OTHER_ORG);

    expect(ownOrgResult).not.toBeNull();
    expect(crossTenantResult).toBeNull();
  });
});

describe("createStudentDocument", () => {
  it("defaults status to PENDING and stores the uploader", async () => {
    mockCreate.mockResolvedValue({
      id: "doc-1",
      organizationId: ORG,
      studentId: STUDENT,
      documentType: "IDENTIFICATION",
      fileName: "bi.pdf",
      fileUrl: "https://example.com/bi.pdf",
      fileSize: null,
      status: "PENDING",
      notes: null,
      uploadedBy: "user-1",
      verifiedBy: null,
      verifiedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    });

    await createStudentDocument({
      organizationId: ORG,
      studentId: STUDENT,
      documentType: "IDENTIFICATION",
      fileName: "bi.pdf",
      fileUrl: "https://example.com/bi.pdf",
      uploadedBy: "user-1",
    });

    expect(mockCreate.mock.calls[0][0].data).toMatchObject({
      organizationId: ORG,
      studentId: STUDENT,
      status: "PENDING",
      uploadedBy: "user-1",
    });
  });
});

describe("verifyStudentDocument", () => {
  it("scopes the update by id and organizationId, and stamps verifiedAt/verifiedBy", async () => {
    mockUpdate.mockResolvedValue({
      id: "doc-1",
      organizationId: ORG,
      studentId: STUDENT,
      documentType: "OTHER",
      fileName: "x.pdf",
      fileUrl: "https://x",
      fileSize: null,
      status: "VERIFIED",
      notes: null,
      uploadedBy: "user-1",
      verifiedBy: "user-2",
      verifiedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    });

    await verifyStudentDocument("doc-1", ORG, { status: "VERIFIED", verifiedBy: "user-2" });

    const call = mockUpdate.mock.calls[0][0];
    expect(call.where).toEqual({ id: "doc-1", organizationId: ORG });
    expect(call.data.status).toBe("VERIFIED");
    expect(call.data.verifiedBy).toBe("user-2");
    expect(call.data.verifiedAt).toBeInstanceOf(Date);
  });
});

describe("softDeleteStudentDocument", () => {
  it("scopes the soft-delete by id and organizationId", async () => {
    mockUpdate.mockResolvedValue({});
    await softDeleteStudentDocument("doc-1", ORG);
    const call = mockUpdate.mock.calls[0][0];
    expect(call.where).toEqual({ id: "doc-1", organizationId: ORG });
    expect(call.data.deletedAt).toBeInstanceOf(Date);
  });
});
