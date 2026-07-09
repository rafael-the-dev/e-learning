import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// =============================================================================
// Certificate operational routes — Phase 14 (auth + DTO passthrough + delegation)
// -----------------------------------------------------------------------------
// GET /api/certificates/{health,maintenance,metrics,outbox} are thin shells:
// authenticate → read service → JSON. They add no repository logic / business
// rules. These tests mock the services and assert delegation + auth mapping.
// =============================================================================

const auth = vi.hoisted(() => ({ ctx: null as unknown, fail: false }));
const svc = vi.hoisted(() => ({
  health: vi.fn(async () => ({ kind: "health" })),
  maintenance: vi.fn(async () => ({ kind: "maintenance" })),
  metrics: vi.fn(async () => ({ kind: "metrics" })),
  outbox: vi.fn(async () => ({ kind: "outbox" })),
  throwErr: null as unknown,
}));

vi.mock("@/server/auth/context", () => ({
  requireOrganization: vi.fn(async () => {
    if (auth.fail) throw new Error("unauth");
    return auth.ctx;
  }),
}));
vi.mock("@/modules/certificates/services/certificate-health.service", () => ({
  certificateHealthService: {
    getHealth: () => {
      if (svc.throwErr) throw svc.throwErr;
      return svc.health();
    },
  },
}));
vi.mock("@/modules/certificates/services/certificate-maintenance.service", () => ({
  certificateMaintenanceService: {
    getReport: () => {
      if (svc.throwErr) throw svc.throwErr;
      return svc.maintenance();
    },
  },
}));
vi.mock("@/modules/certificates/services/certificate-metrics.service", () => ({
  certificateMetricsService: {
    getMetrics: () => {
      if (svc.throwErr) throw svc.throwErr;
      return svc.metrics();
    },
  },
}));
vi.mock("@/modules/certificates/services/certificate-operational.service", () => ({
  certificateOperationalService: {
    getOutboxSummary: () => {
      if (svc.throwErr) throw svc.throwErr;
      return svc.outbox();
    },
  },
}));

import { AuthorizationError } from "@/shared/lib/command";
import { GET as healthGET } from "../health/route";
import { GET as maintenanceGET } from "../maintenance/route";
import { GET as metricsGET } from "../metrics/route";
import { GET as outboxGET } from "../outbox/route";

const CTX = { userId: "u-1", organizationId: "org-A", roles: [], ability: { can: () => true } };

beforeEach(() => {
  vi.clearAllMocks();
  auth.ctx = CTX;
  auth.fail = false;
  svc.throwErr = null;
});
afterEach(() => vi.restoreAllMocks());

describe("operational routes delegate to their read service (200 + DTO passthrough)", () => {
  it.each([
    ["health", healthGET, "health"],
    ["maintenance", maintenanceGET, "maintenance"],
    ["metrics", metricsGET, "metrics"],
    ["outbox", outboxGET, "outbox"],
  ])("GET /%s → 200 with the service DTO", async (_name, handler, kind) => {
    const res = await (handler as () => Promise<Response>)();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ kind });
  });
});

describe("operational routes — auth mapping", () => {
  it("→ 401 when unauthenticated (service not called)", async () => {
    auth.fail = true;
    const res = await healthGET();
    expect(res.status).toBe(401);
    expect(svc.health).not.toHaveBeenCalled();
  });

  it("maps a service AuthorizationError → 403", async () => {
    svc.throwErr = new AuthorizationError();
    const res = await metricsGET();
    expect(res.status).toBe(403);
  });
});
