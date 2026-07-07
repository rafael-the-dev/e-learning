import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, type FakeDb } from "../../repositories/__tests__/_fake-db";
import { ORG, OTHER_ORG, seedRoot, seedVersion, SNAPSHOT_MODELS } from "./_lifecycle-fixtures";

const h = vi.hoisted(() => ({ db: null as unknown as FakeDb }));
const authState = vi.hoisted(() => ({ allow: true }));
const published = vi.hoisted(() => ({ events: [] as Array<Record<string, unknown>> }));

vi.mock("@/server/db", () => ({ getDb: vi.fn(async () => h.db) }));
vi.mock("@/server/auth/rbac", () => ({
  getUserPermissions: vi.fn(async () => new Set<string>()),
  createAbility: () => ({ can: () => authState.allow }),
}));
vi.mock("@/server/events/event-publisher", () => ({
  eventPublisher: { publish: vi.fn(async (e: Record<string, unknown>) => void published.events.push(e)) },
}));
vi.mock("@/modules/transcripts/lib/transcript-number", () => ({
  allocateTranscriptNumber: vi.fn(async () => "TRN-2026-000001"),
}));

import { AuthorizationError, BusinessRuleError, NotFoundError } from "@/shared/lib/command";
import { allocateTranscriptNumber } from "@/modules/transcripts/lib/transcript-number";
import type { ServiceContext } from "@/shared/types/common";
import { IssueTranscriptCommand } from "../issue-transcript.command";

const ctx: ServiceContext = { userId: "u-1", organizationId: ORG };
const store = (name: string) => h.db[name].__store;
const eventTypes = () => published.events.map((e) => e.eventType);

function issue(transcriptVersionId = "v-1", context: ServiceContext = ctx, reason?: string) {
  return new IssueTranscriptCommand({ transcriptVersionId, reason }, context).run();
}

