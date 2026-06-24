import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/modules/notifications/repositories/notification-email-settings.repository", () => ({
  findRawByOrganization: vi.fn(),
}));

vi.mock("@/shared/lib/secret-encryption", () => ({
  decryptSecret: vi.fn(),
}));

import { findRawByOrganization } from "@/modules/notifications/repositories/notification-email-settings.repository";
import { decryptSecret } from "@/shared/lib/secret-encryption";
import { getProvider } from "../notification-provider-registry";
import { NoopEmailProvider } from "../email-provider";
import { SmtpEmailProvider } from "../smtp-email-provider";
import { NotificationChannel } from "@/shared/types/common";

const ORG_ID = "org-1";

const BASE_INPUT = {
  organizationId: ORG_ID,
  deliveryId: "delivery-1",
  notificationId: "notif-1",
  recipient: "student@example.com",
  title: "Título",
  body: "Corpo",
};

function makeRawSettings(overrides: Record<string, unknown> = {}) {
  return {
    id: "settings-1",
    organizationId: ORG_ID,
    providerType: "SMTP",
    isEnabled: true,
    fromName: "Escola",
    fromEmail: "noreply@escola.pt",
    replyTo: null,
    smtpHost: "smtp.escola.pt",
    smtpPort: 587,
    smtpUsername: "user",
    smtpPasswordEncrypted: "encrypted-value",
    smtpSecure: true,
    lastTestedAt: null,
    lastTestStatus: null,
    lastTestError: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getProvider — EMAIL, no settings configured", () => {
  it("returns a NoopEmailProvider instance when no settings row exists", async () => {
    (findRawByOrganization as Mock).mockResolvedValue(null);

    const provider = await getProvider(NotificationChannel.EMAIL, ORG_ID);
    expect(provider).toBeInstanceOf(NoopEmailProvider);

    const result = await provider.send({ ...BASE_INPUT, channel: NotificationChannel.EMAIL });
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("PROVIDER_NOT_CONFIGURED");
  });
});

describe("getProvider — EMAIL, disabled settings (test #10)", () => {
  it("returns a NoopEmailProvider when isEnabled is false, even with valid SMTP fields", async () => {
    (findRawByOrganization as Mock).mockResolvedValue(makeRawSettings({ isEnabled: false }));

    const provider = await getProvider(NotificationChannel.EMAIL, ORG_ID);
    expect(provider).toBeInstanceOf(NoopEmailProvider);
    expect(decryptSecret).not.toHaveBeenCalled();
  });
});

describe("getProvider — EMAIL, SMTP settings (test #11)", () => {
  it("returns a SmtpEmailProvider when enabled with complete SMTP fields", async () => {
    (findRawByOrganization as Mock).mockResolvedValue(makeRawSettings());
    (decryptSecret as Mock).mockReturnValue("plaintext-password");

    const provider = await getProvider(NotificationChannel.EMAIL, ORG_ID);

    expect(provider).toBeInstanceOf(SmtpEmailProvider);
    expect(decryptSecret).toHaveBeenCalledWith("encrypted-value");
  });

  it("falls back to NoopEmailProvider when SMTP fields are incomplete", async () => {
    (findRawByOrganization as Mock).mockResolvedValue(makeRawSettings({ smtpHost: null }));

    const provider = await getProvider(NotificationChannel.EMAIL, ORG_ID);
    expect(provider).toBeInstanceOf(NoopEmailProvider);
  });
});

describe("getProvider — EMAIL, MICROSOFT_GRAPH (test #12)", () => {
  it("returns a NoopEmailProvider — Microsoft Graph is reserved, not implemented", async () => {
    (findRawByOrganization as Mock).mockResolvedValue(makeRawSettings({ providerType: "MICROSOFT_GRAPH" }));

    const provider = await getProvider(NotificationChannel.EMAIL, ORG_ID);
    expect(provider).toBeInstanceOf(NoopEmailProvider);
    expect(decryptSecret).not.toHaveBeenCalled();
  });
});

describe("getProvider — EMAIL, decryption failure (test #13)", () => {
  it("returns a safe NoopEmailProvider instead of throwing when decryption fails", async () => {
    (findRawByOrganization as Mock).mockResolvedValue(makeRawSettings());
    (decryptSecret as Mock).mockImplementation(() => {
      throw new Error("bad auth tag");
    });

    const provider = await getProvider(NotificationChannel.EMAIL, ORG_ID);
    expect(provider).toBeInstanceOf(NoopEmailProvider);
  });
});

describe("getProvider — WHATSAPP/SMS/PUSH (test #5)", () => {
  it.each([NotificationChannel.WHATSAPP, NotificationChannel.SMS, NotificationChannel.PUSH])(
    "returns a not-configured provider for %s",
    async (channel) => {
      const provider = await getProvider(channel, ORG_ID);
      const result = await provider.send({ ...BASE_INPUT, channel });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe("PROVIDER_NOT_CONFIGURED");
      expect(result.provider).toBe(`not-configured-${channel.toLowerCase()}`);
    }
  );
});

describe("getProvider — IN_APP", () => {
  it("returns a no-op provider that reports success (never actually invoked by the dispatcher today)", async () => {
    const provider = await getProvider(NotificationChannel.IN_APP, ORG_ID);
    const result = await provider.send({ ...BASE_INPUT, channel: NotificationChannel.IN_APP });

    expect(result.success).toBe(true);
    expect(result.status).toBe("DELIVERED");
  });
});
