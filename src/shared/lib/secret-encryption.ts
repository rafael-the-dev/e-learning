import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

// =============================================================================
// SECRET ENCRYPTION
// AES-256-GCM, keyed from NOTIFICATION_SECRET_ENCRYPTION_KEY. Used to store
// SMTP/Graph credentials at rest (NotificationEmailSettings) — never logged,
// never returned to a client, decrypted only inside the provider factory.
// =============================================================================

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

export class SecretEncryptionError extends Error {
  constructor(message = "Chave de encriptação de segredos não configurada") {
    super(message);
    this.name = "SecretEncryptionError";
  }
}

/**
 * The env var is an arbitrary operator-chosen string, not necessarily 32
 * bytes — hashing it to a fixed-length digest gives AES-256-GCM a valid key
 * regardless of the raw value's length/encoding.
 */
function getKey(): Buffer {
  const raw = process.env.NOTIFICATION_SECRET_ENCRYPTION_KEY;
  if (!raw) throw new SecretEncryptionError();
  return createHash("sha256").update(raw).digest();
}

/** Throws SecretEncryptionError (fail closed) when the encryption key is not configured. */
export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

/**
 * Throws SecretEncryptionError when the key is missing, or a generic Error
 * when the ciphertext is malformed/tampered (auth tag mismatch) — callers
 * decrypting a stored secret (the provider factory) must treat both as "this
 * secret cannot be used right now" rather than letting either propagate.
 */
export function decryptSecret(ciphertext: string): string {
  const key = getKey();
  const raw = Buffer.from(ciphertext, "base64");
  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}
