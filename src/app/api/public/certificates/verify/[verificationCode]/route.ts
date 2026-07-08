import { NextRequest, NextResponse } from "next/server";
import { certificateVerificationCodeSchema } from "@/modules/certificates/schemas/certificate.schema";
import { verifyCertificatePublicService } from "@/modules/certificates/services/certificate-public-verification.service";
import { checkRateLimit } from "@/modules/certificates/services/public-rate-limiter";

// =============================================================================
// GET /api/public/certificates/verify/:verificationCode
//
// Unauthenticated public certificate verification (Phase 7). Returns a
// privacy-safe DTO derived ONLY from the `CertificateVerification` projection (+
// minimal certificate columns + org name). It never reads Academic Core, the
// transcript, grades, attendance, or finance, and never recomputes validity.
//
// Behaviour
// ---------
// • No auth (added to PUBLIC_PATHS in proxy.ts).
// • Per-IP rate limiting (in-memory seam — see public-rate-limiter.ts).
// • The code format is validated BEFORE any DB access.
// • Existence is never leaked: an unknown code, a soft-deleted certificate, and a
//   not-publicly-issued certificate all return 200 with `status: "NOT_FOUND"` —
//   identical to a real lookup, so a caller cannot probe for hidden ids.
//
// Responses
// ---------
// 200  CertificatePublicVerificationDto (including the NOT_FOUND case).
// 400  Malformed verification code.
// 429  Rate limit exceeded.
// 500  Unexpected error (no internal detail exposed).
// =============================================================================

/** Requests allowed per window, per client IP. */
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;

/** A public verification response is never cacheable — it must not be stored by a
 *  CDN/browser on ANY path (a cached NOT_FOUND/VALID would leak or go stale). */
const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ verificationCode: string }> }
): Promise<NextResponse> {
  const rl = checkRateLimit(`cert-verify:${clientIp(req)}`, {
    limit: RATE_LIMIT,
    windowMs: RATE_WINDOW_MS,
  });
  if (!rl.allowed) {
    const retryAfter = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000));
    return NextResponse.json(
      { error: "Demasiados pedidos. Tente novamente mais tarde." },
      { status: 429, headers: { ...NO_STORE_HEADERS, "Retry-After": String(retryAfter) } }
    );
  }

  const { verificationCode } = await params;
  const parsed = certificateVerificationCodeSchema.safeParse(verificationCode);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Código de verificação inválido" },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  try {
    const result = await verifyCertificatePublicService.verify({ verificationCode: parsed.data });
    return NextResponse.json(result, { status: 200, headers: NO_STORE_HEADERS });
  } catch {
    return NextResponse.json(
      { error: "Erro interno no servidor" },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
