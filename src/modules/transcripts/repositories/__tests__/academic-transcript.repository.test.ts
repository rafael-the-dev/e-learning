import { beforeEach, describe, expect, it } from "vitest";
import { asClient, makeFakeDb, seed, type FakeDb } from "./_fake-db";
import {
  clearTranscriptStale,
  createTranscript,
  findTranscriptById,
  findTranscriptByScope,
  findTranscriptDetailById,
  listTranscripts,
  markTranscriptStale,
  softDeleteDraftTranscript,
  updateTranscriptMetadata,
} from "../academic-transcript.repository";

const ORG_A = "org-A";
const ORG_B = "org-B";

let db: FakeDb;

function seedTranscript(overrides: Record<string, unknown> = {}) {
  return seed(db, "academicTranscript", {
    organizationId: ORG_A,
    studentId: "student-1",
    enrollmentId: null,
    courseId: null,
    transcriptType: "FULL_ACADEMIC_HISTORY",
    scopeCourseLevelId: null,
    scopeAcademicTermId: null,
    scopeLevelSubjectId: null,
    transcriptNumber: null,
    status: "DRAFT",
    currentVersionId: null,
    needsRegeneration: false,
    staleReason: null,
    staleDetectedAt: null,
    issuedAt: null,
    issuedBy: null,
    deletedAt: null,
    ...overrides,
  });
}

beforeEach(() => {
  db = makeFakeDb();
});

describe("academic-transcript.repository — reads are tenant-scoped", () => {
  it("createTranscript persists metadata only, defaulting nullable scope fields", async () => {
    const created = await createTranscript(
      {
        organizationId: ORG_A,
        studentId: "student-1",
        transcriptType: "COURSE_TRANSCRIPT",
        courseId: "course-1",
        status: "DRAFT",
      },
      asClient(db)
    );
    expect(created).toMatchObject({
      organizationId: ORG_A,
      studentId: "student-1",
      transcriptType: "COURSE_TRANSCRIPT",
      courseId: "course-1",
      status: "DRAFT",
      enrollmentId: null,
      scopeCourseLevelId: null,
      currentVersionId: null,
    });
    // needsRegeneration is a DB-level @default(false) — the repo relies on it
    // rather than writing it, so it is not asserted on the create result here.
    expect(created.id).toBeTruthy();
  });

  it("findTranscriptById does NOT return another org's transcript (test #1)", async () => {
    const row = seedTranscript({ organizationId: ORG_A });
    const id = row.id as string;

    await expect(findTranscriptById({ id, organizationId: ORG_A }, asClient(db))).resolves.toMatchObject({ id });
    await expect(findTranscriptById({ id, organizationId: ORG_B }, asClient(db))).resolves.toBeNull();
  });

  it("findTranscriptById excludes soft-deleted rows", async () => {
    const row = seedTranscript({ deletedAt: new Date("2026-02-02") });
    const id = row.id as string;
    await expect(findTranscriptById({ id, organizationId: ORG_A }, asClient(db))).resolves.toBeNull();
  });

  it("findTranscriptDetailById is org-scoped and returns null currentVersion when unset", async () => {
    const row = seedTranscript();
    const id = row.id as string;
    const detail = await findTranscriptDetailById({ id, organizationId: ORG_A }, asClient(db));
    expect(detail?.id).toBe(id);
    expect(detail?.currentVersion).toBeNull();
    await expect(
      findTranscriptDetailById({ id, organizationId: ORG_B }, asClient(db))
    ).resolves.toBeNull();
  });

  it("findTranscriptByScope matches only the provided discriminators, org-scoped (test #10)", async () => {
    seedTranscript({
      studentId: "student-1",
      transcriptType: "COURSE_TRANSCRIPT",
      courseId: "course-1",
      enrollmentId: "enr-1",
    });

    const hit = await findTranscriptByScope(
      {
        organizationId: ORG_A,
        studentId: "student-1",
        transcriptType: "COURSE_TRANSCRIPT",
        courseId: "course-1",
        enrollmentId: "enr-1",
      },
      asClient(db)
    );
    expect(hit).not.toBeNull();

    // wrong course → no match
    await expect(
      findTranscriptByScope(
        {
          organizationId: ORG_A,
          studentId: "student-1",
          transcriptType: "COURSE_TRANSCRIPT",
          courseId: "course-2",
        },
        asClient(db)
      )
    ).resolves.toBeNull();

    // right scope, wrong org → no match
    await expect(
      findTranscriptByScope(
        {
          organizationId: ORG_B,
          studentId: "student-1",
          transcriptType: "COURSE_TRANSCRIPT",
          courseId: "course-1",
          enrollmentId: "enr-1",
        },
        asClient(db)
      )
    ).resolves.toBeNull();
  });

  it("listTranscripts filters by org + status + type and paginates (test #11)", async () => {
    seedTranscript({ status: "ISSUED", transcriptType: "COURSE_TRANSCRIPT" });
    seedTranscript({ status: "DRAFT", transcriptType: "COURSE_TRANSCRIPT" });
    seedTranscript({ status: "ISSUED", transcriptType: "LEVEL_TRANSCRIPT" });
    seedTranscript({ organizationId: ORG_B, status: "ISSUED", transcriptType: "COURSE_TRANSCRIPT" });

    const res = await listTranscripts(
      { organizationId: ORG_A, status: "ISSUED", transcriptType: "COURSE_TRANSCRIPT", page: 1, pageSize: 10 },
      asClient(db)
    );
    expect(res.total).toBe(1);
    expect(res.data).toHaveLength(1);
    expect(res.data[0].organizationId).toBe(ORG_A);

    const all = await listTranscripts({ organizationId: ORG_A, page: 1, pageSize: 10 }, asClient(db));
    expect(all.total).toBe(3); // ORG_B row excluded
  });

  it("listTranscripts filters by needsRegeneration flag", async () => {
    seedTranscript({ needsRegeneration: true });
    seedTranscript({ needsRegeneration: false });
    const res = await listTranscripts(
      { organizationId: ORG_A, needsRegeneration: true, page: 1, pageSize: 10 },
      asClient(db)
    );
    expect(res.total).toBe(1);
  });
});

