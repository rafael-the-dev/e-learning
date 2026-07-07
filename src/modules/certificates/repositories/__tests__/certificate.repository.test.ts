import { describe, expect, it } from "vitest";
import { asClient, makeFakeDb, seed, type FakeDb } from "./_fake-db";
import {
  createCertificate,
  findCertificateById,
  findCertificateByNumber,
  findCertificateByVerificationCode,
  findCertificateDetailById,
  findExistingActiveCertificate,
  listCertificates,
  markCertificateStale,
  softDeleteDraftCertificate,
  updateCertificateMetadata,
} from "../certificate.repository";

const ORG = "org-A";
const OTHER = "org-B";

const CREATE_BASE = {
  organizationId: ORG,
  studentId: "stu-1",
  transcriptVersionId: "ver-1",
  transcriptNumber: "TR-2026-000001",
  transcriptChecksum: "chk-1",
  certificateType: "COURSE_COMPLETION",
  studentSnapshot: '{"fullName":"João Silva"}',
  issueBasisSnapshot: '{"basis":"course completed"}',
};

/** Seed a certificate row directly (bypasses create defaults). */
function seedCert(db: FakeDb, overrides: Record<string, unknown>): void {
  seed(db, "certificate", {
    organizationId: ORG,
    studentId: "stu-1",
    transcriptVersionId: "ver-1",
    transcriptNumber: "TR-1",
    transcriptChecksum: "chk-1",
    certificateType: "COURSE_COMPLETION",
    status: "DRAFT",
    studentSnapshot: "{}",
    issueBasisSnapshot: "{}",
    financialClearanceStatus: "NOT_REQUIRED",
    deletedAt: null,
    ...overrides,
  });
}

