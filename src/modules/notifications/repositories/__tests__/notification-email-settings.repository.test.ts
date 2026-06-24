import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

const { findUnique, upsert, update } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  upsert: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  getDb: vi.fn().mockResolvedValue({
    notificationEmailSettings: { findUnique, upsert, update },
  }),
}));

import {
  findRawByOrganization,
  findByOrganization,
  upsertByOrganization,
  setEnabled,
  updateTestResult,
} from "../notification-email-settings.repository";

const ORG_ID = "org-1";

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "settings-1",
    organizationId: ORG_ID,
    providerType: "SMTP",
    isEnabled: false,
    fromName: "Escola",
    fromEmail: "noreply@escola.pt",
    replyTo: null,
    smtpHost: "smtp.escola.pt",
    smtpPort: 587,
    smtpUsername: "user",
    smtpPasswordEncrypted: "encrypted-blob",
    smtpSecure: true,
    lastTestedAt: null,
    lastTestStatus: null,
    lastTestError: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("findRawByOrganization", () => {
  it("returns the raw row including the encrypted password", async () => {
    (findUnique as Mock).mockResolvedValue(makeRow());
    const result = await findRawByOrganization(ORG_ID);
    expect(result?.smtpPasswordEncrypted).toBe("encrypted-blob");
    expect(findUnique).toHaveBeenCalledWith({ where: { organizationId: ORG_ID } });
  });

  it("returns null when no settings row exists", async () => {
    (findUnique as Mock).mockResolvedValue(null);
    expect(await findRawByOrganization(ORG_ID)).toBeNull();
  });
});

describe("findByOrganization — DTO never exposes the encrypted password (test #3)", () => {
  it("maps the row to a DTO without smtpPasswordEncrypted", async () => {
    (findUnique as Mock).mockResolvedValue(makeRow());
    const result = await findByOrganization(ORG_ID);
    expect(result).not.toHaveProperty("smtpPasswordEncrypted");
    expect(JSON.stringify(result)).not.toContain("encrypted-blob");
    expect(result?.fromEmail).toBe("noreply@escola.pt");
  });

  it("returns null when no settings row exists", async () => {
    (findUnique as Mock).mockResolvedValue(null);
    expect(await findByOrganization(ORG_ID)).toBeNull();
  });
});

describe("upsertByOrganization — encrypts/keeps password (tests #1, #2)", () => {
  it("creates a row with the given smtpPasswordEncrypted", async () => {
    (upsert as Mock).mockResolvedValue(makeRow());

    await upsertByOrganization(ORG_ID, {
      fromName: "Escola",
      fromEmail: "noreply@escola.pt",
      smtpHost: "smtp.escola.pt",
      smtpPort: 587,
      smtpUsername: "user",
      smtpPasswordEncrypted: "new-encrypted-blob",
      smtpSecure: true,
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: ORG_ID },
        create: expect.objectContaining({ smtpPasswordEncrypted: "new-encrypted-blob" }),
      })
    );
  });

  it("leaves smtpPasswordEncrypted untouched on update when omitted (password kept)", async () => {
    (upsert as Mock).mockResolvedValue(makeRow());

    await upsertByOrganization(ORG_ID, {
      fromName: "Escola",
      fromEmail: "noreply@escola.pt",
    });

    const call = (upsert as Mock).mock.calls[0][0];
    expect(call.update).not.toHaveProperty("smtpPasswordEncrypted");
  });

  it("replaces smtpPasswordEncrypted on update when explicitly given", async () => {
    (upsert as Mock).mockResolvedValue(makeRow());

    await upsertByOrganization(ORG_ID, {
      fromName: "Escola",
      fromEmail: "noreply@escola.pt",
      smtpPasswordEncrypted: "replacement-blob",
    });

    const call = (upsert as Mock).mock.calls[0][0];
    expect(call.update.smtpPasswordEncrypted).toBe("replacement-blob");
  });
});

describe("setEnabled", () => {
  it("toggles isEnabled for the organization's settings row", async () => {
    (update as Mock).mockResolvedValue(makeRow({ isEnabled: true }));
    const result = await setEnabled(ORG_ID, true);
    expect(update).toHaveBeenCalledWith({ where: { organizationId: ORG_ID }, data: { isEnabled: true } });
    expect(result.isEnabled).toBe(true);
  });
});

describe("updateTestResult", () => {
  it("persists lastTestedAt/lastTestStatus/lastTestError", async () => {
    (update as Mock).mockResolvedValue(makeRow());
    const testedAt = new Date();

    await updateTestResult(ORG_ID, "SUCCESS", null, testedAt);

    expect(update).toHaveBeenCalledWith({
      where: { organizationId: ORG_ID },
      data: { lastTestedAt: testedAt, lastTestStatus: "SUCCESS", lastTestError: null },
    });
  });
});
