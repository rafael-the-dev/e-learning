import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/server/auth/rbac", () => ({
  getUserPermissions: vi.fn().mockResolvedValue(new Set()),
  createAbility: vi.fn().mockReturnValue({ can: vi.fn().mockReturnValue(true) }),
}));

vi.mock("@/modules/notifications/services/notification-email-settings.service", () => ({
  getEmailSettings: vi.fn(),
  upsertEmailSettings: vi.fn(),
}));

vi.mock("@/modules/audit-logs/services/audit.service", () => ({
  auditService: { log: vi.fn().mockResolvedValue(undefined) },
}));

import { createAbility } from "@/server/auth/rbac";
import { getEmailSettings, upsertEmailSettings } from "@/modules/notifications/services/notification-email-settings.service";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { UpsertNotificationEmailSettingsCommand } from "../upsert-notification-email-settings.command";

const CTX = { userId: "user-1", organizationId: "org-1" };

const VALID_INPUT = { fromName: "Escola", fromEmail: "noreply@escola.pt" };

function makeDto(overrides: Record<string, unknown> = {}) {
  return {
    id: "settings-1",
    organizationId: "org-1",
    providerType: "SMTP",
    isEnabled: false,
    fromName: "Escola",
    fromEmail: "noreply@escola.pt",
    replyTo: null,
    smtpHost: null,
    smtpPort: null,
    smtpUsername: null,
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
  (createAbility as Mock).mockReturnValue({ can: vi.fn().mockReturnValue(true) });
});

describe("UpsertNotificationEmailSettingsCommand", () => {
  it("rejects invalid input (e.g. missing fromEmail)", async () => {
    const cmd = new UpsertNotificationEmailSettingsCommand({ fromName: "Escola" } as never, CTX);
    await expect(cmd.validate()).rejects.toThrow();
    expect(upsertEmailSettings).not.toHaveBeenCalled();
  });

  it("rejects when the actor lacks NOTIFICATIONS_MANAGE_EMAIL_SETTINGS (test #29)", async () => {
    (getEmailSettings as Mock).mockResolvedValue(null);
    (createAbility as Mock).mockReturnValue({ can: vi.fn().mockReturnValue(false) });

    const cmd = new UpsertNotificationEmailSettingsCommand(VALID_INPUT, CTX);
    await cmd.validate();
    await expect(cmd.authorize()).rejects.toThrow();
    expect(upsertEmailSettings).not.toHaveBeenCalled();
  });

  it("upserts and audits notification_email_settings.updated without leaking the password", async () => {
    (getEmailSettings as Mock).mockResolvedValue(null);
    (upsertEmailSettings as Mock).mockResolvedValue(makeDto());

    const cmd = new UpsertNotificationEmailSettingsCommand({ ...VALID_INPUT, smtpPassword: "super-secret" }, CTX);
    const result = await cmd.run();

    expect(result.fromEmail).toBe("noreply@escola.pt");
    expect(upsertEmailSettings).toHaveBeenCalledWith("org-1", expect.objectContaining({ smtpPassword: "super-secret" }));

    const auditCall = (auditService.log as Mock).mock.calls[0][1];
    expect(auditCall.action).toBe("notification_email_settings.updated");
    expect(JSON.stringify(auditCall)).not.toContain("super-secret");
  });
});
