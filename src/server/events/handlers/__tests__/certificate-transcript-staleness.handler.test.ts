import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  makeFakeDb,
  seed,
  type FakeDb,
} from "@/modules/certificates/repositories/__tests__/_fake-db";

// =============================================================================
// CertificateTranscriptStalenessHandler — Phase 9 tests (1–13)
// -----------------------------------------------------------------------------
// Drives the transcript-staleness event handler against the rollback-capable fake
// DB with a mocked event publisher. Real certificate repositories + the shared
// applier run. Asserts the transcript→certificate STALE reaction, the public
// verification projection, the SUSPENDED/REVOKED/pre-issue rules, idempotency (no
// duplicate event/audit/domain event), that only the EVENT PAYLOAD is used (never a
// transcript table), and the missing-certificate no-op.
// =============================================================================

const h = vi.hoisted(() => ({ db: null as unknown as FakeDb }));
const published = vi.hoisted(() => ({ events: [] as Array<Record<string, unknown>> }));

vi.mock("@/server/db", () => ({ getDb: vi.fn(async () => h.db) }));
vi.mock("@/server/events/event-publisher", () => ({
  eventPublisher: { publish: vi.fn(async (e: Record<string, unknown>) => void published.events.push(e)) },
}));

import { DomainEventType } from "@/server/events/event-types";
import type { PersistedDomainEvent } from "@/server/events/domain-event";
import { certificateOutbox } from "@/modules/certificates/outbox";
import { CertificateTranscriptStalenessHandler } from "../certificate-transcript-staleness.handler";

const ORG = "org-A";
const FIXED = new Date("2026-07-08T00:00:00.000Z");
const store = (name: string) => h.db[name].__store;
const certById = (id: string) => store("certificate").find((c) => c.id === id) as Record<string, unknown>;
const verifByCert = (id: string) =>
  store("certificateVerification").find((v) => v.certificateId === id) as Record<string, unknown>;
const staleEvents = () => store("certificateEvent").filter((e) => e.eventType === "certificate.marked_stale");
const staleAudits = () => store("auditLog").filter((a) => a.action === "certificate.marked_stale");
const staleDomain = () => published.events.filter((e) => e.eventType === "certificate.marked_stale");

const handler = new CertificateTranscriptStalenessHandler();

function seedCert(id: string, overrides: Record<string, unknown> = {}): void {
  seed(h.db, "certificate", {
    id,
    organizationId: ORG,
    studentId: "stu-1",
    transcriptVersionId: "ver-1",
    transcriptNumber: "TR-2026-000001",
    transcriptChecksum: "chk-1",
    certificateNumber: "CERT-2026-000001",
    certificateType: "COURSE_COMPLETION",
    status: "ISSUED",
    studentSnapshot: "{}",
    issueBasisSnapshot: "{}",
    financialClearanceStatus: "NOT_REQUIRED",
    checksum: "sum-1",
    staleReason: null,
    staleDetectedAt: null,
    deletedAt: null,
    ...overrides,
  });
}

function seedVerification(certId: string, overrides: Record<string, unknown> = {}): void {
  seed(h.db, "certificateVerification", {
    id: `vrow-${certId}`,
    organizationId: ORG,
    certificateId: certId,
    verificationCode: `vc-${certId}`,
    publicStatus: "VALID",
    verificationCount: 0,
    ...overrides,
  });
}

function transcriptEvent(
  eventType: string,
  overrides: Partial<PersistedDomainEvent> & { payload?: Record<string, unknown> } = {}
): PersistedDomainEvent {
  return {
    id: "evt-1",
    organizationId: ORG,
    eventType: eventType as PersistedDomainEvent["eventType"],
    aggregateType: "TRANSCRIPT",
    aggregateId: "tr-1",
    payload: { transcriptVersionId: "ver-1", transcriptNumber: "TR-2026-000001", ...(overrides.payload ?? {}) },
    status: "PENDING",
    occurredAt: FIXED,
    retryCount: 0,
    createdAt: FIXED,
    updatedAt: FIXED,
    ...overrides,
  } as PersistedDomainEvent;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.db = makeFakeDb();
  published.events.length = 0;
  certificateOutbox.reset();
});
afterEach(() => vi.restoreAllMocks());