beforeEach(() => {
  vi.clearAllMocks();
  h.db = makeFakeDb();
  authState.allow = true;
  published.events.length = 0;
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("IssueTranscriptCommand — issue a DRAFT (#1–#8, #34)", () => {
  it("#1 issues a DRAFT version → ISSUED", async () => {
    seedRoot(h.db);
    seedVersion(h.db);
    const { version } = await issue();
    expect(version.status).toBe("ISSUED");
    expect((store("academicTranscriptVersion")[0] as { status: string }).status).toBe("ISSUED");
  });

  it("#2/#34 allocates a transcript number on first issue", async () => {
    seedRoot(h.db, { transcriptNumber: null });
    seedVersion(h.db);
    const { transcript } = await issue();
    expect(allocateTranscriptNumber).toHaveBeenCalledTimes(1);
    expect(transcript.transcriptNumber).toBe("TRN-2026-000001");
  });

  it("#3 does not reassign an existing transcript number", async () => {
    seedRoot(h.db, { transcriptNumber: "TRN-2025-000009", status: "ISSUED", issuedAt: new Date("2025-01-01"), issuedBy: "old" });
    seedVersion(h.db);
    const { transcript } = await issue();
    expect(allocateTranscriptNumber).not.toHaveBeenCalled();
    expect(transcript.transcriptNumber).toBe("TRN-2025-000009");
  });

  it("#4 sets issuedAt/issuedBy on the version", async () => {
    seedRoot(h.db);
    seedVersion(h.db);
    const { version } = await issue();
    expect(version.issuedAt).toBeInstanceOf(Date);
    expect(version.issuedBy).toBe("u-1");
    expect(version.checksum).toBe("checksum-v-1"); // unchanged
  });

  it("#5 points the root currentVersionId at the issued version", async () => {
    seedRoot(h.db);
    seedVersion(h.db);
    const { transcript, version } = await issue();
    expect(transcript.currentVersionId).toBe(version.id);
    expect(transcript.status).toBe("ISSUED");
    expect(transcript.issuedAt).toBeInstanceOf(Date);
    expect(transcript.issuedBy).toBe("u-1");
  });

  it("#6 clears stale flags on the root", async () => {
    seedRoot(h.db, { needsRegeneration: true, staleReason: "SOMETHING", staleDetectedAt: new Date() });
    seedVersion(h.db);
    const { transcript } = await issue();
    expect(transcript.needsRegeneration).toBe(false);
    expect(transcript.staleReason).toBeNull();
    expect(transcript.staleDetectedAt).toBeNull();
  });

  it("#7 emits transcript.issued after commit", async () => {
    seedRoot(h.db);
    seedVersion(h.db);
    await issue();
    expect(eventTypes()).toContain("transcript.issued");
    const issued = published.events.find((e) => e.eventType === "transcript.issued")!;
    expect(issued.payload).toMatchObject({
      transcriptId: "tr-1",
      transcriptVersionId: "v-1",
      previousStatus: "DRAFT",
      newStatus: "ISSUED",
      transcriptNumber: "TRN-2026-000001",
      checksum: "checksum-v-1",
    });
  });

  it("#8 writes an AuditLog and an AcademicTranscriptEvent", async () => {
    seedRoot(h.db);
    seedVersion(h.db);
    await issue();
    expect(store("auditLog").some((r) => (r as { action: string }).action === "transcript.issued")).toBe(true);
    expect(store("academicTranscriptEvent").some((r) => (r as { eventType: string }).eventType === "transcript.issued")).toBe(true);
  });
});

describe("IssueTranscriptCommand — errors + immutability (#9–#13, #35)", () => {
  it("#9/#35 rolls back everything and emits nothing when a write fails", async () => {
    seedRoot(h.db, { transcriptNumber: null });
    seedVersion(h.db);
    // poison the transcript-event insert (fires after version/root updates)
    h.db.academicTranscriptEvent.create = async () => {
      throw new Error("boom: event insert failed");
    };
    await expect(issue()).rejects.toThrow(/boom/);

    // nothing published
    expect(published.events).toHaveLength(0);
    // version rolled back to DRAFT; root number NOT persisted (allocation rollback-safe)
    expect((store("academicTranscriptVersion")[0] as { status: string }).status).toBe("DRAFT");
    expect((store("academicTranscript")[0] as { transcriptNumber: string | null }).transcriptNumber).toBeNull();
    expect((store("academicTranscript")[0] as { status: string }).status).toBe("DRAFT");
  });

  it("#10 cannot issue a non-DRAFT version", async () => {
    seedRoot(h.db, { status: "ISSUED", currentVersionId: "v-1" });
    seedVersion(h.db, { status: "ISSUED" });
    await expect(issue()).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("#11 cannot issue a cross-tenant version", async () => {
    seedRoot(h.db);
    seedVersion(h.db);
    await expect(issue("v-1", { userId: "u-x", organizationId: OTHER_ORG })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("#12 cannot issue without permission", async () => {
    authState.allow = false;
    seedRoot(h.db);
    seedVersion(h.db);
    await expect(issue()).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("#13 does not mutate snapshot child rows", async () => {
    seedRoot(h.db);
    seedVersion(h.db);
    const before = SNAPSHOT_MODELS.map((m) => JSON.stringify(store(m)));
    await issue();
    const after = SNAPSHOT_MODELS.map((m) => JSON.stringify(store(m)));
    expect(after).toEqual(before);
  });

  it("throws BusinessRuleError when the version has no snapshot rows", async () => {
    seedRoot(h.db);
    // seed a bare version WITHOUT the snapshot children
    h.db.academicTranscriptVersion.__seed({
      id: "v-bare", organizationId: ORG, transcriptId: "tr-1", versionNumber: 1,
      snapshotDate: new Date(), status: "DRAFT", checksum: "c", studentSnapshot: "{}", courseSnapshot: "{}",
    });
    await expect(issue("v-bare")).rejects.toBeInstanceOf(BusinessRuleError);
  });
});

describe("IssueTranscriptCommand — supersession (#14–#19)", () => {
  function seedSupersedeScenario() {
    seedRoot(h.db, { status: "ISSUED", currentVersionId: "v-1", transcriptNumber: "TRN-2026-000001", issuedAt: new Date("2026-05-01"), issuedBy: "u-0" });
    seedVersion(h.db, { id: "v-1", versionNumber: 1, status: "ISSUED", issuedAt: new Date("2026-05-01"), issuedBy: "u-0" });
    seedVersion(h.db, { id: "v-2", versionNumber: 2, status: "DRAFT" });
  }

  it("#14/#15 issuing v2 supersedes the current v1 (status + supersededAt)", async () => {
    seedSupersedeScenario();
    await issue("v-2");
    const v1 = store("academicTranscriptVersion").find((v) => (v as { id: string }).id === "v-1") as { status: string; supersededAt: Date | null };
    expect(v1.status).toBe("SUPERSEDED");
    expect(v1.supersededAt).toBeInstanceOf(Date);
  });

  it("#16 root currentVersionId points to v2", async () => {
    seedSupersedeScenario();
    const { transcript } = await issue("v-2");
    expect(transcript.currentVersionId).toBe("v-2");
  });

  it("#17 emits transcript.superseded then transcript.issued", async () => {
    seedSupersedeScenario();
    await issue("v-2");
    expect(eventTypes()).toEqual(["transcript.superseded", "transcript.issued"]);
  });

  it("#18 writes audit rows for both superseded and issued", async () => {
    seedSupersedeScenario();
    await issue("v-2");
    const actions = store("auditLog").map((r) => (r as { action: string }).action);
    expect(actions).toContain("transcript.superseded");
    expect(actions).toContain("transcript.issued");
  });

  it("#19 leaves v1 snapshot rows unchanged", async () => {
    seedSupersedeScenario();
    const v1Levels = JSON.stringify(store("academicTranscriptLevel").filter((r) => (r as { transcriptVersionId: string }).transcriptVersionId === "v-1"));
    await issue("v-2");
    const after = JSON.stringify(store("academicTranscriptLevel").filter((r) => (r as { transcriptVersionId: string }).transcriptVersionId === "v-1"));
    expect(after).toBe(v1Levels);
  });

  it("does not reallocate the number when superseding (root already numbered)", async () => {
    seedSupersedeScenario();
    await issue("v-2");
    expect(allocateTranscriptNumber).not.toHaveBeenCalled();
  });
});

describe("IssueTranscriptCommand — re-issue after full revocation (L1)", () => {
  // A fully REVOKED root is NOT deleted: it returns to ISSUED only by issuing a
  // freshly-generated DRAFT. No old REVOKED version is reactivated, and the
  // already-assigned transcriptNumber is preserved.
  function seedRevokedRootWithNewDraft() {
    seedRoot(h.db, {
      status: "REVOKED",
      currentVersionId: null,
      transcriptNumber: "TRN-2026-000001",
      issuedAt: new Date("2026-05-01"),
      issuedBy: "u-0",
      needsRegeneration: true,
      staleReason: "CURRENT_VERSION_REVOKED",
      staleDetectedAt: new Date("2026-05-02"),
    });
    seedVersion(h.db, {
      id: "v-1", versionNumber: 1, status: "REVOKED",
      issuedAt: new Date("2026-05-01"), issuedBy: "u-0",
      revokedAt: new Date("2026-05-02"), revokedBy: "u-0", revokeReason: "erro nos dados",
    });
    seedVersion(h.db, { id: "v-2", versionNumber: 2, status: "DRAFT" });
  }

  it("L1-1/L1-2 issuing a new DRAFT flips the REVOKED root back to ISSUED and points at the new version", async () => {
    seedRevokedRootWithNewDraft();
    const { transcript, version } = await issue("v-2");
    expect(version.status).toBe("ISSUED");
    expect(transcript.status).toBe("ISSUED"); // L1-1
    expect(transcript.currentVersionId).toBe("v-2"); // L1-2
    expect(transcript.needsRegeneration).toBe(false);
    expect(transcript.staleReason).toBeNull();
    expect(transcript.staleDetectedAt).toBeNull();
  });

  it("L1-3 leaves the old REVOKED version REVOKED (no reactivation)", async () => {
    seedRevokedRootWithNewDraft();
    await issue("v-2");
    const v1 = store("academicTranscriptVersion").find((v) => (v as { id: string }).id === "v-1") as {
      status: string;
      revokedAt: Date | null;
    };
    expect(v1.status).toBe("REVOKED");
    expect(v1.revokedAt).toBeInstanceOf(Date);
  });

  it("L1-4 does not reassign the transcriptNumber", async () => {
    seedRevokedRootWithNewDraft();
    const { transcript } = await issue("v-2");
    expect(transcript.transcriptNumber).toBe("TRN-2026-000001"); // unchanged
    expect(allocateTranscriptNumber).not.toHaveBeenCalled();
  });
});

describe("IssueTranscriptCommand — SUPERSEDED cannot be re-issued (L2)", () => {
  it("L2 rejects SUPERSEDED → ISSUED with BusinessRuleError and mutates nothing", async () => {
    seedRoot(h.db, { status: "ISSUED", currentVersionId: "v-2", transcriptNumber: "TRN-2026-000001" });
    seedVersion(h.db, { id: "v-1", versionNumber: 1, status: "SUPERSEDED", supersededAt: new Date("2026-05-01") });
    seedVersion(h.db, { id: "v-2", versionNumber: 2, status: "ISSUED", issuedAt: new Date("2026-05-02") });

    await expect(issue("v-1")).rejects.toBeInstanceOf(BusinessRuleError);

    // No event, no audit, no transcript-event, no root/version mutation.
    expect(published.events).toHaveLength(0);
    expect(store("auditLog")).toHaveLength(0);
    expect(store("academicTranscriptEvent")).toHaveLength(0);
    expect(allocateTranscriptNumber).not.toHaveBeenCalled();
    const root = store("academicTranscript")[0] as { status: string; currentVersionId: string };
    expect(root.status).toBe("ISSUED");
    expect(root.currentVersionId).toBe("v-2");
    const v1 = store("academicTranscriptVersion").find((v) => (v as { id: string }).id === "v-1") as { status: string };
    expect(v1.status).toBe("SUPERSEDED"); // untouched
  });
});

describe("IssueTranscriptCommand — conditional writes / concurrency (Sprint 5A)", () => {
  // The fake DB cannot run two real transactions at once, so a lost race is
  // simulated by forcing a conditional `updateMany` to report `{ count: 0 }` —
  // exactly what the DB returns when a `WHERE status = <expected>` no longer
  // matches because a concurrent transaction already transitioned the row.
  function forceVersionUpdateNoop(matchStatus: string) {
    const model = h.db.academicTranscriptVersion;
    const real = model.updateMany;
    model.updateMany = (async (args: { where?: unknown; data?: { status?: string } }) => {
      if (args?.data?.status === matchStatus) return { count: 0 };
      return real(args as Parameters<typeof real>[0]);
    }) as typeof model.updateMany;
  }

  const issuedEvents = () =>
    published.events.filter((e) => e.eventType === "transcript.issued").length;
  const issuedAudit = () =>
    store("auditLog").filter((r) => (r as { action: string }).action === "transcript.issued").length;
  const issuedTxEvents = () =>
    store("academicTranscriptEvent").filter(
      (r) => (r as { eventType: string }).eventType === "transcript.issued"
    ).length;

  it("test-1 first issue of a DRAFT succeeds", async () => {
    seedRoot(h.db);
    seedVersion(h.db);
    const { version } = await issue();
    expect(version.status).toBe("ISSUED");
  });

  it("test-2 second issue of the same version fails once it has transitioned", async () => {
    seedRoot(h.db);
    seedVersion(h.db);
    await issue();
    await expect(issue()).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("test-3/4/5/6 second issue allocates no new number and emits/audits nothing extra", async () => {
    seedRoot(h.db, { transcriptNumber: null });
    seedVersion(h.db);
    await issue();
    expect(allocateTranscriptNumber).toHaveBeenCalledTimes(1);
    expect(issuedEvents()).toBe(1);
    expect(issuedAudit()).toBe(1);
    expect(issuedTxEvents()).toBe(1);

    await expect(issue()).rejects.toBeInstanceOf(BusinessRuleError);

    expect(allocateTranscriptNumber).toHaveBeenCalledTimes(1); // test-3: no new number
    expect(issuedEvents()).toBe(1); // test-4: no duplicate domain event
    expect(issuedAudit()).toBe(1); // test-5: no duplicate audit
    expect(issuedTxEvents()).toBe(1); // test-6: no duplicate transcript event
  });

  it("test-7 markVersionIssued losing the race (count 0) aborts and rolls everything back", async () => {
    seedRoot(h.db, { transcriptNumber: null });
    seedVersion(h.db);
    forceVersionUpdateNoop("ISSUED"); // conditional WHERE status='DRAFT' matched 0 rows
    await expect(issue()).rejects.toThrow(/no longer in DRAFT/);
    expect(published.events).toHaveLength(0);
    expect((store("academicTranscriptVersion")[0] as { status: string }).status).toBe("DRAFT");
    expect((store("academicTranscript")[0] as { transcriptNumber: string | null }).transcriptNumber).toBeNull();
    expect(store("academicTranscriptEvent")).toHaveLength(0);
    expect(store("auditLog")).toHaveLength(0);
  });

  it("test-8 supersede losing the race (count 0) aborts and rolls everything back", async () => {
    seedRoot(h.db, {
      status: "ISSUED", currentVersionId: "v-1", transcriptNumber: "TRN-2026-000001",
      issuedAt: new Date("2026-05-01"), issuedBy: "u-0",
    });
    seedVersion(h.db, { id: "v-1", versionNumber: 1, status: "ISSUED", issuedAt: new Date("2026-05-01"), issuedBy: "u-0" });
    seedVersion(h.db, { id: "v-2", versionNumber: 2, status: "DRAFT" });
    forceVersionUpdateNoop("SUPERSEDED"); // conditional WHERE status='ISSUED' matched 0 rows
    await expect(issue("v-2")).rejects.toThrow(/could not be superseded/);
    expect(published.events).toHaveLength(0);
    const v1 = store("academicTranscriptVersion").find((v) => (v as { id: string }).id === "v-1") as { status: string };
    const v2 = store("academicTranscriptVersion").find((v) => (v as { id: string }).id === "v-2") as { status: string };
    expect(v1.status).toBe("ISSUED"); // untouched
    expect(v2.status).toBe("DRAFT"); // untouched
    expect(store("auditLog")).toHaveLength(0);
    expect(store("academicTranscriptEvent")).toHaveLength(0);
  });

  it("test-11 root number guard losing the race (count 0) aborts and rolls everything back", async () => {
    seedRoot(h.db, { transcriptNumber: null });
    seedVersion(h.db);
    // The filtered root update (WHERE transcriptNumber IS NULL) lost to a
    // concurrent assignment → 0 rows matched.
    h.db.academicTranscript.updateMany = (async () => ({ count: 0 })) as typeof h.db.academicTranscript.updateMany;
    await expect(issue()).rejects.toThrow(/already assigned by another transaction/);
    expect(published.events).toHaveLength(0);
    expect((store("academicTranscriptVersion")[0] as { status: string }).status).toBe("DRAFT"); // rolled back
    expect(store("academicTranscriptEvent")).toHaveLength(0);
    expect(store("auditLog")).toHaveLength(0);
  });
});

// ── Architecture guards (#37–#41) ────────────────────────────────────────────
const ISSUE_SRC = readFileSync(
  join(process.cwd(), "src", "modules", "transcripts", "commands", "issue-transcript.command.ts"),
  "utf8"
);

describe("architecture guards — issue command stays in scope (#37–#41)", () => {
  it("#37/#38 does not import or call the Snapshot Builder", () => {
    expect(ISSUE_SRC).not.toMatch(/snapshot-builder|buildTranscriptSnapshot/);
  });
  it("#39 does not import PDF/export/UI", () => {
    expect(ISSUE_SRC).not.toMatch(/from ["'][^"']*(pdf|export|components)/i);
    expect(ISSUE_SRC).not.toMatch(/from ["']react/);
  });
  it("#40 does not import Grade/Attendance/Completion engines", () => {
    expect(ISSUE_SRC).not.toMatch(/GradeCalculation|AttendanceCalculation|CourseCompletion|grade-calculation|attendance-calculation/);
  });
  it("#41 does not write snapshot child rows (create* snapshot repos)", () => {
    expect(ISSUE_SRC).not.toMatch(/createLevelSnapshots|createSubjectSnapshots|createAssessmentSnapshots|createAttendanceSnapshots/);
    // reads are allowed (existence check)
    expect(ISSUE_SRC).toMatch(/findLevelSnapshotsByVersionId/);
  });
});
