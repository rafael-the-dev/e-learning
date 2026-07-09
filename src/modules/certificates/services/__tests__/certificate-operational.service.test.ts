import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, seed, type FakeDb } from "../../repositories/__tests__/_fake-db";

// =============================================================================
// CertificateOperationalService — Phase 14 tests
// -----------------------------------------------------------------------------
// The composed dashboard DTO (health + maintenance + outbox summary) + the
// sanitized outbox summary endpoint + authz. Uses the fake DB for the read
// services and the shared outbox singleton for the delivery summary.
// =============================================================================

const h = vi.hoisted(() => ({ db: null as unknown as FakeDb }));
vi.mock("@/server/db", () => ({ getDb: vi.fn(async () => h.db) }));
vi.mock("@/server/events/event-publisher", () => ({ eventPublisher: { publish: vi.fn(async () => {}) } }));

import { AuthorizationError } from "@/shared/lib/command";
import { PERMISSIONS } from "@/server/auth/permissions";
import type { AuthContext } from "@/server/auth/context";
import { DomainAggregateType, DomainEventType } from "@/server/events/event-types";
import { certificateOutbox } from "../../outbox";
import { CertificateOperationalService } from "../certificate-operational.service";

const ORG = "org-A";
const NOW = new Date("2026-07-09T10:00:00.000Z");

function ctx(perms: string[] = [PERMISSIONS.CERTIFICATES_VIEW]): AuthContext {
  const set = new Set(perms);
  return { userId: "u-1", organizationId: ORG, roles: [], ability: { can: (p: string) => set.has(p) } } as unknown as AuthContext;
}

const service = new CertificateOperationalService();

beforeEach(() => {
  vi.clearAllMocks();
  h.db = makeFakeDb();
  certificateOutbox.reset();
  seed(h.db, "certificate", { id: "c1", organizationId: ORG, status: "ISSUED", deletedAt: null });
});
afterEach(() => vi.restoreAllMocks());

describe("getDashboard", () => {
  it("composes health + maintenance + outbox summary with a shared generatedAt", async () => {
    await certificateOutbox.dispatch(
      [
        {
          organizationId: ORG,
          eventType: DomainEventType.CERTIFICATE_ISSUED,
          aggregateType: DomainAggregateType.CERTIFICATE,
          aggregateId: "c1",
          payload: { certificateId: "c1" },
        },
      ],
      NOW
    );

    const dash = await service.getDashboard(ctx(), NOW);
    expect(dash.generatedAt).toEqual(NOW);
    expect(dash.health).toMatchObject({ totalCertificates: 1, issued: 1 });
    expect(dash.maintenance).toHaveProperty("orphanExports");
    expect(dash.maintenance).toHaveProperty("verificationProjectionMismatches");
    expect(dash.outbox).toMatchObject({ total: 1, delivered: 1 });
    // §7 — the dashboard carries windowed metrics (today / 7d / 30d).
    expect(dash.metrics).toHaveProperty("today");
    expect(dash.metrics).toHaveProperty("last7Days");
    expect(dash.metrics).toHaveProperty("last30Days");
    expect(dash.metrics.today).toHaveProperty("generate");
    expect(dash.metrics.generatedAt).toEqual(NOW);
  });

  it("requires certificates.view", async () => {
    await expect(service.getDashboard(ctx([]), NOW)).rejects.toBeInstanceOf(AuthorizationError);
  });
});

describe("getOutboxSummary", () => {
  it("returns a sanitized summary (counts + dead-letter, no payloads)", async () => {
    certificateOutbox.enqueue(
      {
        organizationId: ORG,
        eventType: DomainEventType.CERTIFICATE_ISSUED,
        aggregateType: DomainAggregateType.CERTIFICATE,
        aggregateId: "c1",
        payload: { certificateId: "c1", studentId: "stu-secret" },
      },
      NOW
    );
    const summary = await service.getOutboxSummary(ctx());
    expect(summary).toMatchObject({ total: 1, pending: 1 });
    expect(JSON.stringify(summary)).not.toContain("stu-secret");
  });

  it("requires certificates.view", async () => {
    await expect(service.getOutboxSummary(ctx([]))).rejects.toBeInstanceOf(AuthorizationError);
  });
});
