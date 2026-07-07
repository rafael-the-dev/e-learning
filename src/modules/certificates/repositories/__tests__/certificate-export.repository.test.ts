import { describe, expect, it } from "vitest";
import { asClient, makeFakeDb, seed } from "./_fake-db";
import {
  createCertificateExport,
  findCertificateExportById,
  listCertificateExports,
  updateCertificateExportStatus,
} from "../certificate-export.repository";

const ORG = "org-A";
const OTHER = "org-B";

describe("certificate-export repository", () => {
  it("26. creates an export artifact row", async () => {
    const db = makeFakeDb();
    const rec = await createCertificateExport(
      { organizationId: ORG, certificateId: "c1", exportType: "PDF", status: "PENDING" },
      asClient(db)
    );
    expect(rec.exportType).toBe("PDF");
    expect(rec.status).toBe("PENDING");
    expect(await findCertificateExportById({ id: rec.id, organizationId: ORG }, asClient(db))).not.toBeNull();
  });

  it("27. updates export status/metadata, tenant-scoped", async () => {
    const db = makeFakeDb();
    seed(db, "certificateExport", { id: "x1", organizationId: OTHER, certificateId: "c1", exportType: "PDF", status: "PENDING" });
    expect((await updateCertificateExportStatus({ id: "x1", organizationId: ORG, status: "READY" }, asClient(db))).count).toBe(0);

    seed(db, "certificateExport", { id: "x2", organizationId: ORG, certificateId: "c1", exportType: "PDF", status: "PENDING" });
    const res = await updateCertificateExportStatus(
      { id: "x2", organizationId: ORG, status: "READY", fileUrl: "https://files/x2.pdf", fileChecksum: "sum" },
      asClient(db)
    );
    expect(res.count).toBe(1);
    const after = await findCertificateExportById({ id: "x2", organizationId: ORG }, asClient(db));
    expect(after?.status).toBe("READY");
    expect(after?.fileUrl).toBe("https://files/x2.pdf");
  });

  it("28. lists exports by certificate, org-scoped", async () => {
    const db = makeFakeDb();
    seed(db, "certificateExport", { id: "x1", organizationId: ORG, certificateId: "c1", exportType: "PDF", status: "READY", createdAt: new Date("2026-07-01T00:00:00.000Z") });
    seed(db, "certificateExport", { id: "x2", organizationId: ORG, certificateId: "c1", exportType: "MINISTRY", status: "PENDING", createdAt: new Date("2026-07-02T00:00:00.000Z") });
    seed(db, "certificateExport", { id: "x-other", organizationId: OTHER, certificateId: "c1", exportType: "PDF", status: "READY" });

    const list = await listCertificateExports({ organizationId: ORG, certificateId: "c1" }, asClient(db));
    expect(list.map((x) => x.id)).toEqual(["x1", "x2"]);
  });
});
