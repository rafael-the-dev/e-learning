import crypto from "node:crypto";
import { getDb } from "@/server/db";

// =============================================================================
// ACCOUNT INVITE TOKENS
// Single-use tokens (stored in VerificationToken) that let a newly-provisioned
// student set their own password via /set-password. Server-only.
// =============================================================================

const INVITE_TTL_DAYS = 7;

/**
 * Issues a single-use invite token for an email and returns the relative
 * set-password URL to embed in the notification/email. Pure data — no email is
 * sent here. `now` is injectable for deterministic tests.
 */
export async function createStudentPortalInvite(
  email: string,
  now: Date = new Date()
): Promise<{ token: string; inviteUrl: string }> {
  const db = await getDb();
  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(now.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

  await db.verificationToken.create({
    data: { identifier: email, token, expires },
  });

  const inviteUrl = `/set-password?token=${token}&email=${encodeURIComponent(email)}`;
  return { token, inviteUrl };
}

export type InviteVerification =
  | { valid: true; email: string }
  | { valid: false; reason: "not_found" | "expired" | "mismatch" };

/**
 * Verifies (without consuming) an invite token. Consume separately only after
 * the password is successfully set, so a failed set-password attempt doesn't
 * burn the token.
 */
export async function verifyStudentPortalInvite(
  email: string,
  token: string,
  now: Date = new Date()
): Promise<InviteVerification> {
  const db = await getDb();
  const record = await db.verificationToken.findUnique({ where: { token } });
  if (!record) return { valid: false, reason: "not_found" };
  if (record.identifier !== email) return { valid: false, reason: "mismatch" };
  if (record.expires < now) return { valid: false, reason: "expired" };
  return { valid: true, email: record.identifier };
}

/** Deletes the token (single-use) after a successful password set. */
export async function consumeStudentPortalInvite(token: string): Promise<void> {
  const db = await getDb();
  await db.verificationToken.deleteMany({ where: { token } });
}
