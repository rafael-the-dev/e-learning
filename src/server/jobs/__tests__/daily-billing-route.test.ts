import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — must be declared before any import that transitively loads the mocked
// modules, otherwise Vitest hoists them too late.
// ---------------------------------------------------------------------------

vi.mock("next/server", () => ({
  NextResponse: {
    json: vi.fn().mockImplementation((body: unknown, init?: { status?: number }) => ({
      _body: body,
      _status: init?.status ?? 200,
    })),
  },
}));

vi.mock("@/server/jobs/daily-billing.job", () => ({
  runDailyBillingJob: vi.fn().mockResolvedValue({
    jobRunId: "route-run-id",
    startedAt: new Date(),
    completedAt: new Date(),
    organizationsProcessed: 2,
    organizationsSkipped: 0,
    totalInvoicesMarkedOverdue: 5,
    totalInstallmentsMarkedOverdue: 3,
    errors: [],
    timezoneWarnings: [],
  }),
}));

import { NextResponse } from "next/server";
import { runDailyBillingJob } from "@/server/jobs/daily-billing.job";
import { POST } from "@/app/api/internal/jobs/daily-billing/route";

// ---------------------------------------------------------------------------
// Minimal NextRequest-shaped mock
// ---------------------------------------------------------------------------

function makeReq(opts: {
  headers?: Record<string, string>;
  body?: unknown;
  noBody?: boolean;
}) {
  return {
    headers: {
      get: (key: string) => opts.headers?.[key.toLowerCase()] ?? null,
    },
    json: opts.noBody
      ? vi.fn().mockRejectedValue(new SyntaxError("no body"))
      : vi.fn().mockResolvedValue(opts.body ?? {}),
  } as never; // cast to avoid importing NextRequest type
}

// ---------------------------------------------------------------------------
// Helpers to inspect the mocked NextResponse.json calls
// ---------------------------------------------------------------------------

function lastJsonCall() {
  const calls = (NextResponse.json as ReturnType<typeof vi.fn>).mock.calls;
  return calls[calls.length - 1] as [unknown, { status?: number }?];
}

// =============================================================================
// Auth — secret header
// =============================================================================

describe("POST /api/internal/jobs/daily-billing — authentication", () => {
  const VALID_SECRET = "super-secret-123";

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.INTERNAL_JOB_SECRET = VALID_SECRET;
  });

  afterEach(() => {
    delete process.env.INTERNAL_JOB_SECRET;
  });

  it("returns 401 when no secret header is provided", async () => {
    await POST(makeReq({ headers: {} }));
    const [, init] = lastJsonCall();
    expect(init?.status).toBe(401);
  });

  it("returns 401 when an incorrect secret is provided", async () => {
    await POST(makeReq({ headers: { "x-internal-job-secret": "wrong" } }));
    const [body, init] = lastJsonCall();
    expect(init?.status).toBe(401);
    expect((body as { error: string }).error).toBe("Não autorizado");
  });

  it("returns 401 when INTERNAL_JOB_SECRET env var is not set (fail-closed)", async () => {
    delete process.env.INTERNAL_JOB_SECRET;
    await POST(makeReq({ headers: { "x-internal-job-secret": VALID_SECRET } }));
    const [, init] = lastJsonCall();
    expect(init?.status).toBe(401);
  });

  it("returns 200 when the correct secret is provided", async () => {
    await POST(makeReq({ headers: { "x-internal-job-secret": VALID_SECRET } }));
    const [, init] = lastJsonCall();
    expect(init?.status ?? 200).toBe(200);
  });
});

// =============================================================================
// Job invocation
// =============================================================================

describe("POST /api/internal/jobs/daily-billing — job invocation", () => {
  const VALID_SECRET = "test-secret";

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.INTERNAL_JOB_SECRET = VALID_SECRET;
  });

  afterEach(() => {
    delete process.env.INTERNAL_JOB_SECRET;
  });

  it("runs job for all orgs when no body is provided", async () => {
    await POST(makeReq({ headers: { "x-internal-job-secret": VALID_SECRET }, noBody: true }));
    expect(runDailyBillingJob).toHaveBeenCalledWith({ organizationId: undefined });
  });

  it("runs job for all orgs when body is empty", async () => {
    await POST(makeReq({ headers: { "x-internal-job-secret": VALID_SECRET }, body: {} }));
    expect(runDailyBillingJob).toHaveBeenCalledWith({ organizationId: undefined });
  });

  it("passes organizationId from body to runDailyBillingJob", async () => {
    await POST(
      makeReq({
        headers: { "x-internal-job-secret": VALID_SECRET },
        body: { organizationId: "org-42" },
      })
    );
    expect(runDailyBillingJob).toHaveBeenCalledWith({ organizationId: "org-42" });
  });

  it("ignores organizationId when it is not a string (injection guard)", async () => {
    await POST(
      makeReq({
        headers: { "x-internal-job-secret": VALID_SECRET },
        body: { organizationId: 99 },
      })
    );
    expect(runDailyBillingJob).toHaveBeenCalledWith({ organizationId: undefined });
  });

  it("returns the job result in the response body", async () => {
    await POST(makeReq({ headers: { "x-internal-job-secret": VALID_SECRET } }));
    const [body] = lastJsonCall();
    expect((body as { jobRunId: string }).jobRunId).toBe("route-run-id");
  });

  it("returns 500 when runDailyBillingJob throws", async () => {
    (runDailyBillingJob as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("unexpected DB failure")
    );
    await POST(makeReq({ headers: { "x-internal-job-secret": VALID_SECRET } }));
    const [body, init] = lastJsonCall();
    expect(init?.status).toBe(500);
    // Stack trace must not be exposed
    expect(JSON.stringify(body)).not.toContain("unexpected DB failure");
    expect((body as { error: string }).error).toBe("Erro interno no servidor");
  });
});
