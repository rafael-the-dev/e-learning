import { randomBytes } from "node:crypto";

// =============================================================================
// CERTIFICATE VERIFICATION CODE
// -----------------------------------------------------------------------------
// The public lookup key for a certificate's verification projection. Generated
// ONCE at issue time (never for a DRAFT) and globally unique. Unguessable and
// URL-safe: 128 bits of entropy rendered as 32 lowercase-hex characters, matching
// the project's token convention (`crypto.randomBytes(...).toString(...)`).
//
// This is NOT the content checksum and NOT a signature — it is an opaque handle
// for the (later) public verification endpoint. No PII is encoded in it.
// =============================================================================

const VERIFICATION_CODE_BYTES = 16;

/** A fresh, unguessable, URL-safe verification code (32 lowercase-hex chars). */
export function generateVerificationCode(): string {
  return randomBytes(VERIFICATION_CODE_BYTES).toString("hex");
}
