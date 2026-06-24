import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/modules/notifications/repositories/notification-template.repository", () => ({
  createTemplate: vi.fn(),
  updateTemplate: vi.fn(),
  findTemplateById: vi.fn(),
  findManyTemplates: vi.fn(),
  setTemplateActive: vi.fn(),
  deactivateSiblingTemplates: vi.fn(),
}));

// Preview must never reach the notification repository — regression guard for
// "preview does not create notifications".
vi.mock("@/modules/notifications/repositories/notification.repository", () => ({
  createNotification: vi.fn(),
}));

import {
  createTemplate as createTemplateRow,
  updateTemplate as updateTemplateRow,
  findTemplateById,
  setTemplateActive,
  deactivateSiblingTemplates,
} from "@/modules/notifications/repositories/notification-template.repository";
import { createNotification as createNotificationRow } from "@/modules/notifications/repositories/notification.repository";
import {
  createTemplate,
  updateTemplate,
  activateTemplate,
  previewTemplate,
} from "../notification-template.service";

const ORG_ID = "org-1";
// Real catalog entry: variables ["paymentId", "paymentNumber"],
// sampleVariables { paymentId: "pay_demo123", paymentNumber: "PAY-2026-0001" }.
const EVENT_TYPE = "payment.confirmed";

function makeTemplate(overrides: Record<string, unknown> = {}) {
  return {
    id: "template-1",
    organizationId: ORG_ID,
    eventType: EVENT_TYPE,
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

describe("createTemplate — catalog variable validation", () => {
  it("rejects a body referencing a variable the catalog doesn't declare for this event", async () => {
    await expect(
      createTemplate(ORG_ID, {
        eventType: EVENT_TYPE,
        channel: "IN_APP",
        name: "Modelo",
        titleTemplate: "Pagamento confirmado",
        bodyTemplate: "Olá {{customerName}}, o pagamento foi confirmado.",
      })
    ).rejects.toThrow();

    expect(createTemplateRow).not.toHaveBeenCalled();
  });

  it("rejects an unknown event type", async () => {
    await expect(
      createTemplate(ORG_ID, {
        eventType: "not.a.real.event",
        channel: "IN_APP",
        name: "Modelo",
        titleTemplate: "T",
        bodyTemplate: "B",
      })
    ).rejects.toThrow();

    expect(createTemplateRow).not.toHaveBeenCalled();
  });

  it("creates the template when it only uses catalog-allowed variables", async () => {
    (createTemplateRow as Mock).mockResolvedValue(makeTemplate());

    const result = await createTemplate(ORG_ID, {
      eventType: EVENT_TYPE,
      channel: "IN_APP",
      name: "Modelo",
      titleTemplate: "Pagamento confirmado",
      bodyTemplate: "O pagamento {{paymentNumber}} foi confirmado.",
    });

    expect(result.id).toBe("template-1");
    expect(createTemplateRow).toHaveBeenCalledWith(
      ORG_ID,
      expect.objectContaining({ eventType: EVENT_TYPE })
    );
  });
});

describe("updateTemplate — catalog variable validation", () => {
  it("rejects an updated body referencing a disallowed variable", async () => {
    (findTemplateById as Mock).mockResolvedValue(makeTemplate());

    await expect(
      updateTemplate(ORG_ID, "template-1", { bodyTemplate: "Olá {{customerName}}" })
    ).rejects.toThrow();

    expect(updateTemplateRow).not.toHaveBeenCalled();
  });

  it("updates when the new text only uses catalog-allowed variables", async () => {
    (findTemplateById as Mock).mockResolvedValue(makeTemplate());
    (updateTemplateRow as Mock).mockResolvedValue(makeTemplate({ titleTemplate: "Pagamento OK" }));

    const result = await updateTemplate(ORG_ID, "template-1", { titleTemplate: "Pagamento OK" });

    expect(result.titleTemplate).toBe("Pagamento OK");
    expect(updateTemplateRow).toHaveBeenCalledWith("template-1", ORG_ID, { titleTemplate: "Pagamento OK" });
  });
});

describe("activateTemplate — one active template wins", () => {
  it("activates the template and deactivates siblings sharing (org, event, channel, language)", async () => {
    (findTemplateById as Mock).mockResolvedValue(makeTemplate());
    (setTemplateActive as Mock).mockResolvedValue(makeTemplate({ isActive: true }));

    await activateTemplate(ORG_ID, "template-1");

    expect(setTemplateActive).toHaveBeenCalledWith("template-1", ORG_ID, true);
    expect(deactivateSiblingTemplates).toHaveBeenCalledWith(
      ORG_ID,
      EVENT_TYPE,
      "IN_APP",
      "pt-PT",
      "template-1"
    );
  });

  it("scopes the sibling deactivation to the template's own organization only", async () => {
    const otherOrgTemplate = makeTemplate({ id: "template-2", organizationId: "org-2" });
    (findTemplateById as Mock).mockResolvedValue(otherOrgTemplate);
    (setTemplateActive as Mock).mockResolvedValue(otherOrgTemplate);

    await activateTemplate("org-2", "template-2");

    expect(deactivateSiblingTemplates).toHaveBeenCalledWith(
      "org-2",
      EVENT_TYPE,
      "IN_APP",
      "pt-PT",
      "template-2"
    );
    expect(deactivateSiblingTemplates).not.toHaveBeenCalledWith(
      ORG_ID,
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything()
    );
  });
});

describe("previewTemplate", () => {
  it("renders title/body against the catalog's sample variables", async () => {
    (findTemplateById as Mock).mockResolvedValue(makeTemplate());

    const preview = await previewTemplate(ORG_ID, "template-1");

    expect(preview.title).toBe("Pagamento confirmado");
    expect(preview.body).toBe("O pagamento PAY-2026-0001 foi confirmado.");
    expect(preview.missingVariables).toEqual([]);
  });

  it("merges caller-supplied overrides on top of the catalog's sample variables", async () => {
    (findTemplateById as Mock).mockResolvedValue(makeTemplate());

    const preview = await previewTemplate(ORG_ID, "template-1", { paymentNumber: "PAY-CUSTOM-001" });

    expect(preview.body).toBe("O pagamento PAY-CUSTOM-001 foi confirmado.");
    expect(preview.sampleVariables.paymentId).toBe("pay_demo123");
  });

  it("never creates a Notification or touches the notification repository", async () => {
    (findTemplateById as Mock).mockResolvedValue(makeTemplate());

    await previewTemplate(ORG_ID, "template-1");

    expect(createNotificationRow).not.toHaveBeenCalled();
  });
});
