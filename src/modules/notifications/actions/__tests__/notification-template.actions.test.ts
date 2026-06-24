import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/server/auth/context", () => ({
  requireOrganization: vi.fn(),
  requirePermission: vi.fn(),
}));

vi.mock("@/modules/notifications/services/notification-template.service", () => ({
  listTemplates: vi.fn(),
  previewTemplate: vi.fn(),
}));

import { requirePermission } from "@/server/auth/context";
import { AuthorizationError } from "@/shared/lib/command";
import { PERMISSIONS } from "@/server/auth/permissions";
import {
  listTemplates,
  previewTemplate,
} from "@/modules/notifications/services/notification-template.service";
import {
  listNotificationTemplatesAction,
  previewNotificationTemplateAction,
} from "../notification-template.actions";

const ADMIN_CTX = { userId: "user-1", organizationId: "org-1" };

beforeEach(() => vi.clearAllMocks());

describe("listNotificationTemplatesAction — RBAC", () => {
  it("rejects when the actor lacks NOTIFICATIONS_MANAGE_TEMPLATES (SECRETARY/TEACHER/STUDENT)", async () => {
    (requirePermission as Mock).mockRejectedValue(new AuthorizationError());

    const result = await listNotificationTemplatesAction({});

    expect(result.success).toBe(false);
    expect(listTemplates).not.toHaveBeenCalled();
  });

  it("gates on NOTIFICATIONS_MANAGE_TEMPLATES specifically", async () => {
    (requirePermission as Mock).mockResolvedValue(ADMIN_CTX);
    (listTemplates as Mock).mockResolvedValue({ data: [], total: 0 });

    await listNotificationTemplatesAction({});

    expect(requirePermission).toHaveBeenCalledWith(PERMISSIONS.NOTIFICATIONS_MANAGE_TEMPLATES);
  });

  it("succeeds for an ORG_ADMIN and scopes the query to their organization", async () => {
    (requirePermission as Mock).mockResolvedValue(ADMIN_CTX);
    (listTemplates as Mock).mockResolvedValue({ data: [{ id: "template-1" }], total: 1 });

    const result = await listNotificationTemplatesAction({ page: 1 });

    expect(result.success).toBe(true);
    expect(listTemplates).toHaveBeenCalledWith("org-1", { page: 1 });
  });
});

describe("previewNotificationTemplateAction — RBAC", () => {
  it("rejects when the actor lacks NOTIFICATIONS_MANAGE_TEMPLATES (SECRETARY/TEACHER/STUDENT)", async () => {
    (requirePermission as Mock).mockRejectedValue(new AuthorizationError());

    const result = await previewNotificationTemplateAction("template-1");

    expect(result.success).toBe(false);
    expect(previewTemplate).not.toHaveBeenCalled();
  });

  it("gates on NOTIFICATIONS_MANAGE_TEMPLATES specifically", async () => {
    (requirePermission as Mock).mockResolvedValue(ADMIN_CTX);
    (previewTemplate as Mock).mockResolvedValue({ title: "T", body: "B", missingVariables: [], sampleVariables: {} });

    await previewNotificationTemplateAction("template-1");

    expect(requirePermission).toHaveBeenCalledWith(PERMISSIONS.NOTIFICATIONS_MANAGE_TEMPLATES);
  });

  it("succeeds for an ORG_ADMIN", async () => {
    (requirePermission as Mock).mockResolvedValue(ADMIN_CTX);
    (previewTemplate as Mock).mockResolvedValue({ title: "T", body: "B", missingVariables: [], sampleVariables: {} });

    const result = await previewNotificationTemplateAction("template-1", { paymentNumber: "PAY-1" });

    expect(result.success).toBe(true);
    expect(previewTemplate).toHaveBeenCalledWith("org-1", "template-1", { paymentNumber: "PAY-1" });
  });
});
