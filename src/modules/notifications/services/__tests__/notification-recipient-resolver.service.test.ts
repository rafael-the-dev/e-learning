import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

const { findFirst } = vi.hoisted(() => ({ findFirst: vi.fn() }));

vi.mock("@/server/db", () => ({
  getDb: vi.fn().mockResolvedValue({
    user: { findFirst },
  }),
}));

import { resolveRecipient } from "../notification-recipient-resolver.service";

const ORG_ID = "org-1";
const USER_ID = "user-1";

beforeEach(() => vi.clearAllMocks());

describe("resolveRecipient — IN_APP", () => {
  it("resolves to the recipientUserId without a DB lookup", async () => {
    const result = await resolveRecipient(ORG_ID, USER_ID, "IN_APP");
    expect(result).toBe(USER_ID);
    expect(findFirst).not.toHaveBeenCalled();
  });
});

describe("resolveRecipient — EMAIL", () => {
  it("resolves to the user's email when present", async () => {
    (findFirst as Mock).mockResolvedValue({ email: "user@example.com", phone: null });
    const result = await resolveRecipient(ORG_ID, USER_ID, "EMAIL");
    expect(result).toBe("user@example.com");
  });

  it("returns null when the user does not exist", async () => {
    (findFirst as Mock).mockResolvedValue(null);
    const result = await resolveRecipient(ORG_ID, USER_ID, "EMAIL");
    expect(result).toBeNull();
  });
});

describe("resolveRecipient — WHATSAPP / SMS", () => {
  it("resolves to the user's phone when present", async () => {
    (findFirst as Mock).mockResolvedValue({ email: "user@example.com", phone: "+351900000000" });
    expect(await resolveRecipient(ORG_ID, USER_ID, "WHATSAPP")).toBe("+351900000000");
    expect(await resolveRecipient(ORG_ID, USER_ID, "SMS")).toBe("+351900000000");
  });

  it("returns null when the user has no phone", async () => {
    (findFirst as Mock).mockResolvedValue({ email: "user@example.com", phone: null });
    expect(await resolveRecipient(ORG_ID, USER_ID, "WHATSAPP")).toBeNull();
    expect(await resolveRecipient(ORG_ID, USER_ID, "SMS")).toBeNull();
  });
});

describe("resolveRecipient — PUSH", () => {
  it("always returns null (no push token storage yet)", async () => {
    (findFirst as Mock).mockResolvedValue({ email: "user@example.com", phone: "+351900000000" });
    expect(await resolveRecipient(ORG_ID, USER_ID, "PUSH")).toBeNull();
  });
});
