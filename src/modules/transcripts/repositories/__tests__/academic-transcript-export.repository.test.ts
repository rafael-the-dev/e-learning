import { beforeEach, describe, expect, it } from "vitest";
import { asClient, makeFakeDb, type FakeDb } from "./_fake-db";
import {
  createTranscriptExport,
  findTranscriptExportById,
  listExportsByVersion,
  updateTranscriptExportStatus,
} from "../academic-transcript-export.repository";

const ORG_A = "org-A";
const ORG_B = "org-B";
const VER = "version-1";

let db: FakeDb;

beforeEach(() => {
  db = makeFakeDb();
});

describe("academic-transcript-export.repository — org-scoped (test #6)", () => {
  it("createTranscriptExport defaults status to PENDING", async () => {
    const exp = await createTranscriptExport(
      { organizationId: ORG_A, transcriptVersionId: VER, exportType: "PDF" },
      asClient(db)
    );
    expect(exp.status).toBe("PENDING");
    expect(exp.exportType).toBe("PDF");
  });

  it("findTranscriptExportById does not return another org's export", async () => {
    const exp = await createTranscriptExport(
      { organizationId: ORG_A, transcriptVersionId: VER, exportType: "PDF" },
      asClient(db)
    );
    await expect(findTranscriptExportById({ id: exp.id, organizationId: ORG_A }, asClient(db))).resolves.toMatchObject({ id: exp.id });
    await expect(findTranscriptExportById({ id: exp.id, organizationId: ORG_B }, asClient(db))).resolves.toBeNull();
  });

  it("listExportsByVersion is org-scoped", async () => {
    await createTranscriptExport({ organizationId: ORG_A, transcriptVersionId: VER, exportType: "PDF" }, asClient(db));
    await createTranscriptExport({ organizationId: ORG_B, transcriptVersionId: VER, exportType: "EXCEL" }, asClient(db));
    const list = await listExportsByVersion({ organizationId: ORG_A, transcriptVersionId: VER }, asClient(db));
    expect(list).toHaveLength(1);
    expect(list[0].organizationId).toBe(ORG_A);
  });

  it("updateTranscriptExportStatus updates metadata scoped by org", async () => {
    const exp = await createTranscriptExport(
      { organizationId: ORG_A, transcriptVersionId: VER, exportType: "PDF" },
      asClient(db)
    );
    const at = new Date("2026-07-07");

    const wrong = await updateTranscriptExportStatus({ id: exp.id, organizationId: ORG_B, status: "READY" }, asClient(db));
    expect(wrong.count).toBe(0);

    const ok = await updateTranscriptExportStatus(
      { id: exp.id, organizationId: ORG_A, status: "READY", fileUrl: "https://x/y.pdf", exportedAt: at },
      asClient(db)
    );
    expect(ok.count).toBe(1);
    const after = await findTranscriptExportById({ id: exp.id, organizationId: ORG_A }, asClient(db));
    expect(after).toMatchObject({ status: "READY", fileUrl: "https://x/y.pdf" });
    expect(after?.exportedAt).toEqual(at);
  });
});
