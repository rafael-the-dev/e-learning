import { beforeEach, describe, expect, it } from "vitest";
import { asClient, makeFakeDb, seed, type FakeDb } from "./_fake-db";
import {
  createVersion,
  countActiveVersions,
  findCurrentIssuedVersion,
  findLatestVersion,
  findVersionById,
  listVersionsByTranscript,
  markVersionIssued,
  markVersionRevoked,
  markVersionSuperseded,
  updateVersionMetadata,
} from "../academic-transcript-version.repository";

const ORG_A = "org-A";
const ORG_B = "org-B";
const T1 = "transcript-1";

let db: FakeDb;

function seedVersion(overrides: Record<string, unknown> = {}) {
  return seed(db, "academicTranscriptVersion", {
    organizationId: ORG_A,
    transcriptId: T1,
    versionNumber: 1,
    snapshotDate: new Date("2026-01-10"),
    status: "DRAFT",
    reason: null,
    generatedBy: null,
    issuedBy: null,
    issuedAt: null,
    supersededAt: null,
    revokedAt: null,
    revokedBy: null,
    revokeReason: null,
    checksum: null,
    studentSnapshot: "{}",
    courseSnapshot: null,
    ...overrides,
  });
}

beforeEach(() => {
  db = makeFakeDb();
});

describe("academic-transcript-version.repository — create + reads (tests #12, #13, #3)", () => {
  it("createVersion persists the version with its immutable JSON snapshots", async () => {
    const v = await createVersion(
      {
        organizationId: ORG_A,
        transcriptId: T1,
        versionNumber: 1,
        snapshotDate: new Date("2026-01-10"),
        status: "DRAFT",
        studentSnapshot: '{"name":"Ana"}',
        courseSnapshot: '{"code":"B"}',
        generatedBy: "user-1",
      },
      asClient(db)
    );
    expect(v).toMatchObject({
      organizationId: ORG_A,
      transcriptId: T1,
      versionNumber: 1,
      status: "DRAFT",
      studentSnapshot: '{"name":"Ana"}',
      courseSnapshot: '{"code":"B"}',
    });
  });

  it("findVersionById is org-scoped (test #3)", async () => {
    const v = seedVersion();
    const id = v.id as string;
    await expect(findVersionById({ id, organizationId: ORG_A }, asClient(db))).resolves.toMatchObject({ id });
    await expect(findVersionById({ id, organizationId: ORG_B }, asClient(db))).resolves.toBeNull();
  });

  it("findLatestVersion returns the highest versionNumber for the transcript", async () => {
    seedVersion({ versionNumber: 1, status: "SUPERSEDED" });
    seedVersion({ versionNumber: 2, status: "ISSUED" });
    seedVersion({ versionNumber: 3, status: "DRAFT" });
    const latest = await findLatestVersion({ transcriptId: T1, organizationId: ORG_A }, asClient(db));
    expect(latest?.versionNumber).toBe(3);
  });

  it("findCurrentIssuedVersion returns the latest ISSUED version only", async () => {
    seedVersion({ versionNumber: 1, status: "ISSUED" });
    seedVersion({ versionNumber: 2, status: "ISSUED" });
    seedVersion({ versionNumber: 3, status: "DRAFT" });
    const issued = await findCurrentIssuedVersion({ transcriptId: T1, organizationId: ORG_A }, asClient(db));
    expect(issued?.versionNumber).toBe(2);
    expect(issued?.status).toBe("ISSUED");
  });

  it("find*/list versions never cross org boundaries", async () => {
    seedVersion({ versionNumber: 1, organizationId: ORG_A });
    seedVersion({ versionNumber: 2, organizationId: ORG_B });
    const list = await listVersionsByTranscript({ transcriptId: T1, organizationId: ORG_A }, asClient(db));
    expect(list).toHaveLength(1);
    expect(list[0].organizationId).toBe(ORG_A);
  });

  it("listVersionsByTranscript orders ascending by versionNumber", async () => {
    seedVersion({ versionNumber: 3 });
    seedVersion({ versionNumber: 1 });
    seedVersion({ versionNumber: 2 });
    const list = await listVersionsByTranscript({ transcriptId: T1, organizationId: ORG_A }, asClient(db));
    expect(list.map((v) => v.versionNumber)).toEqual([1, 2, 3]);
  });
});

