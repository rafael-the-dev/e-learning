import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/server/auth/rbac", () => ({
  getUserPermissions: vi.fn().mockResolvedValue(new Set()),
  createAbility: vi.fn().mockReturnValue({ can: vi.fn().mockReturnValue(true) }),
}));

vi.mock("@/modules/notifications/services/notification-email-settings.service", () => ({
  enableEmailSettings: vi.fn(),
}));

vi.mock("@/modules/audit-logs/services/audit.service", () => ({
  auditService: { log: vi.fn().mockResolvedValue(undefined) },
}));

import { createAbility } from "@/server/auth/rbac";
import { enableEmailSettings } from "@/modules/notifications/services/notification-email-settings.service";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { EnableNotificationEmailSettingsCommand } from "../enable-notification-email-settings.command";
import { NotFoundError } from "@/shared/lib/command";

const CTX = { userId: "user-1", organizationId: "org-1" };

beforeEach(() => {
  vi.clearAllMocks();
  (createAbility as Mock).mockReturnValue({ can: vi.fn().mockReturnValue(true) });
});

describe("EnableNotificationEmailSettingsCommand", () => {
  it("enables settings and audits notification_email_settings.enabled", async () => {
    (enableEmailSettings as Mock).mockResolvedValue({ id: "settings-1", isEnabled: true });

    const result = await new EnableNotificationEmailSettingsCommand(undefined, CTX).run();

    expect(result.isEnabled).toBe(true);
    expect(auditService.log).toHaveBeenCalledWith(
      CTX,
      expect.objectContaining({ action: "notification_email_settings.enabled" })
    );
  });

  it("rejects when the actor lacks NOTIFICATIONS_MANAGE_EMAIL_SETTINGS", async () => {
    (createAbility as Mock).mockReturnValue({ can: vi.fn().mockReturnValue(false) });

    await expect(new EnableNotificationEmailSettingsCommand(undefined, CTX).run()).rejects.toThrow();
    expect(enableEmailSettings).not.toHaveBeenCalled();
  });

  it("propagates NotFoundError when no settings row exists yet", async () => {
    (enableEmailSettings as Mock).mockRejectedValue(new NotFoundError("NotificationEmailSettings", "org-1"));

    await expect(new EnableNotificationEmailSettingsCommand(undefined, CTX).run()).rejects.toThrow(NotFoundError);
  });
});
