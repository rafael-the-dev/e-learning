import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/server/auth/context", () => ({
  requireOrganization: vi.fn(),
  requirePermission: vi.fn(),
}));

vi.mock("@/modules/notifications/services/notification-event-rule.service", () => ({
  listRules: vi.fn(),
}));

import { requirePermission } from "@/server/auth/context";
import { AuthorizationError } from "@/shared/lib/command";
import { PERMISSIONS } from "@/server/auth/permissions";
import { listRules } from "@/modules/notifications/services/notification-event-rule.service";
import { listNotificationEventRulesAction } from "../notification-event-rule.actions";

const ADMIN_CTX = { userId: "user-1", organizationId: "org-1" };

beforeEach(() => vi.clearAllMocks());

describe("listNotificationEventRulesAction — RBAC", () => {
  it("rejects when the actor lacks NOTIFICATIONS_MANAGE_RULES (SECRETARY/TEACHER/STUDENT)", async () => {
    (requirePermission as Mock).mockRejectedValue(new AuthorizationError());

    const result = await listNotificationEventRulesAction();

    expect(result.success).toBe(false);
    expect(listRules).not.toHaveBeenCalled();
  });

  it("gates on NOTIFICATIONS_MANAGE_RULES specifically", async () => {
    (requirePermission as Mock).mockResolvedValue(ADMIN_CTX);
    (listRules as Mock).mockResolvedValue([]);

    await listNotificationEventRulesAction();

    expect(requirePermission).toHaveBeenCalledWith(PERMISSIONS.NOTIFICATIONS_MANAGE_RULES);
  });

  it("succeeds for an ORG_ADMIN and scopes the query to their organization", async () => {
    (requirePermission as Mock).mockResolvedValue(ADMIN_CTX);
    (listRules as Mock).mockResolvedValue([{ id: "rule-1" }]);

    const result = await listNotificationEventRulesAction();

    expect(result.success).toBe(true);
    expect(listRules).toHaveBeenCalledWith("org-1");
  });
});
