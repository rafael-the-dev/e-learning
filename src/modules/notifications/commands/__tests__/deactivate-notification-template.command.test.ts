import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/server/auth/rbac", () => ({
  getUserPermissions: vi.fn().mockResolvedValue(new Set()),
  createAbility: vi.fn().mockReturnValue({ can: vi.fn().mockReturnValue(true) }),
}));

vi.mock("@/modules/notifications/repositories/notification-template.repository", () => ({
  findTemplateById: vi.fn(),
}));

vi.mock("@/modules/notifications/services/notification-template.service", () => ({
  deactivateTemplate: vi.fn(),
}));

vi.mock("@/modules/audit-logs/services/audit.service", () => ({
  auditService: { log: vi.fn().mockResolvedValue(undefined) },
}));

import { findTemplateById } from "@/modules/notifications/repositories/notification-template.repository";
import { deactivateTemplate } from "@/modules/notifications/services/notification-template.service";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { DeactivateNotificationTemplateCommand } from "../deactivate-notification-template.command";

const CTX = { userId: "user-1", organizationId: "org-1" };

function makeTemplate(overrides: Record<string, unknown> = {}) {
  return { id: "template-1", organizationId: "org-1", eventType: "payment.confirmed", channel: "IN_APP", isActive: true, ...overrides };
}

beforeEach(() => vi.clearAllMocks());

describe("DeactivateNotificationTemplateCommand (test #17)", () => {
  it("deactivates the template and logs notification_template.deactivated", async () => {
    (findTemplateById as Mock).mockResolvedValue(makeTemplate());
    (deactivateTemplate as Mock).mockResolvedValue(makeTemplate({ isActive: false }));

    const cmd = new DeactivateNotificationTemplateCommand({ templateId: "template-1" }, CTX);
    const result = await cmd.run();

    expect(result.isActive).toBe(false);
    expect(deactivateTemplate).toHaveBeenCalledWith("org-1", "template-1");
    expect(auditService.log).toHaveBeenCalledWith(
      CTX,
      expect.objectContaining({ action: "notification_template.deactivated" })
    );
  });

  it("rejects a cross-tenant template id", async () => {
    (findTemplateById as Mock).mockResolvedValue(null);
    const cmd = new DeactivateNotificationTemplateCommand({ templateId: "other-org-template" }, CTX);
    await expect(cmd.validate()).rejects.toThrow();
  });
});
