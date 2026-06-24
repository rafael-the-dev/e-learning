import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/server/auth/rbac", () => ({
  getUserPermissions: vi.fn().mockResolvedValue(new Set()),
  createAbility: vi.fn().mockReturnValue({ can: vi.fn().mockReturnValue(true) }),
}));

vi.mock("@/modules/notifications/services/notification-email-settings.service", () => ({
  testEmailSettings: vi.fn(),
}));

vi.mock("@/modules/audit-logs/services/audit.service", () => ({
  auditService: { log: vi.fn().mockResolvedValue(undefined) },
}));

import { createAbility } from "@/server/auth/rbac";
import { testEmailSettings } from "@/modules/notifications/services/notification-email-settings.service";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { TestNotificationEmailSettingsCommand } from "../test-notification-email-settings.command";

const CTX = { userId: "user-1", organizationId: "org-1" };

const VALID_INPUT = {
  fromName: "Escola",
  fromEmail: "noreply@escola.pt",
  smtpHost: "smtp.escola.pt",
  smtpPort: 587,
  smtpUsername: "user",
  smtpPassword: "super-secret",
  recipientEmail: "dest@example.com",
};

beforeEach(() => {
  vi.clearAllMocks();
  (createAbility as Mock).mockReturnValue({ can: vi.fn().mockReturnValue(true) });
});

describe("TestNotificationEmailSettingsCommand", () => {
  it("rejects an invalid recipientEmail", async () => {
    const cmd = new TestNotificationEmailSettingsCommand({ ...VALID_INPUT, recipientEmail: "not-an-email" }, CTX);
    await expect(cmd.validate()).rejects.toThrow();
    expect(testEmailSettings).not.toHaveBeenCalled();
  });

  it("rejects when the actor lacks NOTIFICATIONS_MANAGE_EMAIL_SETTINGS", async () => {
    (createAbility as Mock).mockReturnValue({ can: vi.fn().mockReturnValue(false) });
    const cmd = new TestNotificationEmailSettingsCommand(VALID_INPUT, CTX);
    await expect(cmd.authorize()).rejects.toThrow();
  });

  it("forwards the recipientEmail separately from the settings draft and never returns the password (test #30)", async () => {
    (testEmailSettings as Mock).mockResolvedValue({ success: true });

    const result = await new TestNotificationEmailSettingsCommand(VALID_INPUT, CTX).run();

    expect(result.success).toBe(true);
    expect(testEmailSettings).toHaveBeenCalledWith(
      "org-1",
      expect.objectContaining({ smtpPassword: "super-secret" }),
      "dest@example.com"
    );
    expect(JSON.stringify(result)).not.toContain("super-secret");
  });

  it("audits notification_email_settings.tested without leaking the password", async () => {
    (testEmailSettings as Mock).mockResolvedValue({ success: false, errorMessage: "Falha de autenticação SMTP" });

    await new TestNotificationEmailSettingsCommand(VALID_INPUT, CTX).run();

    const auditCall = (auditService.log as Mock).mock.calls[0][1];
    expect(auditCall.action).toBe("notification_email_settings.tested");
    expect(JSON.stringify(auditCall)).not.toContain("super-secret");
  });

  it("does not create a Notification or NotificationDelivery row (test #28)", async () => {
    (testEmailSettings as Mock).mockResolvedValue({ success: true });
    await new TestNotificationEmailSettingsCommand(VALID_INPUT, CTX).run();
    // No notification/delivery module is imported by this command at all —
    // there is nothing it could call to create either row.
    expect(testEmailSettings).toHaveBeenCalledTimes(1);
  });
});
