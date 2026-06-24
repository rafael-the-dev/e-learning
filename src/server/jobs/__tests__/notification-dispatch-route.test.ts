import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("next/server", () => ({
  NextResponse: {
    json: vi.fn().mockImplementation((body: unknown, init?: { status?: number }) => ({
      _body: body,
      _status: init?.status ?? 200,
    })),
  },
}));

vi.mock("@/server/jobs/notification-dispatch.job", () => ({
  runNotificationDispatchJob: vi.fn().mockResolvedValue({
    processed: 5,
    sent: 2,
    delivered: 1,
    failed: 2,
    providerNotConfigured: 2,
    errors: 0,
    startedAt: new Date(),
    completedAt: new Date(),
  }),
}));

import { NextResponse } from "next/server";
import { runNotificationDispatchJob } from "@/server/jobs/notification-dispatch.job";
import { POST } from "@/app/api/internal/jobs/notifications/dispatch/route";

function makeReq(opts: { headers?: Record<string, string>; body?: unknown; noBody?: boolean }) {
  return {
    headers: {
      get: (key: string) => opts.headers?.[key.toLowerCase()] ?? null,
    },
    json: opts.noBody
      ? vi.fn().mockRejectedValue(new SyntaxError("no body"))
      : vi.fn().mockResolvedValue(opts.body ?? {}),
  } as never;
}

function lastJsonCall() {
  const calls = (NextResponse.json as ReturnType<typeof vi.fn>).mock.calls;
  return calls[calls.length - 1] as [unknown, { status?: number }?];
}

describe("POST /api/internal/jobs/notifications/dispatch — authentication (tests #14, #15, #16)", () => {
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

  it("runs the dispatcher when the correct secret is provided", async () => {
    await POST(makeReq({ headers: { "x-internal-job-secret": VALID_SECRET } }));
    const [, init] = lastJsonCall();
    expect(init?.status ?? 200).toBe(200);
    expect(runNotificationDispatchJob).toHaveBeenCalled();
  });
});

describe("POST /api/internal/jobs/notifications/dispatch — job invocation (test #17)", () => {
  const VALID_SECRET = "test-secret";

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.INTERNAL_JOB_SECRET = VALID_SECRET;
  });

  afterEach(() => {
    delete process.env.INTERNAL_JOB_SECRET;
  });

  it("forwards no organizationId when no body is provided", async () => {
    await POST(makeReq({ headers: { "x-internal-job-secret": VALID_SECRET }, noBody: true }));
    expect(runNotificationDispatchJob).toHaveBeenCalledWith({ organizationId: undefined, limit: undefined });
  });

  it("forwards organizationId from the body", async () => {
    await POST(
      makeReq({ headers: { "x-internal-job-secret": VALID_SECRET }, body: { organizationId: "org-42" } })
    );
    expect(runNotificationDispatchJob).toHaveBeenCalledWith({ organizationId: "org-42", limit: undefined });
  });

  it("forwards limit from the body (test #18)", async () => {
    await POST(makeReq({ headers: { "x-internal-job-secret": VALID_SECRET }, body: { limit: 250 } }));
    expect(runNotificationDispatchJob).toHaveBeenCalledWith({ organizationId: undefined, limit: 250 });
  });

  it("ignores a non-string organizationId (injection guard)", async () => {
    await POST(makeReq({ headers: { "x-internal-job-secret": VALID_SECRET }, body: { organizationId: 99 } }));
    expect(runNotificationDispatchJob).toHaveBeenCalledWith({ organizationId: undefined, limit: undefined });
  });

  it("ignores a non-numeric limit", async () => {
    await POST(makeReq({ headers: { "x-internal-job-secret": VALID_SECRET }, body: { limit: "lots" } }));
    expect(runNotificationDispatchJob).toHaveBeenCalledWith({ organizationId: undefined, limit: undefined });
  });

  it("returns the job result in the response body", async () => {
    await POST(makeReq({ headers: { "x-internal-job-secret": VALID_SECRET } }));
    const [body] = lastJsonCall();
    expect((body as { processed: number }).processed).toBe(5);
  });

  it("returns 500 without leaking the error message when the job throws", async () => {
    (runNotificationDispatchJob as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("unexpected DB failure"));
    await POST(makeReq({ headers: { "x-internal-job-secret": VALID_SECRET } }));
    const [body, init] = lastJsonCall();
    expect(init?.status).toBe(500);
    expect(JSON.stringify(body)).not.toContain("unexpected DB failure");
    expect((body as { error: string }).error).toBe("Erro interno no servidor");
  });
});
