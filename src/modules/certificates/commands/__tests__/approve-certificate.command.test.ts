import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, seed, type FakeDb } from "../../repositories/__tests__/_fake-db";

// =============================================================================
// ApproveCertificateCommand — approval-provenance tests
// -----------------------------------------------------------------------------
// Records the `certificate.approved` provenance event for a PENDING_APPROVAL
// certificate so it becomes issuable. Real repositories + audit run against the
// fake DB; RBAC and the event publisher are mocked. The decisive test is the
// end-to-end one: approve → issue succeeds (previously a dead-end, because nothing
// created the approval event the issue gate requires).
// =============================================================================

const h = vi.hoisted(() => ({ db: null as unknown as FakeDb }));
const authState = vi.hoisted(() => ({ allow: true, checked: [] as string[] }));
const published = vi.hoisted(() => ({ events: [] as Array<Record<string, unknown>> }));

vi.mock("@/server/db", () => ({ getDb: vi.fn(async () => h.db) }));
vi.mock("@/server/auth/rbac", () => ({
  getUserPermissions: vi.fn(async () => new Set<string>()),
  createAbility: () => ({
    can: (perm: string) => {
      authState.checked.push(perm);
      return authState.allow;
    },
  }),
}));
vi.mock("@/server/events/event-publisher", () => ({
  eventPublisher: { publish: vi.fn(async (e: Record<string, unknown>) => void published.events.push(e)) },
}));
vi.mock("@/modules/certificates/lib/certificate-number", () => ({
  allocateCertificateNumber: vi.fn(async () => "CERT-2026-000001"),
}));

import { AuthorizationError, BusinessRuleError, NotFoundError } from "@/shared/lib/command";
import type { ServiceContext } from "@/shared/types/common";
import { ApproveCertificateCommand } from "../approve-certificate.command";
import { IssueCertificateCommand } from "../issue-certificate.command";

const ORG = "org-A";
const OTHER_ORG = "org-B";
const ctx: ServiceContext = { userId: "approver-1", organizationId: ORG };
const store = (name: string) => h.db[name].__store;
const approvalEvents = () =>
  store("certificateEvent").filter((e) => (e as { eventType: string }).eventType === "certificate.approved");

function seedIssuedTranscript(): void {
  seed(h.db, "academicTranscript", {
    id: "tr-1", organizationId: ORG, studentId: "stu-1", courseId: "course-1",
    transcriptType: "COURSE_TRANSCRIPT", transcriptNumber: "TR-2026-000001",
  });
  seed(h.db, "academicTranscriptVersion", {
    id: "ver-1", organizationId: ORG, transcriptId: "tr-1", status: "ISSUED",
    checksum: "chk-1", issuedAt: new Date("2026-07-01T00:00:00.000Z"), issuedBy: "user-1",
    studentSnapshot: JSON.stringify({ studentId: "stu-1", fullName: "João Silva" }),
    courseSnapshot: JSON.stringify({ course: { courseId: "course-1" }, courseProgress: { status: "COMPLETED" } }),
  });
}

function seedCertificate(overrides: Record<string, unknown> = {}): void {
  seed(h.db, "certificate", {
    id: "cert-1", organizationId: ORG, studentId: "stu-1", enrollmentId: "enr-1", courseId: "course-1",
    transcriptVersionId: "ver-1", transcriptNumber: "TR-2026-000001", transcriptChecksum: "chk-1",
    certificatePolicyId: "pol-1", certificateTemplateId: null, certificateNumber: null,
    certificateType: "COURSE_COMPLETION", status: "PENDING_APPROVAL",
    studentSnapshot: JSON.stringify({ studentId: "stu-1", fullName: "João Silva" }),
    courseSnapshot: JSON.stringify({ courseId: "course-1", enrollmentId: "enr-1" }),
    issueBasisSnapshot: JSON.stringify({ transcriptVersionId: "ver-1", certificateType: "COURSE_COMPLETION" }),
    financialClearanceStatus: "NOT_REQUIRED", financialClearanceCheckedAt: null, financialClearanceReference: null,
    verificationCode: null, verificationUrl: null, checksum: null, issuedAt: null, issuedBy: null,
    expiresAt: null, deletedAt: null, ...overrides,
  });
}

const approve = (certificateId = "cert-1", context: ServiceContext = ctx, reason?: string) =>
  new ApproveCertificateCommand({ certificateId, reason }, context).run();

beforeEach(() => {
  vi.clearAllMocks();
  h.db = makeFakeDb();
  authState.allow = true;
  authState.checked.length = 0;
  published.events.length = 0;
});
afterEach(() => vi.restoreAllMocks());

describe("ApproveCertificateCommand — happy path", () => {
  it("records a certificate.approved provenance event without changing status", async () => {
    seedCertificate();
    const result = await approve();
    expect(result.status).toBe("PENDING_APPROVAL"); // approval is not a lifecycle transition
    expect(result.approvedBy).toBe("approver-1");
    expect((store("certificate")[0] as { status: string }).status).toBe("PENDING_APPROVAL");
    const events = approvalEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      certificateId: "cert-1",
      eventType: "certificate.approved",
      actorId: "approver-1",
    });
  });

  it("authorizes with certificates.generate", async () => {
    seedCertificate();
    await approve();
    expect(authState.checked).toContain("certificates.generate");
  });

  it("does not publish a bus event (approval is audit/provenance only)", async () => {
    seedCertificate();
    await approve();
    expect(published.events).toHaveLength(0);
  });
});

describe("ApproveCertificateCommand — end-to-end (the fix)", () => {
  it("a PENDING_APPROVAL certificate can be issued AFTER approval", async () => {
    seedIssuedTranscript();
    seedCertificate();

    // Before approval: issue must be refused (no approval provenance).
    await expect(new IssueCertificateCommand({ certificateId: "cert-1" }, ctx).run()).rejects.toBeInstanceOf(
      BusinessRuleError
    );

    // Approve, then issue succeeds.
    await approve();
    const issued = await new IssueCertificateCommand({ certificateId: "cert-1" }, ctx).run();
    expect(issued.status).toBe("ISSUED");
    expect((store("certificate")[0] as { status: string }).status).toBe("ISSUED");
  });
});

describe("ApproveCertificateCommand — guards", () => {
  it("refuses a non-PENDING_APPROVAL certificate (DRAFT)", async () => {
    seedCertificate({ status: "DRAFT" });
    await expect(approve()).rejects.toBeInstanceOf(BusinessRuleError);
    expect(approvalEvents()).toHaveLength(0);
  });

  it("refuses a double approval (idempotent)", async () => {
    seedCertificate();
    await approve();
    await expect(approve()).rejects.toBeInstanceOf(BusinessRuleError);
    expect(approvalEvents()).toHaveLength(1); // no second event written
  });

  it("throws NotFound for an unknown / cross-tenant certificate", async () => {
    seedCertificate();
    await expect(approve("cert-1", { userId: "u-2", organizationId: OTHER_ORG })).rejects.toBeInstanceOf(
      NotFoundError
    );
    await expect(approve("missing")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("denies without certificates.generate", async () => {
    seedCertificate();
    authState.allow = false;
    await expect(approve()).rejects.toBeInstanceOf(AuthorizationError);
  });
});
