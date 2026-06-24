import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/server/auth/context", () => ({
  requireOrganization: vi.fn().mockResolvedValue({ userId: "user-1", organizationId: "org-1" }),
  requirePermission: vi.fn(),
}));

vi.mock("@/modules/notifications/services/notification-email-settings.service", () => ({
  getEmailSettings: vi.fn(),
}));

const runUpsert = vi.fn();
const runEnable = vi.fn();
const runDisable = vi.fn();
const runTest = vi.fn();

vi.mock("@/modules/notifications/commands/upsert-notification-email-settings.command", () => ({
  UpsertNotificationEmailSettingsCommand: vi.fn().mockImplementation(() => ({ run: runUpsert })),
}));
vi.mock("@/modules/notifications/commands/enable-notification-email-settings.command", () => ({
  EnableNotificationEmailSettingsCommand: vi.fn().mockImplementation(() => ({ run: runEnable })),
}));
vi.mock("@/modules/notifications/commands/disable-notification-email-settings.command", () => ({
  DisableNotificationEmailSettingsCommand: vi.fn().mockImplementation(() => ({ run: runDisable })),
}));
vi.mock("@/modules/notifications/commands/test-notification-email-settings.command", () => ({
  TestNotificationEmailSettingsCommand: vi.fn().mockImplementation(() => ({ run: runTest })),
}));

import { requirePermission } from "@/server/auth/context";
import { getEmailSettings } from "@/modules/notifications/services/notification-email-settings.service";
import {
  getNotificationEmailSettingsAction,
  upsertNotificationEmailSettingsAction,
  enableNotificationEmailSettingsAction,
  disableNotificationEmailSettingsAction,
  testNotificationEmailSettingsAction,
} from "../notification-email-settings.actions";

const AuthorizationError = class extends Error {};

beforeEach(() => vi.clearAllMocks());

describe("getNotificationEmailSettingsAction — requires NOTIFICATIONS_MANAGE_EMAIL_SETTINGS (test #29)", () => {
  it("fails when the actor lacks the permission", async () => {
    (requirePermission as Mock).mockRejectedValue(new AuthorizationError("Sem permissão"));

    const result = await getNotificationEmailSettingsAction();

    expect(result.success).toBe(false);
    expect(getEmailSettings).not.toHaveBeenCalled();
  });

  it("returns settings without the password when authorized", async () => {
    (requirePermission as Mock).mockResolvedValue({ userId: "user-1", organizationId: "org-1" });
    (getEmailSettings as Mock).mockResolvedValue({ id: "settings-1", fromEmail: "noreply@escola.pt" });

    const result = await getNotificationEmailSettingsAction();

    expect(result).toEqual({ success: true, data: { id: "settings-1", fromEmail: "noreply@escola.pt" } });
    expect(JSON.stringify(result)).not.toMatch(/password/i);
  });
});

describe("upsertNotificationEmailSettingsAction", () => {
  it("delegates to UpsertNotificationEmailSettingsCommand and never returns the password (test #30)", async () => {
    runUpsert.mockResolvedValue({ id: "settings-1", fromEmail: "noreply@escola.pt" });

    const result = await upsertNotificationEmailSettingsAction({
      fromName: "Escola",
      fromEmail: "noreply@escola.pt",
      smtpPassword: "super-secret",
    });

    expect(runUpsert).toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(JSON.stringify(result)).not.toContain("super-secret");
  });
});

describe("enableNotificationEmailSettingsAction / disableNotificationEmailSettingsAction", () => {
  it("delegates enable to EnableNotificationEmailSettingsCommand", async () => {
    runEnable.mockResolvedValue({ id: "settings-1", isEnabled: true });
    const result = await enableNotificationEmailSettingsAction();
    expect(runEnable).toHaveBeenCalled();
    expect(result).toEqual({ success: true, data: { id: "settings-1", isEnabled: true } });
  });

  it("delegates disable to DisableNotificationEmailSettingsCommand", async () => {
    runDisable.mockResolvedValue({ id: "settings-1", isEnabled: false });
    const result = await disableNotificationEmailSettingsAction();
    expect(runDisable).toHaveBeenCalled();
    expect(result).toEqual({ success: true, data: { id: "settings-1", isEnabled: false } });
  });
});

describe("testNotificationEmailSettingsAction", () => {
  it("delegates to TestNotificationEmailSettingsCommand", async () => {
    runTest.mockResolvedValue({ success: true });

    const result = await testNotificationEmailSettingsAction({
      fromName: "Escola",
      fromEmail: "noreply@escola.pt",
      recipientEmail: "dest@example.com",
    });

    expect(runTest).toHaveBeenCalled();
    expect(result).toEqual({ success: true, data: { success: true } });
  });
});
