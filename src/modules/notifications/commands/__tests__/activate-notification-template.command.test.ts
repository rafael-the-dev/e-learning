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
  activateTemplate: vi.fn(),
}));

vi.mock("@/modules/audit-logs/services/audit.service", () => ({
  auditService: { log: vi.fn().mockResolvedValue(undefined) },
}));

import { createAbility } from "@/server/auth/rbac";
import { findTemplateById } from "@/modules/notifications/repositories/notification-template.repository";
import { activateTemplate } from "@/modules/notifications/services/notification-template.service";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { ActivateNotificationTemplateCommand } from "../activate-notification-template.command";

const CTX = { userId: "user-1", organizationId: "org-1" };

function makeTemplate(overrides: Record<string, unknown> = {}) {
  return {
    id: "template-1",
    organizationId: "org-1",
    eventType: "payment.confirmed",
    channel: "IN_APP",
    isActive: false,
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("ActivateNotificationTemplateCommand", () => {
  it("lets an ORG_ADMIN activate a template and calls service.activateTemplate", async () => {
    (findTemplateById as Mock).mockResolvedValue(makeTemplate());
    (activateTemplate as Mock).mockResolvedValue(makeTemplate({ isActive: true }));

    const cmd = new ActivateNotificationTemplateCommand({ templateId: "template-1" }, CTX);
    const result = await cmd.run();

    expect(result.isActive).toBe(true);
    expect(activateTemplate).toHaveBeenCalledWith("org-1", "template-1");
  });

  it("logs notification_template.activated", async () => {
    (findTemplateById as Mock).mockResolvedValue(makeTemplate());
    (activateTemplate as Mock).mockResolvedValue(makeTemplate({ isActive: true }));

    const cmd = new ActivateNotificationTemplateCommand({ templateId: "template-1" }, CTX);
    await cmd.run();

    expect(auditService.log).toHaveBeenCalledWith(
      CTX,
      expect.objectContaining({ action: "notification_template.activated", entity: "NotificationTemplate" })
    );
  });

  it("rejects when the actor lacks NOTIFICATIONS_MANAGE_TEMPLATES", async () => {
    (findTemplateById as Mock).mockResolvedValue(makeTemplate());
    (createAbility as Mock).mockReturnValue({ can: vi.fn().mockReturnValue(false) });

    const cmd = new ActivateNotificationTemplateCommand({ templateId: "template-1" }, CTX);
    await expect(cmd.authorize()).rejects.toThrow();
    expect(activateTemplate).not.toHaveBeenCalled();
  });

  it("rejects a cross-tenant template id", async () => {
    (findTemplateById as Mock).mockResolvedValue(null);

    const cmd = new ActivateNotificationTemplateCommand({ templateId: "other-org-template" }, CTX);
    await expect(cmd.validate()).rejects.toThrow();
    expect(activateTemplate).not.toHaveBeenCalled();
  });
});
