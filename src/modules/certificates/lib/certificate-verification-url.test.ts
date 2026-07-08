import { describe, expect, it } from "vitest";
import {
  PUBLIC_VERIFICATION_PATH,
  buildQrPayload,
  buildVerificationUrl,
} from "./certificate-verification-url";

// =============================================================================
// certificate-verification-url — QR payload + URL builder (Phase 8, §4)
// -----------------------------------------------------------------------------
// The QR is a PUBLIC POINTER ONLY: it encodes the verification URL (which carries
// the opaque code) and nothing else. These tests prove the URL composition and
// that the QR payload never carries checksums, internal ids, grades, or documents.
// =============================================================================

const CODE = "abcdef0123456789abcdef0123456789";
const BASE = "https://verify.example.com";

describe("buildVerificationUrl", () => {
  it("composes <base><path>/<code> deterministically", () => {
    expect(buildVerificationUrl({ verificationCode: CODE, baseUrl: BASE })).toBe(
      `${BASE}${PUBLIC_VERIFICATION_PATH}/${CODE}`
    );
  });

  it("trims a trailing slash on the base", () => {
    expect(buildVerificationUrl({ verificationCode: CODE, baseUrl: `${BASE}/` })).toBe(
      `${BASE}${PUBLIC_VERIFICATION_PATH}/${CODE}`
    );
  });

  it("uses a pre-stored absolute URL verbatim when present", () => {
    const existing = "https://school.example/verify/certificate/xyz";
    expect(
      buildVerificationUrl({ verificationCode: CODE, existingUrl: existing, baseUrl: BASE })
    ).toBe(existing);
  });
});

describe("buildQrPayload — public pointer only (§4)", () => {
  const url = buildVerificationUrl({ verificationCode: CODE, baseUrl: BASE });
  const payload = buildQrPayload(url);

  it("12. the payload is exactly the public verification URL (contains the code)", () => {
    expect(payload).toBe(url);
    expect(payload).toContain(CODE);
  });

  it("13. the payload carries no checksum / internal id / grade / attendance / document", () => {
    expect(payload).not.toMatch(/checksum/i);
    expect(payload).not.toMatch(/transcript/i);
    expect(payload).not.toMatch(/grade|attendance/i);
    expect(payload).not.toMatch(/idNumber|document|financ/i);
  });
});
