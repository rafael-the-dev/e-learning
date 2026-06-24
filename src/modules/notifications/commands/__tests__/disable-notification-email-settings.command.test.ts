import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/server/auth/rbac", () => ({
  getUserPermissions: vi.fn().mockResolvedValue(new Set()),
  createAbility: vi.fn().mockReturnValue({ can: vi.fn().mockReturnValue(true) }),
}));

vi.mock("@/modules/notifications/services/notification-email-settings.service", () => ({
  disableEmailSettings: vi.fn(),
}));

vi.mock("@/modules/audit-logs/services/audit.service", () => ({
  auditService: { log: vi.fn().mockResolvedValue(undefined) },
}));

import { createAbility } from "@/server/auth/rbac";
import { disableEmailSettings } from "@/modules/notifications/services/notification-email-settings.service";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { DisableNotificationEmailSettingsCommand } from "../disable-notification-email-settings.command";

const CTX = { userId: "user-1", organizationId: "org-1" };

beforeEach(() => {
  vi.clearAllMocks();
  (createAbility as Mock).mockReturnValue({ can: vi.fn().mockReturnValue(true) });
});

describe("DisableNotificationEmailSettingsCommand", () => {
  it("disables settings and audits notification_email_settings.disabled", async () => {
    (disableEmailSettings as Mock).mockResolvedValue({ id: "settings-1", isEnabled: false });

    const result = await new DisableNotificationEmailSettingsCommand(undefined, CTX).run();

    expect(result.isEnabled).toBe(false);
    expect(auditService.log).toHaveBeenCalledWith(
      CTX,
      expect.objectContaining({ action: "notification_email_settings.disabled" })
    );
  });

  it("rejects when the actor lacks NOTIFICATIONS_MANAGE_EMAIL_SETTINGS", async () => {
    (createAbility as Mock).mockReturnValue({ can: vi.fn().mockReturnValue(false) });

    await expect(new DisableNotificationEmailSettingsCommand(undefined, CTX).run()).rejects.toThrow();
    expect(disableEmailSettings).not.toHaveBeenCalled();
  });
});
