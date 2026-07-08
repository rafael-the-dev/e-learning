import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

// =============================================================================
// GET /api/public/certificates/verify/:verificationCode — HTTP contract tests
// -----------------------------------------------------------------------------
// These assert the ROUTE's HTTP contract, not the service implementation (that is
// covered by certificate-public-verification.service.test.ts). Only the two
// external collaborators are mocked — the verification service and the rate
// limiter. The REAL validation schema is used, so the 400 path is genuine.
//
// Covered: 200 (VALID + NOT_FOUND) with `Cache-Control: no-store`, 400 malformed,
// 429 with `Retry-After`, 500 generic (no leak), and the ordering guarantees —
// validation runs before the DB, and the rate limit runs before validation.
// =============================================================================

const verify = vi.fn();
const checkRateLimit = vi.fn();

vi.mock("@/modules/certificates/services/certificate-public-verification.service", () => ({
  verifyCertificatePublicService: { verify: (...a: unknown[]) => verify(...a) },
}));

vi.mock("@/modules/certificates/services/public-rate-limiter", () => ({
  checkRateLimit: (...a: unknown[]) => checkRateLimit(...a),
}));

import { GET } from "../route";

const CODE = "abcdef0123456789abcdef0123456789"; // 32 lowercase-hex chars (valid)
const BAD_CODE = "not-a-valid-code";

const VALID_DTO = {
  status: "VALID",
  publicStatus: "VALID",
  certificateNumber: "CERT-2026-000042",
  certificateType: "COURSE_COMPLETION",
  organizationName: "Escola de Condução Central",
  studentDisplayName: "João S.",
  courseName: "Carta de Condução B",
  issuedAt: "2026-07-05T00:00:00.000Z",
  expiresAt: null,
};

const NOT_FOUND_DTO = {
  status: "NOT_FOUND",
  publicStatus: "NOT_FOUND",
  certificateNumber: null,
  certificateType: null,
  organizationName: null,
  studentDisplayName: null,
  courseName: null,
  issuedAt: null,
  expiresAt: null,
};

/** Minimal NextRequest stand-in: the route only reads `headers.get`. */
function makeReq(headers: Record<string, string> = {}): NextRequest {
  return { headers: new Headers(headers) } as unknown as NextRequest;
}

function makeCtx(verificationCode: string) {
  return { params: Promise.resolve({ verificationCode }) };
}

beforeEach(() => {
  verify.mockReset();
  checkRateLimit.mockReset();
  // Default: not throttled.
  checkRateLimit.mockReturnValue({ allowed: true, remaining: 29, resetAt: 0 });
});

describe("GET /api/public/certificates/verify/:verificationCode — HTTP contract", () => {
  it("1. valid request → 200, no-store, body matches the service response", async () => {
    verify.mockResolvedValue(VALID_DTO);

    const res = await GET(makeReq(), makeCtx(CODE));

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual(VALID_DTO);
    // The service was called with exactly the validated code.
    expect(verify).toHaveBeenCalledWith({ verificationCode: CODE });
  });

  it("2. NOT_FOUND → 200, no-store, identical NOT_FOUND payload", async () => {
    verify.mockResolvedValue(NOT_FOUND_DTO);

    const res = await GET(makeReq(), makeCtx(CODE));

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual(NOT_FOUND_DTO);
  });

  it("3. malformed verification code → 400, no-store, service never called", async () => {
    const res = await GET(makeReq(), makeCtx(BAD_CODE));

    expect(res.status).toBe(400);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(verify).not.toHaveBeenCalled();
  });

  it("4. rate limited → 429, Retry-After present, no-store, service never called", async () => {
    checkRateLimit.mockReturnValue({ allowed: false, remaining: 0, resetAt: 0 });

    const res = await GET(makeReq(), makeCtx(CODE));

    expect(res.status).toBe(429);
    const retryAfter = res.headers.get("Retry-After");
    expect(retryAfter).not.toBeNull();
    expect(Number(retryAfter)).toBeGreaterThanOrEqual(1);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(verify).not.toHaveBeenCalled();
  });

  it("5. unexpected service error → 500, no-store, generic error only (no internal detail / stack)", async () => {
    const internalMessage = "SECRET connection string leaked in stack";
    verify.mockRejectedValue(new Error(internalMessage));

    const res = await GET(makeReq(), makeCtx(CODE));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(body).toEqual({ error: "Erro interno no servidor" });
    // No internal message or stack trace leaks.
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain(internalMessage);
    expect(serialized).not.toMatch(/stack|at Object|\.ts:\d+/i);
  });

  it("6. validation-before-DB: a malformed code never reaches the service", async () => {
    const res = await GET(makeReq(), makeCtx(BAD_CODE));

    expect(res.status).toBe(400);
    expect(verify).not.toHaveBeenCalled();
  });

  it("7. rate-limit-before-validation: a throttled malformed request is 429 (not 400), and validation/service never run", async () => {
    checkRateLimit.mockReturnValue({ allowed: false, remaining: 0, resetAt: 0 });

    // Even with a malformed code, the limiter short-circuits FIRST: a 429 (not the
    // 400 the schema would produce) proves the rate check precedes validation.
    const res = await GET(makeReq(), makeCtx(BAD_CODE));

    expect(res.status).toBe(429);
    expect(verify).not.toHaveBeenCalled();
  });
});
