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
  updateTemplate: vi.fn(),
}));

vi.mock("@/modules/audit-logs/services/audit.service", () => ({
  auditService: { log: vi.fn().mockResolvedValue(undefined) },
}));

import { findTemplateById } from "@/modules/notifications/repositories/notification-template.repository";
import { updateTemplate } from "@/modules/notifications/services/notification-template.service";
import { UpdateNotificationTemplateCommand } from "../update-notification-template.command";

const CTX = { userId: "user-1", organizationId: "org-1" };

function makeTemplate(overrides: Record<string, unknown> = {}) {
  return {
    id: "template-1",
    organizationId: "org-1",
    eventType: "payment.confirmed",
    channel: "IN_APP",
    name: "Modelo",
    subject: null,
    titleTemplate: "Pagamento confirmado",
    bodyTemplate: "O pagamento {{paymentNumber}} foi confirmado.",
    variables: ["paymentNumber"],
    language: "pt-PT",
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("UpdateNotificationTemplateCommand — tenant isolation (test #16)", () => {
  it("rejects a template id that does not belong to the actor's organization", async () => {
    (findTemplateById as Mock).mockResolvedValue(null);

    const cmd = new UpdateNotificationTemplateCommand(
      { templateId: "cross-tenant-id", name: "Novo nome" },
      CTX
    );

    await expect(cmd.validate()).rejects.toThrow();
    expect(updateTemplate).not.toHaveBeenCalled();
  });

  it("updates a template belonging to the actor's organization", async () => {
    (findTemplateById as Mock).mockResolvedValue(makeTemplate());
    (updateTemplate as Mock).mockResolvedValue(makeTemplate({ name: "Novo nome" }));

    const cmd = new UpdateNotificationTemplateCommand({ templateId: "template-1", name: "Novo nome" }, CTX);
    const result = await cmd.run();

    expect(result.name).toBe("Novo nome");
    expect(updateTemplate).toHaveBeenCalledWith("org-1", "template-1", { name: "Novo nome" });
  });
});
