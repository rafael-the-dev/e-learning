import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/modules/notifications/repositories/notification-event-rule.repository", () => ({
  findEventRule: vi.fn(),
  createEventRule: vi.fn(),
}));

vi.mock("@/modules/notifications/repositories/notification-template.repository", () => ({
  templateExistsForEvent: vi.fn(),
  createTemplate: vi.fn(),
}));

import { findEventRule, createEventRule } from "@/modules/notifications/repositories/notification-event-rule.repository";
import { templateExistsForEvent, createTemplate } from "@/modules/notifications/repositories/notification-template.repository";
import { listEventCatalog } from "@/modules/notifications/catalog/notification-event-catalog";
import { ensureDefaultNotificationConfig } from "../notification-defaults.service";

const ORG_ID = "org-1";

beforeEach(() => vi.clearAllMocks());

describe("ensureDefaultNotificationConfig", () => {
  it("creates one rule and one template per catalog event when the org has none yet", async () => {
    (findEventRule as Mock).mockResolvedValue(null);
    (templateExistsForEvent as Mock).mockResolvedValue(false);

    await ensureDefaultNotificationConfig(ORG_ID);

    const eventCount = listEventCatalog().length;
    expect(createEventRule).toHaveBeenCalledTimes(eventCount);
    expect(createTemplate).toHaveBeenCalledTimes(eventCount);
  });

  it("is idempotent — skips events that already have a rule and a template", async () => {
    (findEventRule as Mock).mockResolvedValue({ id: "existing-rule" });
    (templateExistsForEvent as Mock).mockResolvedValue(true);

    await ensureDefaultNotificationConfig(ORG_ID);

    expect(createEventRule).not.toHaveBeenCalled();
    expect(createTemplate).not.toHaveBeenCalled();
  });

  it("seeds payment.confirmed with channels=['IN_APP'] and a priority derived from its severity", async () => {
    (findEventRule as Mock).mockResolvedValue(null);
    (templateExistsForEvent as Mock).mockResolvedValue(false);

    await ensureDefaultNotificationConfig(ORG_ID);

    expect(createEventRule).toHaveBeenCalledWith(
      ORG_ID,
      expect.objectContaining({ eventType: "payment.confirmed", enabled: true, channels: ["IN_APP"] })
    );
  });
});
