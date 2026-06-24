import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/server/auth/rbac", () => ({
  getUserPermissions: vi.fn().mockResolvedValue(new Set()),
  createAbility: vi.fn().mockReturnValue({ can: vi.fn().mockReturnValue(true) }),
}));

vi.mock("@/modules/notifications/services/notification-template.service", () => ({
  createTemplate: vi.fn(),
}));

vi.mock("@/modules/audit-logs/services/audit.service", () => ({
  auditService: { log: vi.fn().mockResolvedValue(undefined) },
}));

import { createAbility } from "@/server/auth/rbac";
import { createTemplate } from "@/modules/notifications/services/notification-template.service";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { CreateNotificationTemplateCommand } from "../create-notification-template.command";

const CTX = { userId: "user-1", organizationId: "org-1" };

const VALID_INPUT = {
  eventType: "payment.confirmed",
  channel: "IN_APP" as const,
  name: "Modelo personalizado",
  titleTemplate: "Pagamento confirmado",
  bodyTemplate: "O pagamento {{paymentNumber}} foi confirmado.",
};

beforeEach(() => vi.clearAllMocks());

describe("CreateNotificationTemplateCommand", () => {
  it("creates the template scoped to the actor's organization and logs notification_template.created", async () => {
    (createTemplate as Mock).mockResolvedValue({
      id: "template-1",
      organizationId: "org-1",
      eventType: "payment.confirmed",
      channel: "IN_APP",
      titleTemplate: VALID_INPUT.titleTemplate,
      bodyTemplate: VALID_INPUT.bodyTemplate,
    });

    const cmd = new CreateNotificationTemplateCommand(VALID_INPUT, CTX);
    const result = await cmd.run();

    expect(result.id).toBe("template-1");
    expect(createTemplate).toHaveBeenCalledWith("org-1", VALID_INPUT);
    expect(auditService.log).toHaveBeenCalledWith(
      CTX,
      expect.objectContaining({ action: "notification_template.created", entity: "NotificationTemplate" })
    );
  });

  it("rejects when input fails schema validation", async () => {
    const cmd = new CreateNotificationTemplateCommand({ ...VALID_INPUT, name: "" }, CTX);
    await expect(cmd.validate()).rejects.toThrow("Dados inválidos");
    expect(createTemplate).not.toHaveBeenCalled();
  });

  it("rejects when the actor lacks NOTIFICATIONS_MANAGE_TEMPLATES (test #20)", async () => {
    (createAbility as Mock).mockReturnValue({ can: vi.fn().mockReturnValue(false) });
    const cmd = new CreateNotificationTemplateCommand(VALID_INPUT, CTX);
    await expect(cmd.authorize()).rejects.toThrow();
    expect(createTemplate).not.toHaveBeenCalled();
  });
});
