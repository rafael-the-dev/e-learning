import { describe, expect, it } from "vitest";
import { asClient, makeFakeDb, seed } from "./_fake-db";
import {
  createCertificateVerification,
  findCertificateVerificationByCertificateId,
  findCertificateVerificationByCode,
  incrementVerificationCount,
  updateCertificateVerificationStatus,
} from "../certificate-verification.repository";

const ORG = "org-A";
const OTHER = "org-B";

describe("certificate-verification repository", () => {
  it("29. creates a verification projection row", async () => {
    const db = makeFakeDb();
    const rec = await createCertificateVerification(
      { organizationId: ORG, certificateId: "c1", verificationCode: "vc-1", publicStatus: "VALID" },
      asClient(db)
    );
    expect(rec.verificationCode).toBe("vc-1");
    expect(rec.publicStatus).toBe("VALID");
  });

  it("30. finds by code and by certificateId (org-scoped)", async () => {
    const db = makeFakeDb();
    seed(db, "certificateVerification", { id: "v1", organizationId: ORG, certificateId: "c1", verificationCode: "vc-1", publicStatus: "VALID", verificationCount: 0 });
    expect((await findCertificateVerificationByCode({ organizationId: ORG, verificationCode: "vc-1" }, asClient(db)))?.id).toBe("v1");
    expect((await findCertificateVerificationByCertificateId({ organizationId: ORG, certificateId: "c1" }, asClient(db)))?.id).toBe("v1");
    // scoped: wrong org sees nothing
    expect(await findCertificateVerificationByCode({ organizationId: OTHER, verificationCode: "vc-1" }, asClient(db))).toBeNull();
  });

  it("31. increments the verification count atomically", async () => {
    const db = makeFakeDb();
    seed(db, "certificateVerification", { id: "v1", organizationId: ORG, certificateId: "c1", verificationCode: "vc-1", publicStatus: "VALID", verificationCount: 0 });
    await incrementVerificationCount({ id: "v1", organizationId: ORG, lastVerifiedAt: new Date("2026-07-03T00:00:00.000Z") }, asClient(db));
    await incrementVerificationCount({ id: "v1", organizationId: ORG }, asClient(db));
    const after = await findCertificateVerificationByCertificateId({ organizationId: ORG, certificateId: "c1" }, asClient(db));
    expect(after?.verificationCount).toBe(2);
    expect(after?.lastVerifiedAt).toEqual(new Date("2026-07-03T00:00:00.000Z"));
  });

  it("32. updates publicStatus, tenant-scoped", async () => {
    const db = makeFakeDb();
    seed(db, "certificateVerification", { id: "v1", organizationId: OTHER, certificateId: "c1", verificationCode: "vc-1", publicStatus: "VALID", verificationCount: 0 });
    expect((await updateCertificateVerificationStatus({ id: "v1", organizationId: ORG, publicStatus: "REVOKED" }, asClient(db))).count).toBe(0);

    seed(db, "certificateVerification", { id: "v2", organizationId: ORG, certificateId: "c2", verificationCode: "vc-2", publicStatus: "VALID", verificationCount: 0 });
    expect((await updateCertificateVerificationStatus({ id: "v2", organizationId: ORG, publicStatus: "REVOKED" }, asClient(db))).count).toBe(1);
    const after = await findCertificateVerificationByCertificateId({ organizationId: ORG, certificateId: "c2" }, asClient(db));
    expect(after?.publicStatus).toBe("REVOKED");
  });
});
