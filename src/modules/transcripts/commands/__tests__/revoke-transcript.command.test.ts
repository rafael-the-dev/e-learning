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

import { AuthorizationError, BusinessRuleError, NotFoundError, ValidationError } from "@/shared/lib/command";
import type { ServiceContext } from "@/shared/types/common";
import { RevokeTranscriptCommand } from "../revoke-transcript.command";

const ctx: ServiceContext = { userId: "u-2", organizationId: ORG };
const store = (name: string) => h.db[name].__store;
const eventTypes = () => published.events.map((e) => e.eventType);

function revoke(transcriptVersionId: string, reason = "Erro nos dados", context: ServiceContext = ctx) {
  return new RevokeTranscriptCommand({ transcriptVersionId, reason }, context).run();
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

describe("RevokeTranscriptCommand — revoke the current ISSUED version (#20–#25)", () => {
  beforeEach(() => {
    seedRoot(h.db, {
      status: "ISSUED", currentVersionId: "v-1", transcriptNumber: "TRN-2026-000001",
      issuedAt: new Date("2026-05-01"), issuedBy: "u-0",
    });
    seedVersion(h.db, { id: "v-1", versionNumber: 1, status: "ISSUED", issuedAt: new Date("2026-05-01"), issuedBy: "u-0" });
  });

  it("#20 sets the version status to REVOKED (+revokedAt/By/reason)", async () => {
    const { version } = await revoke("v-1", "Dados incorretos");
    expect(version.status).toBe("REVOKED");
    expect(version.revokedAt).toBeInstanceOf(Date);
    expect(version.revokedBy).toBe("u-2");
    expect(version.revokeReason).toBe("Dados incorretos");
  });

  it("#21 clears the root currentVersionId", async () => {
    const { transcript } = await revoke("v-1");
    expect(transcript.currentVersionId).toBeNull();
  });

  it("#22 flags the root needsRegeneration = true", async () => {
    const { transcript } = await revoke("v-1");
    expect(transcript.needsRegeneration).toBe(true);
  });

  it("#23 sets staleReason = CURRENT_VERSION_REVOKED (+staleDetectedAt)", async () => {
    const { transcript } = await revoke("v-1");
    expect(transcript.staleReason).toBe("CURRENT_VERSION_REVOKED");
    expect(transcript.staleDetectedAt).toBeInstanceOf(Date);
  });

  it("#24 emits transcript.revoked after commit", async () => {
    await revoke("v-1", "Motivo X");
    expect(eventTypes()).toEqual(["transcript.revoked"]);
    const ev = published.events[0];
    expect(ev.payload).toMatchObject({
      transcriptId: "tr-1", transcriptVersionId: "v-1",
      previousStatus: "ISSUED", newStatus: "REVOKED", reason: "Motivo X",
    });
  });

  it("#25 writes an AuditLog and an AcademicTranscriptEvent", async () => {
    await revoke("v-1");
    expect(store("auditLog").some((r) => (r as { action: string }).action === "transcript.revoked")).toBe(true);
    expect(store("academicTranscriptEvent").some((r) => (r as { eventType: string }).eventType === "transcript.revoked")).toBe(true);
  });
});

describe("RevokeTranscriptCommand — non-current + guards (#26–#33)", () => {
  it("#26/#27 revokes a non-current SUPERSEDED version and leaves currentVersionId unchanged", async () => {
    seedRoot(h.db, { status: "ISSUED", currentVersionId: "v-2", transcriptNumber: "TRN-2026-000001" });
    seedVersion(h.db, { id: "v-1", versionNumber: 1, status: "SUPERSEDED", supersededAt: new Date("2026-05-01") });
    seedVersion(h.db, { id: "v-2", versionNumber: 2, status: "ISSUED", issuedAt: new Date("2026-05-02") });

    const { version, transcript } = await revoke("v-1");
    expect(version.status).toBe("REVOKED");
    expect(transcript.currentVersionId).toBe("v-2"); // unchanged
    expect(transcript.needsRegeneration).toBe(false);
  });

  it("#28 cannot revoke a DRAFT version", async () => {
    seedRoot(h.db);
    seedVersion(h.db, { id: "v-1", status: "DRAFT" });
    await expect(revoke("v-1")).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("#29 cannot revoke an already REVOKED version", async () => {
    seedRoot(h.db, { status: "ISSUED" });
    seedVersion(h.db, { id: "v-1", status: "REVOKED", revokedAt: new Date(), revokedBy: "x", revokeReason: "old" });
    await expect(revoke("v-1")).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("#30 cannot revoke without a reason", async () => {
    seedRoot(h.db, { status: "ISSUED", currentVersionId: "v-1" });
    seedVersion(h.db, { id: "v-1", status: "ISSUED" });
    await expect(revoke("v-1", "")).rejects.toBeInstanceOf(ValidationError);
  });

  it("#31 cannot revoke a cross-tenant version", async () => {
    seedRoot(h.db, { status: "ISSUED", currentVersionId: "v-1" });
    seedVersion(h.db, { id: "v-1", status: "ISSUED" });
    await expect(revoke("v-1", "motivo", { userId: "u-x", organizationId: OTHER_ORG })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("#32 cannot revoke without permission", async () => {
    authState.allow = false;
    seedRoot(h.db, { status: "ISSUED", currentVersionId: "v-1" });
    seedVersion(h.db, { id: "v-1", status: "ISSUED" });
    await expect(revoke("v-1")).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("#33 does not delete anything and does not mutate snapshot child rows", async () => {
    seedRoot(h.db, { status: "ISSUED", currentVersionId: "v-1" });
    seedVersion(h.db, { id: "v-1", status: "ISSUED" });
    const versionCount = store("academicTranscriptVersion").length;
    const rootCount = store("academicTranscript").length;
    const snapshotCounts = SNAPSHOT_MODELS.map((m) => store(m).length);
    const snapshotsBefore = SNAPSHOT_MODELS.map((m) => JSON.stringify(store(m)));

    await revoke("v-1");

    expect(store("academicTranscriptVersion")).toHaveLength(versionCount);
    expect(store("academicTranscript")).toHaveLength(rootCount);
    SNAPSHOT_MODELS.forEach((m, i) => expect(store(m)).toHaveLength(snapshotCounts[i]));
    expect(SNAPSHOT_MODELS.map((m) => JSON.stringify(store(m)))).toEqual(snapshotsBefore);
  });

  it("rolls back and emits nothing when a write fails", async () => {
    seedRoot(h.db, { status: "ISSUED", currentVersionId: "v-1" });
    seedVersion(h.db, { id: "v-1", status: "ISSUED" });
    h.db.academicTranscriptEvent.create = async () => {
      throw new Error("boom");
    };
    await expect(revoke("v-1")).rejects.toThrow(/boom/);
    expect(published.events).toHaveLength(0);
    expect((store("academicTranscriptVersion")[0] as { status: string }).status).toBe("ISSUED"); // rolled back
  });
});

describe("RevokeTranscriptCommand — root status consistency (Sprint 5B, D3 all-revoked)", () => {
  it("test-1 revoking the single issued version flips root.status to REVOKED", async () => {
    seedRoot(h.db, { status: "ISSUED", currentVersionId: "v-1", transcriptNumber: "TRN-2026-000001" });
    seedVersion(h.db, { id: "v-1", status: "ISSUED", issuedAt: new Date("2026-05-01"), issuedBy: "u-0" });
    const { transcript, version } = await revoke("v-1");
    expect(version.status).toBe("REVOKED");
    expect(transcript.status).toBe("REVOKED"); // test-1
    expect(transcript.currentVersionId).toBeNull(); // test-5
    expect(transcript.needsRegeneration).toBe(true); // test-6
    expect(transcript.staleReason).toBe("CURRENT_VERSION_REVOKED"); // test-7
    expect(transcript.staleDetectedAt).toBeInstanceOf(Date);
  });

  it("test-2 revoking the current version keeps root.status ISSUED while a SUPERSEDED version survives", async () => {
    seedRoot(h.db, { status: "ISSUED", currentVersionId: "v-2", transcriptNumber: "TRN-2026-000001" });
    seedVersion(h.db, { id: "v-1", versionNumber: 1, status: "SUPERSEDED", supersededAt: new Date("2026-05-01") });
    seedVersion(h.db, { id: "v-2", versionNumber: 2, status: "ISSUED", issuedAt: new Date("2026-05-02") });
    const { transcript } = await revoke("v-2");
    expect(transcript.status).toBe("ISSUED"); // test-2: SUPERSEDED still active
    expect(transcript.currentVersionId).toBeNull(); // test-5: not auto-repointed
    expect(transcript.needsRegeneration).toBe(true); // test-6
    expect(transcript.staleReason).toBe("CURRENT_VERSION_REVOKED"); // test-7
  });

  it("test-3 revoking the last remaining (SUPERSEDED) version flips root.status to REVOKED", async () => {
    seedRoot(h.db, { status: "ISSUED", currentVersionId: "v-2", transcriptNumber: "TRN-2026-000001" });
    seedVersion(h.db, { id: "v-1", versionNumber: 1, status: "SUPERSEDED", supersededAt: new Date("2026-05-01") });
    seedVersion(h.db, { id: "v-2", versionNumber: 2, status: "ISSUED", issuedAt: new Date("2026-05-02") });

    await revoke("v-2"); // current → currentVersionId null, root still ISSUED
    const afterFirst = store("academicTranscript")[0] as { status: string; currentVersionId: string | null };
    expect(afterFirst.status).toBe("ISSUED");
    expect(afterFirst.currentVersionId).toBeNull();

    const { transcript } = await revoke("v-1"); // last active version → root REVOKED
    expect(transcript.status).toBe("REVOKED"); // test-3
    expect(transcript.currentVersionId).toBeNull(); // still null (no auto-reactivation)
  });

  it("test-4 non-current revoke leaves root.status/currentVersionId/flags unchanged when another version is active", async () => {
    seedRoot(h.db, {
      status: "ISSUED", currentVersionId: "v-2", transcriptNumber: "TRN-2026-000001", needsRegeneration: false,
    });
    seedVersion(h.db, { id: "v-1", versionNumber: 1, status: "SUPERSEDED", supersededAt: new Date("2026-05-01") });
    seedVersion(h.db, { id: "v-2", versionNumber: 2, status: "ISSUED", issuedAt: new Date("2026-05-02") });

    const { transcript, version } = await revoke("v-1"); // non-current, another version active
    expect(version.status).toBe("REVOKED");
    expect(transcript.status).toBe("ISSUED"); // test-4: unchanged
    expect(transcript.currentVersionId).toBe("v-2"); // unchanged
    expect(transcript.needsRegeneration).toBe(false); // unchanged
    expect(transcript.staleReason).toBeNull(); // unchanged
  });
});

describe("RevokeTranscriptCommand — conditional writes / concurrency (Sprint 5A)", () => {
  const revokedEvents = () =>
    published.events.filter((e) => e.eventType === "transcript.revoked").length;
  const revokedAudit = () =>
    store("auditLog").filter((r) => (r as { action: string }).action === "transcript.revoked").length;
  const revokedTxEvents = () =>
    store("academicTranscriptEvent").filter(
      (r) => (r as { eventType: string }).eventType === "transcript.revoked"
    ).length;

  it("test-9 markVersionRevoked losing the race (count 0) aborts and emits nothing", async () => {
    seedRoot(h.db, { status: "ISSUED", currentVersionId: "v-1" });
    seedVersion(h.db, { id: "v-1", status: "ISSUED" });
    // Conditional WHERE status IN (ISSUED, SUPERSEDED) matched 0 rows — a
    // concurrent transaction already revoked it.
    const model = h.db.academicTranscriptVersion;
    const real = model.updateMany;
    model.updateMany = (async (args: { where?: unknown; data?: { status?: string } }) => {
      if (args?.data?.status === "REVOKED") return { count: 0 };
      return real(args as Parameters<typeof real>[0]);
    }) as typeof model.updateMany;

    await expect(revoke("v-1")).rejects.toThrow(/no longer revocable/);
    expect(published.events).toHaveLength(0);
    expect((store("academicTranscriptVersion")[0] as { status: string }).status).toBe("ISSUED"); // rolled back
    expect(store("auditLog")).toHaveLength(0);
    expect(store("academicTranscriptEvent")).toHaveLength(0);
  });

  it("test-10 double revoke: the second attempt fails and duplicates nothing", async () => {
    seedRoot(h.db, { status: "ISSUED", currentVersionId: "v-1" });
    seedVersion(h.db, { id: "v-1", status: "ISSUED" });
    await revoke("v-1", "Motivo");
    expect(revokedEvents()).toBe(1);

    await expect(revoke("v-1", "Outra vez")).rejects.toBeInstanceOf(BusinessRuleError);

    expect(revokedEvents()).toBe(1);
    expect(revokedAudit()).toBe(1);
    expect(revokedTxEvents()).toBe(1);
  });
});

describe("RevokeTranscriptCommand — allRevoked-only root update is optimistically guarded (M1)", () => {
  // The revoked version is NON-current (currentVersionId already null because the
  // current version was revoked earlier) and is the LAST non-REVOKED version, so
  // the command must flip root.status → REVOKED. That status write is now guarded
  // (expectStatus + expected pointer); a lost guard rolls the whole tx back.
  function seedLastActiveNonCurrent() {
    seedRoot(h.db, {
      status: "ISSUED", currentVersionId: null, transcriptNumber: "TRN-2026-000001",
      issuedAt: new Date("2026-05-01"), issuedBy: "u-0",
    });
    // A single surviving SUPERSEDED version; the former current version was
    // revoked in an earlier operation (hence currentVersionId already null).
    seedVersion(h.db, { id: "v-1", versionNumber: 1, status: "SUPERSEDED", supersededAt: new Date("2026-05-01") });
  }

  it("M1-1 last-active non-current revoke sets root.status = REVOKED", async () => {
    seedLastActiveNonCurrent();
    const { transcript, version } = await revoke("v-1");
    expect(version.status).toBe("REVOKED");
    expect(transcript.status).toBe("REVOKED"); // M1-1
    expect(transcript.currentVersionId).toBeNull(); // stays null (no auto-repoint)
  });

  it("M1-2/3/4/5 a lost root-status guard (count 0) aborts and writes nothing", async () => {
    seedLastActiveNonCurrent();
    // Simulate a concurrent transition: the guarded root update matches 0 rows.
    h.db.academicTranscript.updateMany = (async () => ({ count: 0 })) as typeof h.db.academicTranscript.updateMany;

    await expect(revoke("v-1")).rejects.toThrow(/changed concurrently during revoke/);

    // M1-3: no domain event. M1-4: no audit. M1-5: no transcript-event.
    expect(published.events).toHaveLength(0);
    expect(store("auditLog")).toHaveLength(0);
    expect(store("academicTranscriptEvent")).toHaveLength(0);
    // Version revoke rolled back, root untouched.
    expect((store("academicTranscriptVersion")[0] as { status: string }).status).toBe("SUPERSEDED");
    expect((store("academicTranscript")[0] as { status: string }).status).toBe("ISSUED");
  });
});

// ── Architecture guards (#37, #39–#41) ───────────────────────────────────────
const REVOKE_SRC = readFileSync(
  join(process.cwd(), "src", "modules", "transcripts", "commands", "revoke-transcript.command.ts"),
  "utf8"
);

describe("architecture guards — revoke command stays in scope", () => {
  it("does not import or call the Snapshot Builder", () => {
    expect(REVOKE_SRC).not.toMatch(/snapshot-builder|buildTranscriptSnapshot/);
  });
  it("does not import PDF/export/UI/react", () => {
    expect(REVOKE_SRC).not.toMatch(/from ["'][^"']*(pdf|export|components)/i);
    expect(REVOKE_SRC).not.toMatch(/from ["']react/);
  });
  it("does not import Grade/Attendance/Completion engines", () => {
    expect(REVOKE_SRC).not.toMatch(/GradeCalculation|AttendanceCalculation|CourseCompletion|grade-calculation|attendance-calculation/);
  });
  it("does not write or delete snapshot child rows", () => {
    expect(REVOKE_SRC).not.toMatch(/createLevelSnapshots|createSubjectSnapshots|createAssessmentSnapshots|createAttendanceSnapshots/);
    expect(REVOKE_SRC).not.toMatch(/\.delete\s*\(|\.deleteMany\s*\(/);
  });
});
