import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/server/auth/rbac", () => ({
  getUserPermissions: vi.fn().mockResolvedValue(new Set()),
  createAbility: vi.fn().mockReturnValue({ can: vi.fn().mockReturnValue(true) }),
}));

vi.mock("@/modules/notifications/repositories/notification-event-rule.repository", () => ({
  findRuleById: vi.fn(),
}));

vi.mock("@/modules/notifications/services/notification-event-rule.service", () => ({
  updateRule: vi.fn(),
}));

vi.mock("@/modules/audit-logs/services/audit.service", () => ({
  auditService: { log: vi.fn().mockResolvedValue(undefined) },
}));

import { createAbility } from "@/server/auth/rbac";
import { findRuleById } from "@/modules/notifications/repositories/notification-event-rule.repository";
import { updateRule } from "@/modules/notifications/services/notification-event-rule.service";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { UpdateNotificationEventRuleCommand } from "../update-notification-event-rule.command";

const CTX = { userId: "user-1", organizationId: "org-1" };

function makeRule(overrides: Record<string, unknown> = {}) {
  return {
    id: "rule-1",
    organizationId: "org-1",
    eventType: "payment.confirmed",
    enabled: true,
    channels: ["IN_APP"],
    dedupeWindowMinutes: 1440,
    delayMinutes: 0,
    priority: "NORMAL",
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("UpdateNotificationEventRuleCommand — update rule (test #18)", () => {
  it("updates dedupeWindowMinutes/delayMinutes/priority and logs notification_rule.updated", async () => {
    (findRuleById as Mock).mockResolvedValue(makeRule());
    (updateRule as Mock).mockResolvedValue(makeRule({ dedupeWindowMinutes: 60, priority: "HIGH" }));

    const cmd = new UpdateNotificationEventRuleCommand(
      { ruleId: "rule-1", dedupeWindowMinutes: 60, priority: "HIGH" },
      CTX
    );
    const result = await cmd.run();

    expect(result.dedupeWindowMinutes).toBe(60);
    expect(updateRule).toHaveBeenCalledWith("org-1", "rule-1", { dedupeWindowMinutes: 60, priority: "HIGH" });
    expect(auditService.log).toHaveBeenCalledWith(
      CTX,
      expect.objectContaining({ action: "notification_rule.updated" })
    );
  });

  it("logs notification_rule.disabled when enabled flips from true to false", async () => {
    (findRuleById as Mock).mockResolvedValue(makeRule({ enabled: true }));
    (updateRule as Mock).mockResolvedValue(makeRule({ enabled: false }));

    const cmd = new UpdateNotificationEventRuleCommand({ ruleId: "rule-1", enabled: false }, CTX);
    await cmd.run();

    expect(auditService.log).toHaveBeenCalledWith(
      CTX,
      expect.objectContaining({ action: "notification_rule.disabled" })
    );
  });

  it("logs notification_rule.enabled when enabled flips from false to true", async () => {
    (findRuleById as Mock).mockResolvedValue(makeRule({ enabled: false }));
    (updateRule as Mock).mockResolvedValue(makeRule({ enabled: true }));

    const cmd = new UpdateNotificationEventRuleCommand({ ruleId: "rule-1", enabled: true }, CTX);
    await cmd.run();

    expect(auditService.log).toHaveBeenCalledWith(
      CTX,
      expect.objectContaining({ action: "notification_rule.enabled" })
    );
  });

  it("rejects when the actor lacks NOTIFICATIONS_MANAGE_RULES (test #20)", async () => {
    (findRuleById as Mock).mockResolvedValue(makeRule());
    (createAbility as Mock).mockReturnValue({ can: vi.fn().mockReturnValue(false) });

    const cmd = new UpdateNotificationEventRuleCommand({ ruleId: "rule-1", enabled: false }, CTX);
    await expect(cmd.authorize()).rejects.toThrow();
    expect(updateRule).not.toHaveBeenCalled();
  });

  it("rejects a cross-tenant rule id", async () => {
    (findRuleById as Mock).mockResolvedValue(null);
    const cmd = new UpdateNotificationEventRuleCommand({ ruleId: "other-org-rule", enabled: false }, CTX);
    await expect(cmd.validate()).rejects.toThrow();
  });
});