describe("academic-transcript.repository — writes are tenant-scoped (never by id alone)", () => {
  it("updateTranscriptMetadata CANNOT update another org's transcript (test #2)", async () => {
    const row = seedTranscript({ status: "DRAFT" });
    const id = row.id as string;

    const wrongOrg = await updateTranscriptMetadata(
      { id, organizationId: ORG_B, status: "ISSUED" },
      asClient(db)
    );
    expect(wrongOrg.count).toBe(0);
    expect(row.status).toBe("DRAFT"); // untouched

    const rightOrg = await updateTranscriptMetadata(
      { id, organizationId: ORG_A, status: "ISSUED", currentVersionId: "ver-1" },
      asClient(db)
    );
    expect(rightOrg.count).toBe(1);
    expect(row.status).toBe("ISSUED");
    expect(row.currentVersionId).toBe("ver-1");
  });

  it("updateTranscriptMetadata optimistic guards refuse the write when the row moved (Sprint 5A)", async () => {
    const row = seedTranscript({ status: "DRAFT", transcriptNumber: null, currentVersionId: null });
    const id = row.id as string;

    // expectTranscriptNumberNull: matches while the number is null.
    const first = await updateTranscriptMetadata(
      { id, organizationId: ORG_A, transcriptNumber: "TRN-2026-000001", expectTranscriptNumberNull: true },
      asClient(db)
    );
    expect(first.count).toBe(1);
    expect(row.transcriptNumber).toBe("TRN-2026-000001");

    // A second guarded assignment must lose the race (number no longer null).
    const second = await updateTranscriptMetadata(
      { id, organizationId: ORG_A, transcriptNumber: "TRN-2026-000002", expectTranscriptNumberNull: true },
      asClient(db)
    );
    expect(second.count).toBe(0);
    expect(row.transcriptNumber).toBe("TRN-2026-000001"); // never overwritten

    // expectCurrentVersionId: matches only the expected pointer value.
    const wrongExpectation = await updateTranscriptMetadata(
      { id, organizationId: ORG_A, currentVersionId: "v-2", expectCurrentVersionId: "v-1" },
      asClient(db)
    );
    expect(wrongExpectation.count).toBe(0);
    expect(row.currentVersionId).toBeNull(); // untouched
  });

  it("markTranscriptStale sets the stale flags, scoped by org", async () => {
    const row = seedTranscript();
    const id = row.id as string;
    const at = new Date("2026-03-03");
    const res = await markTranscriptStale(
      { id, organizationId: ORG_A, staleReason: "grade-changed", staleDetectedAt: at },
      asClient(db)
    );
    expect(res.count).toBe(1);
    expect(row.needsRegeneration).toBe(true);
    expect(row.staleReason).toBe("grade-changed");
    expect(row.staleDetectedAt).toBe(at);

    // other org cannot mark stale
    const other = await markTranscriptStale(
      { id, organizationId: ORG_B, staleReason: "x", staleDetectedAt: at },
      asClient(db)
    );
    expect(other.count).toBe(0);
  });

  it("clearTranscriptStale resets the stale flags, scoped by org", async () => {
    const row = seedTranscript({ needsRegeneration: true, staleReason: "x", staleDetectedAt: new Date() });
    const id = row.id as string;
    const res = await clearTranscriptStale({ id, organizationId: ORG_A }, asClient(db));
    expect(res.count).toBe(1);
    expect(row.needsRegeneration).toBe(false);
    expect(row.staleReason).toBeNull();
    expect(row.staleDetectedAt).toBeNull();
  });

  it("softDeleteDraftTranscript only soft-deletes DRAFT rows, never ISSUED", async () => {
    const draft = seedTranscript({ status: "DRAFT" });
    const issued = seedTranscript({ status: "ISSUED" });

    const okDraft = await softDeleteDraftTranscript(
      { id: draft.id as string, organizationId: ORG_A },
      asClient(db)
    );
    expect(okDraft.count).toBe(1);
    expect(draft.deletedAt).toBeInstanceOf(Date);

    const blockIssued = await softDeleteDraftTranscript(
      { id: issued.id as string, organizationId: ORG_A },
      asClient(db)
    );
    expect(blockIssued.count).toBe(0);
    expect(issued.deletedAt).toBeNull();
  });

  it("softDeleteDraftTranscript is org-scoped", async () => {
    const draft = seedTranscript({ status: "DRAFT" });
    const res = await softDeleteDraftTranscript(
      { id: draft.id as string, organizationId: ORG_B },
      asClient(db)
    );
    expect(res.count).toBe(0);
    expect(draft.deletedAt).toBeNull();
  });
});
