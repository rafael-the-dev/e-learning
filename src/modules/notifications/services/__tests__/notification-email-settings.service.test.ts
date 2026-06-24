import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/modules/notifications/repositories/notification-email-settings.repository", () => ({
  findByOrganization: vi.fn(),
  findRawByOrganization: vi.fn(),
  upsertByOrganization: vi.fn(),
  setEnabled: vi.fn(),
  updateTestResult: vi.fn(),
}));

vi.mock("@/shared/lib/secret-encryption", () => ({
  encryptSecret: vi.fn(),
  decryptSecret: vi.fn(),
  SecretEncryptionError: class SecretEncryptionError extends Error {},
}));

const sendEmailMock = vi.fn();
vi.mock("@/modules/notifications/providers/smtp-email-provider", () => ({
  SmtpEmailProvider: vi.fn().mockImplementation((config: unknown) => ({
    config,
    sendEmail: sendEmailMock,
  })),
}));

import {
  findByOrganization,
  findRawByOrganization,
  upsertByOrganization,
  setEnabled,
  updateTestResult,
} from "@/modules/notifications/repositories/notification-email-settings.repository";
import { encryptSecret, decryptSecret, SecretEncryptionError } from "@/shared/lib/secret-encryption";
import { SmtpEmailProvider } from "@/modules/notifications/providers/smtp-email-provider";
import {
  getEmailSettings,
  upsertEmailSettings,
  enableEmailSettings,
  disableEmailSettings,
  testEmailSettings,
} from "../notification-email-settings.service";
import { NotFoundError, BusinessRuleError } from "@/shared/lib/command";

const ORG_ID = "org-1";

