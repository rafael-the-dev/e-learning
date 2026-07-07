import { describe, expect, it } from "vitest";
import { asClient, makeFakeDb, seed } from "./_fake-db";
import {
  createCertificateRequest,
  findCertificateRequestById,
  listCertificateRequests,
  softDeleteCertificateRequest,
  updateCertificateRequestStatus,
} from "../certificate-request.repository";

const ORG = "org-A";
const OTHER = "org-B";

describe("certificate-request repository", () => {
  it("33. creates a request", async () => {
    const db = makeFakeDb();
    const rec = await createCertificateRequest(
      { organizationId: ORG, studentId: "stu-1", certificateType: "COURSE_COMPLETION", requestedBy: "user-1", status: "PENDING" },
      asClient(db)
    );
    expect(rec.status).toBe("PENDING");
    expect(rec.requestedBy).toBe("user-1");
    expect(await findCertificateRequestById({ id: rec.id, organizationId: ORG }, asClient(db))).not.toBeNull();
  });

  it("34. updates request status, tenant-scoped", async () => {
    const db = makeFakeDb();
    seed(db, "certificateRequest", { id: "r1", organizationId: OTHER, studentId: "stu-1", certificateType: "COURSE_COMPLETION", requestedBy: "u", status: "PENDING", deletedAt: null });
    expect((await updateCertificateRequestStatus({ id: "r1", organizationId: ORG, status: "APPROVED" }, asClient(db))).count).toBe(0);

    seed(db, "certificateRequest", { id: "r2", organizationId: ORG, studentId: "stu-1", certificateType: "COURSE_COMPLETION", requestedBy: "u", status: "PENDING", deletedAt: null });
    const res = await updateCertificateRequestStatus(
      { id: "r2", organizationId: ORG, status: "FULFILLED", reviewedBy: "admin-1", reviewedAt: new Date("2026-07-04T00:00:00.000Z"), fulfilledCertificateId: "cert-9" },
      asClient(db)
    );
    expect(res.count).toBe(1);
    const after = await findCertificateRequestById({ id: "r2", organizationId: ORG }, asClient(db));
    expect(after?.status).toBe("FULFILLED");
    expect(after?.fulfilledCertificateId).toBe("cert-9");
  });

  it("35. soft deletes a request (hidden from lists by default)", async () => {
    const db = makeFakeDb();
    seed(db, "certificateRequest", { id: "r1", organizationId: ORG, studentId: "stu-1", certificateType: "COURSE_COMPLETION", requestedBy: "u", status: "PENDING", deletedAt: null });
    expect((await softDeleteCertificateRequest({ id: "r1", organizationId: ORG }, asClient(db))).count).toBe(1);
    expect(await listCertificateRequests({ organizationId: ORG }, asClient(db))).toHaveLength(0);
    expect(await listCertificateRequests({ organizationId: ORG, includeDeleted: true }, asClient(db))).toHaveLength(1);
  });

  it("36. lists requests by status / student / type, org-scoped", async () => {
    const db = makeFakeDb();
    seed(db, "certificateRequest", { id: "a", organizationId: ORG, studentId: "stu-1", certificateType: "COURSE_COMPLETION", requestedBy: "u", status: "PENDING", deletedAt: null });
    seed(db, "certificateRequest", { id: "b", organizationId: ORG, studentId: "stu-2", certificateType: "ATTENDANCE", requestedBy: "u", status: "APPROVED", deletedAt: null });
    seed(db, "certificateRequest", { id: "c-other", organizationId: OTHER, studentId: "stu-1", certificateType: "COURSE_COMPLETION", requestedBy: "u", status: "PENDING", deletedAt: null });

    expect((await listCertificateRequests({ organizationId: ORG, status: "PENDING" }, asClient(db))).map((r) => r.id)).toEqual(["a"]);
    expect((await listCertificateRequests({ organizationId: ORG, studentId: "stu-2" }, asClient(db))).map((r) => r.id)).toEqual(["b"]);
    expect((await listCertificateRequests({ organizationId: ORG, certificateType: "ATTENDANCE" }, asClient(db))).map((r) => r.id)).toEqual(["b"]);
    expect(await listCertificateRequests({ organizationId: ORG }, asClient(db))).toHaveLength(2);
  });
});
