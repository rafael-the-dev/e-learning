import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

const { findFirst, update } = vi.hoisted(() => ({
  findFirst: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  getDb: vi.fn().mockResolvedValue({
    notificationEventRule: { findFirst, update },
  }),
}));

import { findRuleById, findEventRule, updateEventRule } from "../notification-event-rule.repository";

const ORG_ID = "org-1";

beforeEach(() => vi.clearAllMocks());

describe("findRuleById — tenant isolation", () => {
  it("scopes the lookup by organizationId", async () => {
    (findFirst as Mock).mockResolvedValue(null);

    await findRuleById("rule-1", ORG_ID);

    expect(findFirst).toHaveBeenCalledWith({
      where: { id: "rule-1", organizationId: ORG_ID, deletedAt: null },
    });
  });
});

describe("findEventRule — tenant isolation", () => {
  it("scopes the lookup by (organizationId, eventType)", async () => {
    (findFirst as Mock).mockResolvedValue(null);

    await findEventRule(ORG_ID, "payment.confirmed");

    expect(findFirst).toHaveBeenCalledWith({
      where: { organizationId: ORG_ID, eventType: "payment.confirmed", deletedAt: null },
    });
  });
});

describe("updateEventRule — tenant isolation", () => {
  it("scopes the update by (id, organizationId) — a cross-tenant id matches zero rows", async () => {
    (update as Mock).mockResolvedValue({
      id: "rule-1",
      organizationId: ORG_ID,
      eventType: "payment.confirmed",
      enabled: false,
      channels: '["IN_APP"]',
      dedupeWindowMinutes: 1440,
      delayMinutes: 0,
      priority: "NORMAL",
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    });

    await updateEventRule("rule-1", ORG_ID, { enabled: false });

    expect(update).toHaveBeenCalledWith({
      where: { id: "rule-1", organizationId: ORG_ID },
      data: { enabled: false },
    });
  });

  it("serializes channels to JSON when provided", async () => {
    (update as Mock).mockResolvedValue({
      id: "rule-1",
      organizationId: ORG_ID,
      eventType: "payment.confirmed",
      enabled: true,
      channels: '["IN_APP"]',
      dedupeWindowMinutes: 1440,
      delayMinutes: 0,
      priority: "NORMAL",
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    });

    await updateEventRule("rule-1", ORG_ID, { channels: ["IN_APP"] });

    expect(update).toHaveBeenCalledWith({
      where: { id: "rule-1", organizationId: ORG_ID },
      data: { channels: JSON.stringify(["IN_APP"]) },
    });
  });
});
