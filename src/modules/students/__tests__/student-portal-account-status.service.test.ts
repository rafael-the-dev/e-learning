import { describe, it, expect, vi, beforeEach } from "vitest";
import { NotFoundError } from "@/shared/lib/command";

const { db } = vi.hoisted(() => ({
  db: {
    student: { findFirst: vi.fn(), update: vi.fn() },
    user: { findUnique: vi.fn(), delete: vi.fn() },
    verificationToken: { findFirst: vi.fn(), deleteMany: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));
vi.mock("@/server/db", () => ({ getDb: async () => db }));

const { mockFindSettings, mockCreateInvite, mockCreateNotification } = vi.hoisted(() => ({
  mockFindSettings: vi.fn(),
  mockCreateInvite: vi.fn(),
  mockCreateNotification: vi.fn(),
}));
vi.mock("@/modules/organizations/repositories/settings.repository", () => ({ findSettings: mockFindSettings }));
vi.mock("@/modules/users/services/account-invite.service", () => ({ createStudentPortalInvite: mockCreateInvite }));
vi.mock("@/modules/notifications/services/notification.service", () => ({ createNotification: mockCreateNotification }));

import {
  getStudentPortalAccountStatus,
  resendStudentPortalInvite,
  unlinkStudentPortalAccount,
} from "../services/student-user-provisioning.service";

const ORG = "org-1";
const STUDENT = "student-1";
const NOW = new Date("2026-06-27T12:00:00Z");
const FUTURE = new Date("2026-07-01T12:00:00Z");
const PAST = new Date("2026-06-01T12:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  mockFindSettings.mockResolvedValue(null); // defaults: autoCreate true
  mockCreateInvite.mockResolvedValue({ token: "tok", inviteUrl: "/set-password?token=tok&email=a%40b.pt" });
  mockCreateNotification.mockResolvedValue({ id: "n1" });
  db.student.update.mockResolvedValue({});
  db.verificationToken.deleteMany.mockResolvedValue({});
  db.verificationToken.findFirst.mockResolvedValue(null);
  db.auditLog.create.mockResolvedValue({});
});

// Load probe: where.id → student row; where.userId → conflict probe.
function setStudent(row: Record<string, unknown> | null, conflict: Record<string, unknown> | null = null) {
  db.student.findFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
    where.userId ? conflict : row
  );
}

describe("getStudentPortalAccountStatus", () => {
  it("1. linked — active account (has password)", async () => {
    setStudent({ id: STUDENT, userId: "u1", email: "a@b.pt" });
    db.user.findUnique.mockResolvedValue({ id: "u1", name: "Ana", email: "a@b.pt", isActive: true, passwordHash: "h", lastLoginAt: null });
    const dto = await getStudentPortalAccountStatus(STUDENT, ORG, NOW);
    expect(dto.status).toBe("linked");
    expect(dto.linkedUser).toMatchObject({ id: "u1", status: "ACTIVE" });
    expect(JSON.stringify(dto)).not.toContain("passwordHash");
  });

  it("2. not_linked — no user, has email", async () => {
    setStudent({ id: STUDENT, userId: null, email: "a@b.pt" });
    db.user.findUnique.mockResolvedValue(null); // findUnique by email → none
    const dto = await getStudentPortalAccountStatus(STUDENT, ORG, NOW);
    expect(dto.status).toBe("not_linked");
    expect(dto.linkedUser).toBeUndefined();
  });

  it("3. missing_email — no user, no email", async () => {
    setStudent({ id: STUDENT, userId: null, email: null });
    const dto = await getStudentPortalAccountStatus(STUDENT, ORG, NOW);
    expect(dto.status).toBe("missing_email");
  });

  it("4. email_conflict — email already bound to another student", async () => {
    setStudent({ id: STUDENT, userId: null, email: "a@b.pt" }, { id: "other-student" });
    db.user.findUnique.mockResolvedValue({ id: "u1" }); // existing user by email
    const dto = await getStudentPortalAccountStatus(STUDENT, ORG, NOW);
    expect(dto.status).toBe("email_conflict");
  });

  it("5. invite_pending — linked, no password, active token", async () => {
    setStudent({ id: STUDENT, userId: "u1", email: "a@b.pt" });
    db.user.findUnique.mockResolvedValue({ id: "u1", name: "Ana", email: "a@b.pt", isActive: true, passwordHash: null, lastLoginAt: null });
    db.verificationToken.findFirst.mockResolvedValue({ expires: FUTURE });
    const dto = await getStudentPortalAccountStatus(STUDENT, ORG, NOW);
    expect(dto.status).toBe("invite_pending");
    expect(dto.invite).toMatchObject({ status: "active", expiresAt: FUTURE });
  });

  it("6. invite_expired — linked, no password, expired token", async () => {
    setStudent({ id: STUDENT, userId: "u1", email: "a@b.pt" });
    db.user.findUnique.mockResolvedValue({ id: "u1", name: "Ana", email: "a@b.pt", isActive: true, passwordHash: null, lastLoginAt: null });
    db.verificationToken.findFirst.mockResolvedValue({ expires: PAST });
    const dto = await getStudentPortalAccountStatus(STUDENT, ORG, NOW);
    expect(dto.status).toBe("invite_expired");
    expect(dto.invite).toMatchObject({ status: "expired" });
  });

  it("7. disabled_by_policy — not linked + auto-create off", async () => {
    mockFindSettings.mockResolvedValue({ autoCreateStudentUserOnActivation: false });
    setStudent({ id: STUDENT, userId: null, email: "a@b.pt" });
    db.user.findUnique.mockResolvedValue(null);
    const dto = await getStudentPortalAccountStatus(STUDENT, ORG, NOW);
    expect(dto.status).toBe("disabled_by_policy");
    expect(dto.policy.autoCreateStudentUserOnActivation).toBe(false);
  });

  it("15. tenant isolation — student not in org throws NotFoundError", async () => {
    setStudent(null);
    await expect(getStudentPortalAccountStatus(STUDENT, ORG, NOW)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("resendStudentPortalInvite", () => {
  it("10. generates a new token + notification for a linked, not-yet-active account", async () => {
    setStudent({ id: STUDENT, userId: "u1" });
    db.user.findUnique.mockResolvedValue({ id: "u1", email: "a@b.pt", name: "Ana", passwordHash: null });
    const res = await resendStudentPortalInvite(STUDENT, ORG, "actor-1");
    expect(res.status).toBe("invite_resent");
    expect(res.inviteUrl).toBeTruthy();
    expect(db.verificationToken.deleteMany).toHaveBeenCalledWith({ where: { identifier: "a@b.pt" } });
    expect(mockCreateInvite).toHaveBeenCalledWith("a@b.pt");
    expect(mockCreateNotification).toHaveBeenCalledTimes(1);
  });

  it("11. never exposes a password (resend deals only in invite links)", async () => {
    setStudent({ id: STUDENT, userId: "u1" });
    db.user.findUnique.mockResolvedValue({ id: "u1", email: "a@b.pt", name: "Ana", passwordHash: null });
    const res = await resendStudentPortalInvite(STUDENT, ORG, "actor-1");
    // Resend issues only a set-password invite link — never a credential.
    expect(res).not.toHaveProperty("tempPassword");
    expect(mockCreateInvite).toHaveBeenCalledTimes(1);
    const [, notif] = mockCreateNotification.mock.calls[0];
    // The only "password" reference allowed is the /set-password invite URL itself.
    expect(notif.actionUrl).toContain("/set-password");
    expect(notif.message ?? "").not.toMatch(/palavra-passe\s*:/i); // no inline credential
  });

  it("is a no-op (already_active) when the account already has a password", async () => {
    setStudent({ id: STUDENT, userId: "u1" });
    db.user.findUnique.mockResolvedValue({ id: "u1", email: "a@b.pt", name: "Ana", passwordHash: "h" });
    const res = await resendStudentPortalInvite(STUDENT, ORG, "actor-1");
    expect(res.status).toBe("already_active");
    expect(db.verificationToken.deleteMany).not.toHaveBeenCalled();
    expect(mockCreateInvite).not.toHaveBeenCalled();
  });
});

describe("unlinkStudentPortalAccount", () => {
  it("12. clears Student.userId and does NOT delete the User", async () => {
    setStudent({ id: STUDENT, userId: "u1" });
    db.user.findUnique.mockResolvedValue({ email: "a@b.pt" });
    const res = await unlinkStudentPortalAccount(STUDENT, ORG, "actor-1");
    expect(res.status).toBe("unlinked");
    expect(db.student.update).toHaveBeenCalledWith({ where: { id: STUDENT }, data: { userId: null } });
    expect(db.user.delete).not.toHaveBeenCalled();
    expect(db.auditLog.create).toHaveBeenCalled();
  });

  it("returns not_linked when there is nothing to unlink", async () => {
    setStudent({ id: STUDENT, userId: null });
    const res = await unlinkStudentPortalAccount(STUDENT, ORG, "actor-1");
    expect(res.status).toBe("not_linked");
    expect(db.student.update).not.toHaveBeenCalled();
  });

  it("tenant isolation — student not in org throws NotFoundError", async () => {
    setStudent(null);
    await expect(unlinkStudentPortalAccount(STUDENT, ORG, "actor-1")).rejects.toBeInstanceOf(NotFoundError);
  });
});
