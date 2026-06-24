import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/modules/notifications/repositories/notification-event-rule.repository", () => ({
  findEventRule: vi.fn(),
}));

vi.mock("@/modules/notifications/repositories/notification-template.repository", () => ({
  findActiveTemplate: vi.fn(),
}));

import { findEventRule } from "@/modules/notifications/repositories/notification-event-rule.repository";
import { findActiveTemplate } from "@/modules/notifications/repositories/notification-template.repository";
import { resolveNotificationConfig } from "../notification-rule-engine.service";

const ORG_ID = "org-1";
const EVENT_TYPE = "payment.confirmed"; // real catalog entry

function makeRule(overrides: Record<string, unknown> = {}) {
  return {
    id: "rule-1",
    organizationId: ORG_ID,
    eventType: EVENT_TYPE,
    enabled: true,
    channels: ["IN_APP"],
    dedupeWindowMinutes: 1440,
    delayMinutes: 0,
    priority: "NORMAL",
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("resolveNotificationConfig — loads enabled rule (test #5)", () => {
  it("returns the rule when it exists and is enabled", async () => {
    (findEventRule as Mock).mockResolvedValue(makeRule());
    (findActiveTemplate as Mock).mockResolvedValue(null);

    const result = await resolveNotificationConfig(ORG_ID, EVENT_TYPE);

    expect(result).not.toBeNull();
    expect(result!.rule.enabled).toBe(true);
  });

  it("returns null when no rule exists for the event in this org", async () => {
    (findEventRule as Mock).mockResolvedValue(null);
    const result = await resolveNotificationConfig(ORG_ID, EVENT_TYPE);
    expect(result).toBeNull();
  });

  it("returns null for an event type with no catalog entry", async () => {
    const result = await resolveNotificationConfig(ORG_ID, "not.a.real.event");
    expect(result).toBeNull();
    expect(findEventRule).not.toHaveBeenCalled();
  });
});

describe("resolveNotificationConfig — skips disabled rule (test #6)", () => {
  it("returns null when the rule is disabled", async () => {
    (findEventRule as Mock).mockResolvedValue(makeRule({ enabled: false }));
    const result = await resolveNotificationConfig(ORG_ID, EVENT_TYPE);
    expect(result).toBeNull();
  });

  it("returns null when IN_APP is not one of the rule's enabled channels", async () => {
    (findEventRule as Mock).mockResolvedValue(makeRule({ channels: ["EMAIL"] }));
    const result = await resolveNotificationConfig(ORG_ID, EVENT_TYPE);
    expect(result).toBeNull();
  });
});

describe("resolveNotificationConfig — dedupe window and delay (tests #7, #8)", () => {
  it("returns the rule's own dedupeWindowMinutes, not a hardcoded value", async () => {
    (findEventRule as Mock).mockResolvedValue(makeRule({ dedupeWindowMinutes: 60 }));
    (findActiveTemplate as Mock).mockResolvedValue(null);
    const result = await resolveNotificationConfig(ORG_ID, EVENT_TYPE);
    expect(result!.rule.dedupeWindowMinutes).toBe(60);
  });

  it("returns the rule's own delayMinutes", async () => {
    (findEventRule as Mock).mockResolvedValue(makeRule({ delayMinutes: 30 }));
    (findActiveTemplate as Mock).mockResolvedValue(null);
    const result = await resolveNotificationConfig(ORG_ID, EVENT_TYPE);
    expect(result!.rule.delayMinutes).toBe(30);
  });
});

describe("resolveNotificationConfig — template resolution (tests #9, #10)", () => {
  it("loads the org's active template when one exists", async () => {
    (findEventRule as Mock).mockResolvedValue(makeRule());
    (findActiveTemplate as Mock).mockResolvedValue({
      titleTemplate: "Título personalizado",
      bodyTemplate: "Mensagem personalizada {{paymentNumber}}",
    });

    const result = await resolveNotificationConfig(ORG_ID, EVENT_TYPE);

    expect(result!.templateSource).toBe("ORG_TEMPLATE");
    expect(result!.titleTemplate).toBe("Título personalizado");
  });

  it("falls back to the catalog's hardcoded default when no org template exists", async () => {
    (findEventRule as Mock).mockResolvedValue(makeRule());
    (findActiveTemplate as Mock).mockResolvedValue(null);

    const result = await resolveNotificationConfig(ORG_ID, EVENT_TYPE);

    expect(result!.templateSource).toBe("CATALOG_DEFAULT");
    expect(result!.titleTemplate).toBe("Pagamento confirmado");
    expect(result!.bodyTemplate).toBe("O pagamento {{paymentNumber}} foi confirmado.");
  });
});