describe("CertificateTranscriptStalenessHandler — canHandle", () => {
  it("handles the three transcript lifecycle events and ignores others", () => {
    expect(handler.canHandle(transcriptEvent(DomainEventType.TRANSCRIPT_SUPERSEDED))).toBe(true);
    expect(handler.canHandle(transcriptEvent(DomainEventType.TRANSCRIPT_REVOKED))).toBe(true);
    expect(handler.canHandle(transcriptEvent(DomainEventType.TRANSCRIPT_MARKED_STALE))).toBe(true);
    expect(handler.canHandle(transcriptEvent(DomainEventType.TRANSCRIPT_ISSUED))).toBe(false);
    expect(handler.canHandle(transcriptEvent(DomainEventType.CERTIFICATE_ISSUED))).toBe(false);
  });
});

describe("CertificateTranscriptStalenessHandler — staleness reaction", () => {
  it.each([
    ["1. transcript.superseded", DomainEventType.TRANSCRIPT_SUPERSEDED, "TRANSCRIPT_SUPERSEDED"],
    ["2. transcript.revoked", DomainEventType.TRANSCRIPT_REVOKED, "TRANSCRIPT_REVOKED"],
    ["3. transcript.marked_stale", DomainEventType.TRANSCRIPT_MARKED_STALE, "TRANSCRIPT_MARKED_STALE"],
  ])("%s marks an ISSUED certificate STALE with the mapped reason", async (_label, eventType, reason) => {
    seedCert("cert-1"); seedVerification("cert-1");
    await handler.handle(transcriptEvent(eventType));

    expect(certById("cert-1").status).toBe("STALE");
    expect(certById("cert-1").staleReason).toBe(reason);
    expect(certById("cert-1").staleDetectedAt).toBeInstanceOf(Date);
  });

  it("4. the public verification projection becomes SUSPENDED", async () => {
    seedCert("cert-1"); seedVerification("cert-1");
    await handler.handle(transcriptEvent(DomainEventType.TRANSCRIPT_SUPERSEDED));
    expect(verifByCert("cert-1").publicStatus).toBe("SUSPENDED");
    // Event + audit + domain event, all with a null system actor.
    expect(staleEvents()).toHaveLength(1);
    expect(staleEvents()[0].actorId).toBeNull();
    expect(staleAudits()).toHaveLength(1);
    expect(staleAudits()[0].actorId).toBeNull();
    expect(staleDomain()).toHaveLength(1);
  });

  it("5. a SUSPENDED certificate keeps status SUSPENDED but records stale metadata", async () => {
    seedCert("cert-1", { status: "SUSPENDED", suspendedBy: "u-0", suspendReason: "x" });
    seedVerification("cert-1", { publicStatus: "SUSPENDED" });
    await handler.handle(transcriptEvent(DomainEventType.TRANSCRIPT_REVOKED));

    expect(certById("cert-1").status).toBe("SUSPENDED"); // NOT overwritten by STALE
    expect(certById("cert-1").staleReason).toBe("TRANSCRIPT_REVOKED");
    expect(certById("cert-1").staleDetectedAt).toBeInstanceOf(Date);
    expect(verifByCert("cert-1").publicStatus).toBe("SUSPENDED");
    expect(staleEvents()).toHaveLength(1);
  });

  it("6. a REVOKED certificate is left unchanged (no write, no event)", async () => {
    seedCert("cert-1", { status: "REVOKED", revokedBy: "u-0", revokeReason: "x" });
    seedVerification("cert-1", { publicStatus: "REVOKED" });
    await handler.handle(transcriptEvent(DomainEventType.TRANSCRIPT_REVOKED));

    expect(certById("cert-1").status).toBe("REVOKED");
    expect(certById("cert-1").staleReason).toBeNull();
    expect(verifByCert("cert-1").publicStatus).toBe("REVOKED");
    expect(staleEvents()).toHaveLength(0);
    expect(staleAudits()).toHaveLength(0);
    expect(staleDomain()).toHaveLength(0);
  });

  it.each(["DRAFT", "PENDING_APPROVAL"])("7. a %s certificate is left unchanged", async (status) => {
    // Pre-issue drafts are excluded by the handler's status filter → never loaded.
    seedCert("cert-1", { status });
    seedVerification("cert-1", { publicStatus: "NOT_FOUND" });
    await handler.handle(transcriptEvent(DomainEventType.TRANSCRIPT_SUPERSEDED));

    expect(certById("cert-1").status).toBe(status);
    expect(certById("cert-1").staleReason).toBeNull();
    expect(staleEvents()).toHaveLength(0);
  });
});

