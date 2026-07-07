import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, type FakeDb } from "../../repositories/__tests__/_fake-db";
import { ORG, seedRoot, seedVersion } from "./_lifecycle-fixtures";

// =============================================================================
// Phase 5 — C1 regression: transcript numbering is a single sequence per
// (organization, year), NOT per transcriptType. The number format is type-less
// (TRN-YYYY-NNNNNN) and `AcademicTranscript` is unique per (org, transcriptNumber),
// so a per-type counter produced colliding numbers (both types → TRN-2026-000001).
//
// This suite drives IssueTranscriptCommand with the REAL `allocateTranscriptNumber`
// (deliberately NOT mocked) against the in-memory fake DB, so the counter is
// actually incremented and shared across transcript types. The fake DB does not
// enforce the per-org unique index, so the collision is proven by asserting the
// numbers DIFFER (000001, 000002) rather than by expecting a DB throw.
// =============================================================================

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
// allocateTranscriptNumber is intentionally NOT mocked here.

import type { ServiceContext } from "@/shared/types/common";
import { BusinessRuleError } from "@/shared/lib/command";
import { IssueTranscriptCommand } from "../issue-transcript.command";

const ctx: ServiceContext = { userId: "u-1", organizationId: ORG };
const store = (name: string) => h.db[name].__store;

function issue(transcriptVersionId: string) {
  return new IssueTranscriptCommand({ transcriptVersionId }, ctx).run();
}

beforeEach(() => {
  vi.clearAllMocks();
  // Freeze the clock so `now.getFullYear()` (and thus the year segment) is
  // deterministic regardless of when the suite runs.
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-15T00:00:00.000Z"));
  h.db = makeFakeDb();
  authState.allow = true;
  published.events.length = 0;
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("IssueTranscriptCommand — numbering is per (organization, year), not per type (C1)", () => {
  it("issues two different transcript types in the same org/year with sequential, non-colliding numbers", async () => {
    seedRoot(h.db, { id: "tr-course", transcriptType: "COURSE_TRANSCRIPT", transcriptNumber: null });
    seedVersion(h.db, { id: "v-course", transcriptId: "tr-course" });
    seedRoot(h.db, { id: "tr-cert", transcriptType: "CERTIFICATE_SUPPORT", transcriptNumber: null });
    seedVersion(h.db, { id: "v-cert", transcriptId: "tr-cert" });

    const course = await issue("v-course");
    const cert = await issue("v-cert");

    expect(course.transcript.transcriptNumber).toBe("TRN-2026-000001");
    expect(cert.transcript.transcriptNumber).toBe("TRN-2026-000002");
    expect(course.transcript.transcriptNumber).not.toBe(cert.transcript.transcriptNumber);

    // One shared counter row for (org, year), now at 2.
    const counters = store("transcriptNumberCounter");
    expect(counters).toHaveLength(1);
    expect((counters[0] as { lastSeq: number }).lastSeq).toBe(2);
  });

  it("rolls back the counter increment when a later write in the issue transaction fails", async () => {
    seedRoot(h.db, { transcriptNumber: null });
    seedVersion(h.db);
    // Poison the transcript-event insert (fires after the number is allocated).
    h.db.academicTranscriptEvent.create = async () => {
      throw new Error("boom: event insert failed");
    };

    await expect(issue("v-1")).rejects.toThrow(/boom/);

    // The counter row created mid-transaction is discarded on rollback.
    expect(store("transcriptNumberCounter")).toHaveLength(0);
    expect((store("academicTranscript")[0] as { transcriptNumber: string | null }).transcriptNumber).toBeNull();
    expect(published.events).toHaveLength(0);
  });

  it("keeps the issued number stable and allocates no second number on a repeated issue", async () => {
    seedRoot(h.db, { transcriptNumber: null });
    seedVersion(h.db);

    const first = await issue("v-1");
    expect(first.transcript.transcriptNumber).toBe("TRN-2026-000001");

    // Repeated issue of the same (now ISSUED) version fails without touching the number.
    await expect(issue("v-1")).rejects.toBeInstanceOf(BusinessRuleError);

    expect((store("academicTranscript")[0] as { transcriptNumber: string }).transcriptNumber).toBe(
      "TRN-2026-000001"
    );
    const counters = store("transcriptNumberCounter");
    expect(counters).toHaveLength(1);
    expect((counters[0] as { lastSeq: number }).lastSeq).toBe(1);
  });
});