function makeDto(overrides: Record<string, unknown> = {}) {
  return {
    id: "settings-1",
    organizationId: ORG_ID,
    providerType: "SMTP",
    isEnabled: false,
    fromName: "Escola",
    fromEmail: "noreply@escola.pt",
    replyTo: null,
    smtpHost: "smtp.escola.pt",
    smtpPort: 587,
    smtpUsername: "user",
    smtpSecure: true,
    lastTestedAt: null,
    lastTestStatus: null,
    lastTestError: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeRawRow(overrides: Record<string, unknown> = {}) {
  return { ...makeDto(), smtpPasswordEncrypted: "encrypted-blob", ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getEmailSettings", () => {
  it("delegates to the repository's DTO read", async () => {
    (findByOrganization as Mock).mockResolvedValue(makeDto());
    const result = await getEmailSettings(ORG_ID);
    expect(result).not.toHaveProperty("smtpPasswordEncrypted");
  });
});

describe("upsertEmailSettings — encryption (tests #1, #5)", () => {
  it("encrypts smtpPassword and forwards the ciphertext to the repository", async () => {
    (encryptSecret as Mock).mockReturnValue("new-cipher");
    (upsertByOrganization as Mock).mockResolvedValue(makeDto());

    await upsertEmailSettings(ORG_ID, {
      fromName: "Escola",
      fromEmail: "noreply@escola.pt",
      smtpPassword: "plain-password",
    });

    expect(encryptSecret).toHaveBeenCalledWith("plain-password");
    expect(upsertByOrganization).toHaveBeenCalledWith(
      ORG_ID,
      expect.objectContaining({ smtpPasswordEncrypted: "new-cipher" })
    );
  });

  it("keeps the existing password when smtpPassword is omitted (test #2)", async () => {
    (upsertByOrganization as Mock).mockResolvedValue(makeDto());

    await upsertEmailSettings(ORG_ID, { fromName: "Escola", fromEmail: "noreply@escola.pt" });

    expect(encryptSecret).not.toHaveBeenCalled();
    const call = (upsertByOrganization as Mock).mock.calls[0][1];
    expect(call.smtpPasswordEncrypted).toBeUndefined();
  });

  it("fails closed with BusinessRuleError when the encryption key is missing (test #5)", async () => {
    (encryptSecret as Mock).mockImplementation(() => {
      throw new SecretEncryptionError();
    });

    await expect(
      upsertEmailSettings(ORG_ID, { fromName: "Escola", fromEmail: "noreply@escola.pt", smtpPassword: "x" })
    ).rejects.toThrow(BusinessRuleError);
    expect(upsertByOrganization).not.toHaveBeenCalled();
  });
});

describe("enableEmailSettings — completeness validation (hardening §3)", () => {
  it("enables a complete SMTP settings row", async () => {
    (findRawByOrganization as Mock).mockResolvedValue(makeRawRow());
    (setEnabled as Mock).mockResolvedValue(makeDto({ isEnabled: true }));

    const result = await enableEmailSettings(ORG_ID);

    expect(setEnabled).toHaveBeenCalledWith(ORG_ID, true);
    expect(result.isEnabled).toBe(true);
  });

  it("can enable with an existing encrypted password (no new password typed)", async () => {
    (findRawByOrganization as Mock).mockResolvedValue(makeRawRow({ smtpPasswordEncrypted: "already-stored" }));
    (setEnabled as Mock).mockResolvedValue(makeDto({ isEnabled: true }));

    await enableEmailSettings(ORG_ID);

    expect(setEnabled).toHaveBeenCalledWith(ORG_ID, true);
  });

  it("throws NotFoundError when no settings row exists yet", async () => {
    (findRawByOrganization as Mock).mockResolvedValue(null);
    await expect(enableEmailSettings(ORG_ID)).rejects.toThrow(NotFoundError);
    expect(setEnabled).not.toHaveBeenCalled();
  });

  it("cannot enable without smtpHost", async () => {
    (findRawByOrganization as Mock).mockResolvedValue(makeRawRow({ smtpHost: null }));
    await expect(enableEmailSettings(ORG_ID)).rejects.toThrow(BusinessRuleError);
    expect(setEnabled).not.toHaveBeenCalled();
  });

  it("cannot enable without smtpUsername", async () => {
    (findRawByOrganization as Mock).mockResolvedValue(makeRawRow({ smtpUsername: null }));
    await expect(enableEmailSettings(ORG_ID)).rejects.toThrow(BusinessRuleError);
    expect(setEnabled).not.toHaveBeenCalled();
  });

  it("cannot enable without fromEmail", async () => {
    (findRawByOrganization as Mock).mockResolvedValue(makeRawRow({ fromEmail: "" }));
    await expect(enableEmailSettings(ORG_ID)).rejects.toThrow(BusinessRuleError);
    expect(setEnabled).not.toHaveBeenCalled();
  });

  it("cannot enable without a password when no encrypted password exists", async () => {
    (findRawByOrganization as Mock).mockResolvedValue(makeRawRow({ smtpPasswordEncrypted: null }));
    await expect(enableEmailSettings(ORG_ID)).rejects.toThrow(BusinessRuleError);
    expect(setEnabled).not.toHaveBeenCalled();
  });

  it("cannot enable MICROSOFT_GRAPH yet", async () => {
    (findRawByOrganization as Mock).mockResolvedValue(makeRawRow({ providerType: "MICROSOFT_GRAPH" }));
    await expect(enableEmailSettings(ORG_ID)).rejects.toThrow("Microsoft Graph ainda não está disponível.");
    expect(setEnabled).not.toHaveBeenCalled();
  });
});

describe("disableEmailSettings", () => {
  it("disables an existing settings row regardless of completeness", async () => {
    (findByOrganization as Mock).mockResolvedValue(makeDto({ isEnabled: true, smtpHost: null }));
    (setEnabled as Mock).mockResolvedValue(makeDto({ isEnabled: false }));

    const result = await disableEmailSettings(ORG_ID);

    expect(setEnabled).toHaveBeenCalledWith(ORG_ID, false);
    expect(result.isEnabled).toBe(false);
  });

  it("throws NotFoundError when no settings row exists yet", async () => {
    (findByOrganization as Mock).mockResolvedValue(null);
    await expect(disableEmailSettings(ORG_ID)).rejects.toThrow(NotFoundError);
    expect(setEnabled).not.toHaveBeenCalled();
  });
});

const VALID_DRAFT = {
  fromName: "Escola",
  fromEmail: "noreply@escola.pt",
  smtpHost: "smtp.escola.pt",
  smtpPort: 587,
  smtpUsername: "user",
  smtpPassword: "draft-password",
};

describe("testEmailSettings — uses the draft input, not necessarily saved settings (test #12 area)", () => {
  it("sends through a throwaway SmtpEmailProvider built from the draft password", async () => {
    sendEmailMock.mockResolvedValue({ success: true, provider: "smtp", providerMessageId: "msg-1" });
    (findRawByOrganization as Mock).mockResolvedValue(null);

    const result = await testEmailSettings(ORG_ID, VALID_DRAFT, "dest@example.com");

    expect(result.success).toBe(true);
    expect(SmtpEmailProvider).toHaveBeenCalledWith(expect.objectContaining({ password: "draft-password" }));
    expect(sendEmailMock).toHaveBeenCalledWith(expect.objectContaining({ to: "dest@example.com" }));
  });

  it("falls back to the saved settings' decrypted password when the draft password is blank", async () => {
    sendEmailMock.mockResolvedValue({ success: true, provider: "smtp" });
    (findRawByOrganization as Mock).mockResolvedValue(makeRawRow());
    (decryptSecret as Mock).mockReturnValue("saved-plaintext-password");

    const { smtpPassword, ...draftWithoutPassword } = VALID_DRAFT;
    void smtpPassword;
    await testEmailSettings(ORG_ID, draftWithoutPassword, "dest@example.com");

    expect(decryptSecret).toHaveBeenCalledWith("encrypted-blob");
    expect(SmtpEmailProvider).toHaveBeenCalledWith(expect.objectContaining({ password: "saved-plaintext-password" }));
  });

  it("fails safely when there is no draft password and no saved settings", async () => {
    (findRawByOrganization as Mock).mockResolvedValue(null);

    const { smtpPassword, ...draftWithoutPassword } = VALID_DRAFT;
    void smtpPassword;
    const result = await testEmailSettings(ORG_ID, draftWithoutPassword, "dest@example.com");

    expect(result.success).toBe(false);
    expect(result.errorMessage).toBe("Palavra-passe SMTP não fornecida");
    expect(SmtpEmailProvider).not.toHaveBeenCalled();
  });

  it("fails safely (not throws) when decrypting the saved password fails", async () => {
    (findRawByOrganization as Mock).mockResolvedValue(makeRawRow());
    (decryptSecret as Mock).mockImplementation(() => {
      throw new Error("bad tag");
    });

    const { smtpPassword, ...draftWithoutPassword } = VALID_DRAFT;
    void smtpPassword;
    const result = await testEmailSettings(ORG_ID, draftWithoutPassword, "dest@example.com");

    expect(result.success).toBe(false);
    expect(result.errorMessage).toBe("Palavra-passe SMTP não fornecida");
  });

  it("rejects MICROSOFT_GRAPH without attempting to send", async () => {
    const result = await testEmailSettings(ORG_ID, { ...VALID_DRAFT, providerType: "MICROSOFT_GRAPH" }, "dest@example.com");

    expect(result.success).toBe(false);
    expect(SmtpEmailProvider).not.toHaveBeenCalled();
  });

  it("rejects an incomplete SMTP draft without attempting to send", async () => {
    const { smtpHost, ...incomplete } = VALID_DRAFT;
    void smtpHost;
    const result = await testEmailSettings(ORG_ID, incomplete, "dest@example.com");

    expect(result.success).toBe(false);
    expect(result.errorMessage).toBe("Configuração SMTP incompleta");
    expect(SmtpEmailProvider).not.toHaveBeenCalled();
  });
});

describe("testEmailSettings — persistence and no notification/delivery side effects (tests #10, #11, #28)", () => {
  it("persists lastTestedAt/lastTestStatus/lastTestError when a settings row already exists", async () => {
    sendEmailMock.mockResolvedValue({ success: true, provider: "smtp" });
    (findRawByOrganization as Mock).mockResolvedValue(makeRawRow());

    await testEmailSettings(ORG_ID, VALID_DRAFT, "dest@example.com");

    expect(updateTestResult).toHaveBeenCalledWith(ORG_ID, "SUCCESS", null, expect.any(Date));
  });

  it("persists FAILED with the errorMessage when the send fails", async () => {
    sendEmailMock.mockResolvedValue({ success: false, provider: "smtp", errorMessage: "Falha de autenticação SMTP" });
    (findRawByOrganization as Mock).mockResolvedValue(makeRawRow());

    await testEmailSettings(ORG_ID, VALID_DRAFT, "dest@example.com");

    expect(updateTestResult).toHaveBeenCalledWith(ORG_ID, "FAILED", "Falha de autenticação SMTP", expect.any(Date));
  });

  it("does not persist anything when no settings row exists yet", async () => {
    sendEmailMock.mockResolvedValue({ success: true, provider: "smtp" });
    (findRawByOrganization as Mock).mockResolvedValue(null);

    await testEmailSettings(ORG_ID, VALID_DRAFT, "dest@example.com");

    expect(updateTestResult).not.toHaveBeenCalled();
  });
});