describe("academic-transcript-version.repository — metadata writes are org-scoped (test #14)", () => {
  it("markVersionIssued sets status/issuedAt/issuedBy/checksum, scoped by org", async () => {
    const v = seedVersion({ status: "DRAFT" });
    const id = v.id as string;
    const at = new Date("2026-04-04");

    const wrong = await markVersionIssued({ id, organizationId: ORG_B, issuedAt: at }, asClient(db));
    expect(wrong.count).toBe(0);
    expect(v.status).toBe("DRAFT");

    const ok = await markVersionIssued(
      { id, organizationId: ORG_A, issuedAt: at, issuedBy: "user-9", checksum: "abc" },
      asClient(db)
    );
    expect(ok.count).toBe(1);
    expect(v.status).toBe("ISSUED");
    expect(v.issuedAt).toBe(at);
    expect(v.issuedBy).toBe("user-9");
    expect(v.checksum).toBe("abc");
  });

  it("markVersionSuperseded sets status + supersededAt", async () => {
    const v = seedVersion({ status: "ISSUED" });
    const at = new Date("2026-05-05");
    const res = await markVersionSuperseded({ id: v.id as string, organizationId: ORG_A, supersededAt: at }, asClient(db));
    expect(res.count).toBe(1);
    expect(v.status).toBe("SUPERSEDED");
    expect(v.supersededAt).toBe(at);
  });

  it("markVersionRevoked sets status + revoke fields", async () => {
    const v = seedVersion({ status: "ISSUED" });
    const at = new Date("2026-06-06");
    const res = await markVersionRevoked(
      { id: v.id as string, organizationId: ORG_A, revokedAt: at, revokedBy: "user-2", revokeReason: "error" },
      asClient(db)
    );
    expect(res.count).toBe(1);
    expect(v.status).toBe("REVOKED");
    expect(v.revokedAt).toBe(at);
    expect(v.revokedBy).toBe("user-2");
    expect(v.revokeReason).toBe("error");
  });

  it("updateVersionMetadata only writes provided keys, scoped by org", async () => {
    const v = seedVersion({ status: "DRAFT", checksum: null });
    const id = v.id as string;
    const res = await updateVersionMetadata({ id, organizationId: ORG_A, checksum: "cs-1" }, asClient(db));
    expect(res.count).toBe(1);
    expect(v.checksum).toBe("cs-1");
    expect(v.status).toBe("DRAFT"); // not passed → untouched
  });
});

describe("academic-transcript-version.repository — conditional lifecycle guards (Sprint 5A)", () => {
  it("markVersionIssued is a no-op (count 0) when the version is not DRAFT", async () => {
    const v = seedVersion({ status: "ISSUED", issuedAt: new Date("2026-01-01"), issuedBy: "u-0" });
    const res = await markVersionIssued(
      { id: v.id as string, organizationId: ORG_A, issuedAt: new Date("2026-02-02"), issuedBy: "u-9" },
      asClient(db)
    );
    expect(res.count).toBe(0);
    expect(v.issuedBy).toBe("u-0"); // untouched
  });

  it("markVersionSuperseded is a no-op (count 0) when the version is not ISSUED", async () => {
    const v = seedVersion({ status: "SUPERSEDED", supersededAt: new Date("2026-01-01") });
    const res = await markVersionSuperseded(
      { id: v.id as string, organizationId: ORG_A, supersededAt: new Date("2026-02-02") },
      asClient(db)
    );
    expect(res.count).toBe(0);
  });

  it("countActiveVersions counts only non-REVOKED versions, scoped by org (Sprint 5B)", async () => {
    seedVersion({ versionNumber: 1, status: "SUPERSEDED" });
    seedVersion({ versionNumber: 2, status: "ISSUED" });
    seedVersion({ versionNumber: 3, status: "REVOKED", revokedBy: "u-0" });
    seedVersion({ versionNumber: 4, status: "DRAFT" });
    // another org's version for the same transcriptId must not be counted
    seedVersion({ versionNumber: 1, status: "ISSUED", organizationId: ORG_B });

    expect(await countActiveVersions({ transcriptId: T1, organizationId: ORG_A }, asClient(db))).toBe(3);

    seed(db, "academicTranscriptVersion", {
      organizationId: ORG_A, transcriptId: "transcript-other", versionNumber: 1, snapshotDate: new Date(),
      status: "ISSUED", studentSnapshot: "{}",
    });
    // still 3 — the extra active version belongs to a different transcript
    expect(await countActiveVersions({ transcriptId: T1, organizationId: ORG_A }, asClient(db))).toBe(3);
  });

  it("countActiveVersions returns 0 once every version is REVOKED (Sprint 5B)", async () => {
    seedVersion({ versionNumber: 1, status: "REVOKED", revokedBy: "u-0" });
    seedVersion({ versionNumber: 2, status: "REVOKED", revokedBy: "u-0" });
    expect(await countActiveVersions({ transcriptId: T1, organizationId: ORG_A }, asClient(db))).toBe(0);
  });

  it("markVersionRevoked is a no-op (count 0) for a DRAFT and for an already REVOKED version", async () => {
    const draft = seedVersion({ versionNumber: 1, status: "DRAFT" });
    const revoked = seedVersion({ versionNumber: 2, status: "REVOKED", revokedBy: "u-0" });
    const at = new Date("2026-03-03");

    const draftRes = await markVersionRevoked(
      { id: draft.id as string, organizationId: ORG_A, revokedAt: at, revokedBy: "u-9", revokeReason: "x" },
      asClient(db)
    );
    expect(draftRes.count).toBe(0);
    expect(draft.status).toBe("DRAFT");

    const revokedRes = await markVersionRevoked(
      { id: revoked.id as string, organizationId: ORG_A, revokedAt: at, revokedBy: "u-9", revokeReason: "x" },
      asClient(db)
    );
    expect(revokedRes.count).toBe(0);
    expect(revoked.revokedBy).toBe("u-0"); // untouched
  });
});