describe("CertificateTranscriptStalenessHandler — idempotency (8–11)", () => {
  it("8/9/10/11. a repeated identical event is a no-op — no duplicate event/audit/domain event", async () => {
    seedCert("cert-1"); seedVerification("cert-1");
    const event = transcriptEvent(DomainEventType.TRANSCRIPT_SUPERSEDED);

    await handler.handle(event);
    await handler.handle(event); // duplicate delivery

    expect(certById("cert-1").status).toBe("STALE");
    expect(staleEvents()).toHaveLength(1); // 9
    expect(staleAudits()).toHaveLength(1); // 10
    expect(staleDomain()).toHaveLength(1); // 11
  });
});

describe("CertificateTranscriptStalenessHandler — sources & missing targets", () => {
  it("12. uses ONLY the event payload — succeeds with no transcript rows present", async () => {
    // No transcript table is seeded; the reaction still fires from the payload alone.
    seedCert("cert-1"); seedVerification("cert-1");
    await handler.handle(transcriptEvent(DomainEventType.TRANSCRIPT_MARKED_STALE));
    expect(certById("cert-1").status).toBe("STALE");
  });

  it("13. no linked certificate → clean no-op", async () => {
    // A certificate exists but on a DIFFERENT transcript version.
    seedCert("cert-other", { transcriptVersionId: "ver-OTHER" });
    seedVerification("cert-other");
    await handler.handle(transcriptEvent(DomainEventType.TRANSCRIPT_SUPERSEDED));

    expect(certById("cert-other").status).toBe("ISSUED");
    expect(staleEvents()).toHaveLength(0);
    expect(staleDomain()).toHaveLength(0);
  });

  it("ignores an event with no transcriptVersionId in the payload", async () => {
    seedCert("cert-1"); seedVerification("cert-1");
    await handler.handle(transcriptEvent(DomainEventType.TRANSCRIPT_SUPERSEDED, { payload: { transcriptVersionId: undefined } }));
    expect(certById("cert-1").status).toBe("ISSUED");
  });
});

// ─── Phase 14 — publishes through the Outbox (single seam), not directly ───────
describe("CertificateTranscriptStalenessHandler — Outbox routing (Phase 14)", () => {
  it("sends the certificate.marked_stale event THROUGH the Outbox (enqueue → publish)", async () => {
    seedCert("cert-1"); seedVerification("cert-1");
    const dispatchSpy = vi.spyOn(certificateOutbox, "dispatch");

    await handler.handle(transcriptEvent(DomainEventType.TRANSCRIPT_SUPERSEDED));

    // Routed via the Outbox exactly once, carrying the marked_stale event...
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const dispatched = dispatchSpy.mock.calls[0][0];
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]).toMatchObject({
      eventType: DomainEventType.CERTIFICATE_MARKED_STALE,
      aggregateId: "cert-1",
    });
    // ...and the Outbox recorded + delivered it (no dead letter).
    expect(certificateOutbox.summary()).toMatchObject({ total: 1, delivered: 1, failed: 0 });
    // The underlying publisher still received it (delivery happened via the Outbox).
    expect(staleDomain()).toHaveLength(1);
  });

  it("a loaded-but-idempotent reaction dispatches an empty batch (nothing enqueued)", async () => {
    // A STALE certificate already carrying the SAME reason IS loaded (STALE is a
    // relevant status) but the applier no-ops it → an empty Outbox batch.
    seedCert("cert-1", { status: "STALE", staleReason: "TRANSCRIPT_MARKED_STALE", staleDetectedAt: FIXED });
    seedVerification("cert-1", { publicStatus: "SUSPENDED" });
    const dispatchSpy = vi.spyOn(certificateOutbox, "dispatch");

    await handler.handle(transcriptEvent(DomainEventType.TRANSCRIPT_MARKED_STALE));

    expect(dispatchSpy).toHaveBeenCalledWith([]);
    expect(certificateOutbox.summary()).toMatchObject({ total: 0 });
    expect(staleDomain()).toHaveLength(0);
  });

  it("the handler source publishes ONLY through the Outbox (no direct eventPublisher)", () => {
    const src = readFileSync(
      join(process.cwd(), "src", "server", "events", "handlers", "certificate-transcript-staleness.handler.ts"),
      "utf8"
    );
    expect(src).not.toMatch(/eventPublisher/);
    expect(src).not.toMatch(/event-publisher/);
    expect(src).toMatch(/certificateOutbox\.dispatch/);
  });
});
