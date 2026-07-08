// =============================================================================
// CERTIFICATE VERIFICATION URL + QR PAYLOAD (Phase 8)
// -----------------------------------------------------------------------------
// Builds the PUBLIC verification URL for a certificate and the QR payload derived
// from it. The QR is a PUBLIC POINTER ONLY (§4): it encodes the verification URL
// (which carries the opaque verification code) and NOTHING else — no certificate
// checksum, no transcript checksum, no internal ids, no student document, no
// grades/attendance. The verification code is already unguessable (128 bits) and
// leaks no PII, so a scanner learns only "where to verify", never the content.
//
// The base URL is injected/resolved so the payload is deterministic in tests.
// =============================================================================

/** Path segment of the public verification page (the code is appended). The public
 *  machine endpoint already lives at `/api/public/certificates/verify/:code`; the
 *  human-facing page at this path is a later (UI) phase. */
export const PUBLIC_VERIFICATION_PATH = "/verify/certificate";

/** Resolve the public base URL from the environment (no trailing slash), or "" when
 *  unset — callers may still build a relative verification URL in that case. */
export function resolveVerificationBaseUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_URL ??
    process.env.NEXTAUTH_URL ??
    "";
  return raw.replace(/\/+$/, "");
}

export interface BuildVerificationUrlParams {
  verificationCode: string;
  /** Optional pre-stored absolute URL (used verbatim if provided). */
  existingUrl?: string | null;
  /** Base origin (no trailing slash). Defaults to the resolved environment value. */
  baseUrl?: string;
}

/** The public verification URL for a code. Uses a pre-stored absolute URL when the
 *  certificate already carries one; otherwise composes `<base><path>/<code>`. */
export function buildVerificationUrl(params: BuildVerificationUrlParams): string {
  if (params.existingUrl && params.existingUrl.trim().length > 0) {
    return params.existingUrl.trim();
  }
  const base = (params.baseUrl ?? resolveVerificationBaseUrl()).replace(/\/+$/, "");
  return `${base}${PUBLIC_VERIFICATION_PATH}/${params.verificationCode}`;
}

/** The QR payload: the public verification URL, and nothing else (§4). */
export function buildQrPayload(verificationUrl: string): string {
  return verificationUrl;
}
