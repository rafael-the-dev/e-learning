import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

const { findFirst, update, updateMany, create } = vi.hoisted(() => ({
  findFirst: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  create: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  getDb: vi.fn().mockResolvedValue({
    notificationTemplate: { findFirst, update, updateMany, create },
  }),
}));

import {
  findTemplateById,
  updateTemplate,
  setTemplateActive,
  deactivateSiblingTemplates,
} from "../notification-template.repository";

const ORG_ID = "org-1";

beforeEach(() => vi.clearAllMocks());

describe("findTemplateById — tenant isolation", () => {
  it("scopes the lookup by organizationId", async () => {
    (findFirst as Mock).mockResolvedValue(null);

    await findTemplateById("template-1", ORG_ID);

    expect(findFirst).toHaveBeenCalledWith({
      where: { id: "template-1", organizationId: ORG_ID, deletedAt: null },
    });
  });
});

describe("updateTemplate — tenant isolation", () => {
  it("scopes the update by (id, organizationId) — a cross-tenant id matches zero rows", async () => {
    (update as Mock).mockResolvedValue({
      id: "template-1",
      organizationId: ORG_ID,
      eventType: "payment.confirmed",
      channel: "IN_APP",
      name: "Modelo",
      subject: null,
      titleTemplate: "T",
      bodyTemplate: "B",
      variables: "[]",
      language: "pt-PT",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    });

    await updateTemplate("template-1", ORG_ID, { name: "Novo nome" });

    expect(update).toHaveBeenCalledWith({
      where: { id: "template-1", organizationId: ORG_ID },
      data: { name: "Novo nome" },
    });
  });
});

describe("setTemplateActive — tenant isolation", () => {
  it("scopes the update by (id, organizationId)", async () => {
    (update as Mock).mockResolvedValue({
      id: "template-1",
      organizationId: ORG_ID,
      eventType: "payment.confirmed",
      channel: "IN_APP",
      name: "Modelo",
      subject: null,
      titleTemplate: "T",
      bodyTemplate: "B",
      variables: "[]",
      language: "pt-PT",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    });

    await setTemplateActive("template-1", ORG_ID, true);

    expect(update).toHaveBeenCalledWith({
      where: { id: "template-1", organizationId: ORG_ID },
      data: { isActive: true },
    });
  });
});

describe("deactivateSiblingTemplates — scoped to (org, event, channel, language), excludes the activated id", () => {
  it("only touches rows matching every scoping field, never another organization's", async () => {
    (updateMany as Mock).mockResolvedValue({ count: 2 });

    await deactivateSiblingTemplates(ORG_ID, "payment.confirmed", "IN_APP", "pt-PT", "template-1");

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        organizationId: ORG_ID,
        eventType: "payment.confirmed",
        channel: "IN_APP",
        language: "pt-PT",
        id: { not: "template-1" },
        isActive: true,
      },
      data: { isActive: false },
    });
  });
});