describe("certificate repository", () => {
  it("16. creates a certificate with copied snapshot pointers", async () => {
    const db = makeFakeDb();
    const rec = await createCertificate({ ...CREATE_BASE, status: "DRAFT" }, asClient(db));
    expect(rec.transcriptVersionId).toBe("ver-1");
    expect(rec.transcriptNumber).toBe("TR-2026-000001");
    expect(rec.status).toBe("DRAFT");
    expect(rec.certificateNumber).toBeNull();
  });

  it("17. finds a certificate by number (org-scoped, not deleted)", async () => {
    const db = makeFakeDb();
    seedCert(db, { id: "c1", certificateNumber: "CERT-2026-000001", status: "ISSUED" });
    const rec = await findCertificateByNumber({ organizationId: ORG, certificateNumber: "CERT-2026-000001" }, asClient(db));
    expect(rec?.id).toBe("c1");
    expect(await findCertificateByNumber({ organizationId: OTHER, certificateNumber: "CERT-2026-000001" }, asClient(db))).toBeNull();
  });

  it("18. finds a certificate by verification code (org-scoped)", async () => {
    const db = makeFakeDb();
    seedCert(db, { id: "c1", verificationCode: "vc-abc", status: "ISSUED" });
    const rec = await findCertificateByVerificationCode({ organizationId: ORG, verificationCode: "vc-abc" }, asClient(db));
    expect(rec?.id).toBe("c1");
  });

  it("19. findExistingActiveCertificate excludes REVOKED and STALE", async () => {
    const db = makeFakeDb();
    seedCert(db, { id: "revoked", transcriptVersionId: "ver-X", certificateType: "COURSE_COMPLETION", status: "REVOKED" });
    seedCert(db, { id: "stale", transcriptVersionId: "ver-X", certificateType: "COURSE_COMPLETION", status: "STALE" });
    // no active one yet
    expect(
      await findExistingActiveCertificate({ organizationId: ORG, transcriptVersionId: "ver-X", certificateType: "COURSE_COMPLETION" }, asClient(db))
    ).toBeNull();
    // an ISSUED one IS active
    seedCert(db, { id: "issued", transcriptVersionId: "ver-X", certificateType: "COURSE_COMPLETION", status: "ISSUED" });
    const active = await findExistingActiveCertificate(
      { organizationId: ORG, transcriptVersionId: "ver-X", certificateType: "COURSE_COMPLETION" },
      asClient(db)
    );
    expect(active?.id).toBe("issued");
  });

  it("20. update metadata is tenant-scoped", async () => {
    const db = makeFakeDb();
    seedCert(db, { id: "c1", organizationId: OTHER, status: "DRAFT" });
    const res = await updateCertificateMetadata({ id: "c1", organizationId: ORG, status: "ISSUED" }, asClient(db));
    expect(res.count).toBe(0);
    // an in-org update sets the columns it is given
    seedCert(db, { id: "c2", status: "DRAFT" });
    const ok = await updateCertificateMetadata(
      { id: "c2", organizationId: ORG, status: "ISSUED", certificateNumber: "CERT-2026-000009", checksum: "sum-9" },
      asClient(db)
    );
    expect(ok.count).toBe(1);
    const after = await findCertificateById({ id: "c2", organizationId: ORG }, asClient(db));
    expect(after?.status).toBe("ISSUED");
    expect(after?.certificateNumber).toBe("CERT-2026-000009");
    expect(after?.checksum).toBe("sum-9");
  });

  it("21. softDeleteDraftCertificate affects only DRAFT rows", async () => {
    const db = makeFakeDb();
    seedCert(db, { id: "issued", status: "ISSUED" });
    seedCert(db, { id: "draft", status: "DRAFT" });
    expect((await softDeleteDraftCertificate({ id: "issued", organizationId: ORG }, asClient(db))).count).toBe(0);
    expect((await softDeleteDraftCertificate({ id: "draft", organizationId: ORG }, asClient(db))).count).toBe(1);
    expect(await listCertificates({ organizationId: ORG }, asClient(db))).toHaveLength(1); // only the issued one remains visible
  });

  it("markCertificateStale sets the stale trio, org-scoped", async () => {
    const db = makeFakeDb();
    seedCert(db, { id: "c1", status: "ISSUED" });
    const res = await markCertificateStale(
      { id: "c1", organizationId: ORG, staleReason: "TRANSCRIPT_SUPERSEDED", staleDetectedAt: new Date("2026-07-02T00:00:00.000Z") },
      asClient(db)
    );
    expect(res.count).toBe(1);
    const after = await findCertificateById({ id: "c1", organizationId: ORG }, asClient(db));
    expect(after?.status).toBe("STALE");
    expect(after?.staleReason).toBe("TRANSCRIPT_SUPERSEDED");
    expect(after?.staleDetectedAt).toEqual(new Date("2026-07-02T00:00:00.000Z"));
  });

  it("22. detail includes events, exports and the verification (all org-scoped)", async () => {
    const db = makeFakeDb();
    seedCert(db, { id: "c1", status: "ISSUED" });
    seed(db, "certificateEvent", { id: "e1", organizationId: ORG, certificateId: "c1", eventType: "certificate.issued", createdAt: new Date("2026-07-01T00:00:00.000Z") });
    seed(db, "certificateExport", { id: "x1", organizationId: ORG, certificateId: "c1", exportType: "PDF", status: "READY" });
    seed(db, "certificateVerification", { id: "v1", organizationId: ORG, certificateId: "c1", verificationCode: "vc-1", publicStatus: "VALID", verificationCount: 0 });
    // a foreign-org sibling that must NOT bleed in
    seed(db, "certificateEvent", { id: "e-other", organizationId: OTHER, certificateId: "c1", eventType: "certificate.issued" });

    const detail = await findCertificateDetailById({ id: "c1", organizationId: ORG }, asClient(db));
    expect(detail?.events.map((e) => e.id)).toEqual(["e1"]);
    expect(detail?.exports.map((e) => e.id)).toEqual(["x1"]);
    expect(detail?.verification?.id).toBe("v1");
    expect(await findCertificateDetailById({ id: "missing", organizationId: ORG }, asClient(db))).toBeNull();
  });

  it("find by id is tenant-scoped", async () => {
    const db = makeFakeDb();
    seedCert(db, { id: "c1", organizationId: OTHER });
    expect(await findCertificateById({ id: "c1", organizationId: ORG }, asClient(db))).toBeNull();
  });
});
