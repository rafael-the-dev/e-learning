import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { encryptSecret, decryptSecret, SecretEncryptionError } from "../secret-encryption";

const ORIGINAL_KEY = process.env.NOTIFICATION_SECRET_ENCRYPTION_KEY;

describe("secret-encryption", () => {
  beforeEach(() => {
    process.env.NOTIFICATION_SECRET_ENCRYPTION_KEY = "test-encryption-key";
  });

  afterEach(() => {
    process.env.NOTIFICATION_SECRET_ENCRYPTION_KEY = ORIGINAL_KEY;
  });

  it("round-trips a plaintext value", () => {
    const ciphertext = encryptSecret("super-secret-password");
    expect(ciphertext).not.toContain("super-secret-password");
    expect(decryptSecret(ciphertext)).toBe("super-secret-password");
  });

  it("produces different ciphertext for the same plaintext on each call (random IV)", () => {
    const a = encryptSecret("same-value");
    const b = encryptSecret("same-value");
    expect(a).not.toBe(b);
  });

  it("fails closed on encrypt when the encryption key is not configured", () => {
    delete process.env.NOTIFICATION_SECRET_ENCRYPTION_KEY;
    expect(() => encryptSecret("anything")).toThrow(SecretEncryptionError);
  });

  it("fails closed on decrypt when the encryption key is not configured", () => {
    const ciphertext = encryptSecret("value");
    delete process.env.NOTIFICATION_SECRET_ENCRYPTION_KEY;
    expect(() => decryptSecret(ciphertext)).toThrow(SecretEncryptionError);
  });

  it("throws when the ciphertext was encrypted under a different key", () => {
    const ciphertext = encryptSecret("value");
    process.env.NOTIFICATION_SECRET_ENCRYPTION_KEY = "a-completely-different-key";
    expect(() => decryptSecret(ciphertext)).toThrow();
  });

  it("throws on tampered ciphertext rather than returning garbage", () => {
    const ciphertext = encryptSecret("value");
    const tampered = ciphertext.slice(0, -4) + "abcd";
    expect(() => decryptSecret(tampered)).toThrow();
  });
});
