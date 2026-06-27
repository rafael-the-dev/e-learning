import { describe, it, expect, vi, beforeEach } from "vitest";
import { NotFoundError } from "@/shared/lib/command";

// ── Mock the Prisma client (getDb) ───────────────────────────────────────────
const { db } = vi.hoisted(() => ({
  db: {
    role: { findFirst: vi.fn() },
    student: { findFirst: vi.fn(), update: vi.fn() },
    user: { findUnique: vi.fn(), create: vi.fn() },
    userOrganization: { upsert: vi.fn() },
    userRole: { upsert: vi.fn() },
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

import { ensureStudentPortalUser } from "../services/student-user-provisioning.service";

const ORG = "org-1";
const STUDENT = "student-1";

function studentRow(over: Partial<{ userId: string | null; email: string | null }> = {}) {
  return {
    id: STUDENT,
    userId: over.userId ?? null,
    email: "userId" in over || "email" in over ? over.email ?? null : "aluno@test.pt",
    firstName: "Ana",
    lastName: "Silva",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.role.findFirst.mockResolvedValue({ id: "role-student" });
  mockFindSettings.mockResolvedValue(null); // defaults: autoCreate=true, sendInvite=true, INVITE_LINK
  mockCreateInvite.mockResolvedValue({ token: "tok123", inviteUrl: "/set-password?token=tok123&email=aluno%40test.pt" });
  mockCreateNotification.mockResolvedValue({ id: "notif-1" });
  db.user.create.mockResolvedValue({ id: "new-user" });
  db.student.update.mockResolvedValue({});
  db.userOrganization.upsert.mockResolvedValue({});
  db.userRole.upsert.mockResolvedValue({});
  db.auditLog.create.mockResolvedValue({});
  // Default student load: linkable, with email. Conflict checks (where.userId) → none.
  db.student.findFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
    if (where.userId) return null; // conflict probe
    return studentRow();
  });
  db.user.findUnique.mockResolvedValue(null); // no existing user by email
});

describe("1. creates a user for an active student with an email", () => {
  it("creates the user, links Student.userId, assigns org + STUDENT role", async () => {
    const res = await ensureStudentPortalUser({ organizationId: ORG, studentId: STUDENT, reason: "ENROLLMENT_ACTIVATED" });
    expect(res.status).toBe("created");
    expect(res.userId).toBe("new-user");
    expect(db.user.create).toHaveBeenCalledTimes(1);
    expect(db.student.update).toHaveBeenCalledWith({ where: { id: STUDENT }, data: { userId: "new-user" } });
    expect(db.userOrganization.upsert).toHaveBeenCalledTimes(1);
    expect(db.userRole.upsert).toHaveBeenCalledTimes(1);
  });
});

describe("2. links an existing user with the same email", () => {
  it("links instead of creating", async () => {
    db.user.findUnique.mockResolvedValue({ id: "existing-user", passwordHash: "hash" });
    const res = await ensureStudentPortalUser({ organizationId: ORG, studentId: STUDENT, reason: "MANUAL" });
    expect(res.status).toBe("linked_existing_user");
    expect(res.userId).toBe("existing-user");
    expect(db.user.create).not.toHaveBeenCalled();
    expect(db.student.update).toHaveBeenCalledWith({ where: { id: STUDENT }, data: { userId: "existing-user" } });
  });
});

describe("3. already-linked student is not duplicated", () => {
  it("returns already_linked and does nothing", async () => {
    db.student.findFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
      if (where.userId) return null;
      return studentRow({ userId: "existing-link", email: "aluno@test.pt" });
    });
    const res = await ensureStudentPortalUser({ organizationId: ORG, studentId: STUDENT, reason: "ENROLLMENT_ACTIVATED" });
    expect(res.status).toBe("already_linked");
    expect(res.userId).toBe("existing-link");
    expect(db.user.create).not.toHaveBeenCalled();
    expect(db.student.update).not.toHaveBeenCalled();
  });
});

describe("4. student without email", () => {
  it("returns missing_email and creates no user", async () => {
    db.student.findFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
      if (where.userId) return null;
      return studentRow({ email: null });
    });
    const res = await ensureStudentPortalUser({ organizationId: ORG, studentId: STUDENT, reason: "ENROLLMENT_ACTIVATED" });
    expect(res.status).toBe("missing_email");
    expect(db.user.create).not.toHaveBeenCalled();
    expect(db.student.update).not.toHaveBeenCalled();
  });
});

describe("5. email already linked to another student", () => {
  it("returns email_conflict", async () => {
    db.user.findUnique.mockResolvedValue({ id: "existing-user", passwordHash: null });
    db.student.findFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
      if (where.userId) return { id: "another-student" }; // conflict: user already bound elsewhere
      return studentRow();
    });
    const res = await ensureStudentPortalUser({ organizationId: ORG, studentId: STUDENT, reason: "MANUAL" });
    expect(res.status).toBe("email_conflict");
    expect(db.student.update).not.toHaveBeenCalled();
    expect(db.user.create).not.toHaveBeenCalled();
  });
});

describe("6. STUDENT role assigned idempotently", () => {
  it("uses upsert keyed on the (userId, roleId, organizationId) unique", async () => {
    await ensureStudentPortalUser({ organizationId: ORG, studentId: STUDENT, reason: "ENROLLMENT_ACTIVATED" });
    const call = db.userRole.upsert.mock.calls[0][0];
    expect(call.where.userId_roleId_organizationId).toEqual({ userId: "new-user", roleId: "role-student", organizationId: ORG });
    expect(call.create).toMatchObject({ userId: "new-user", roleId: "role-student", organizationId: ORG });
  });
});

describe("7. running twice creates one user and one role", () => {
  it("second run sees the link and no-ops", async () => {
    // First run: no link yet. Second run: link present.
    let linked = false;
    db.student.findFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
      if (where.userId) return null;
      return studentRow({ userId: linked ? "new-user" : null, email: "aluno@test.pt" });
    });
    db.student.update.mockImplementation(async () => {
      linked = true;
      return {};
    });

    const first = await ensureStudentPortalUser({ organizationId: ORG, studentId: STUDENT, reason: "ENROLLMENT_ACTIVATED" });
    const second = await ensureStudentPortalUser({ organizationId: ORG, studentId: STUDENT, reason: "ENROLLMENT_ACTIVATED" });

    expect(first.status).toBe("created");
    expect(second.status).toBe("already_linked");
    expect(db.user.create).toHaveBeenCalledTimes(1);
    expect(db.userRole.upsert).toHaveBeenCalledTimes(1);
  });
});

describe("8. policy disabled skips provisioning", () => {
  it("returns skipped_by_policy without touching the student", async () => {
    mockFindSettings.mockResolvedValue({ autoCreateStudentUserOnActivation: false });
    const res = await ensureStudentPortalUser({ organizationId: ORG, studentId: STUDENT, reason: "ENROLLMENT_ACTIVATED" });
    expect(res.status).toBe("skipped_by_policy");
    expect(db.student.findFirst).not.toHaveBeenCalled();
    expect(db.user.create).not.toHaveBeenCalled();
  });
});

describe("8b. policy disabled is bypassed by an explicit MANUAL override", () => {
  it("MANUAL provisions even when autoCreate is off (admin override)", async () => {
    mockFindSettings.mockResolvedValue({ autoCreateStudentUserOnActivation: false });
    const res = await ensureStudentPortalUser({ organizationId: ORG, studentId: STUDENT, reason: "MANUAL" });
    expect(res.status).toBe("created");
    expect(db.user.create).toHaveBeenCalledTimes(1);
  });
});

describe("9. activation is never broken by a recoverable outcome", () => {
  it("resolves (does not throw) when the student has no email", async () => {
    db.student.findFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
      if (where.userId) return null;
      return studentRow({ email: null });
    });
    await expect(
      ensureStudentPortalUser({ organizationId: ORG, studentId: STUDENT, reason: "ENROLLMENT_ACTIVATED" })
    ).resolves.toMatchObject({ status: "missing_email" });
  });
});

describe("10. invite notification emitted when enabled (INVITE_LINK)", () => {
  it("creates an invite link and sends the account-created notification", async () => {
    const res = await ensureStudentPortalUser({ organizationId: ORG, studentId: STUDENT, reason: "ENROLLMENT_ACTIVATED" });
    expect(res.invited).toBe(true);
    expect(mockCreateInvite).toHaveBeenCalledWith("aluno@test.pt");
    expect(mockCreateNotification).toHaveBeenCalledTimes(1);
    const [, notif] = mockCreateNotification.mock.calls[0];
    expect(notif.type).toBe("student.portal_account_created");
    expect(notif.recipientUserId).toBe("new-user");
    expect(notif.actionUrl).toBe(res.inviteUrl);
  });
});

describe("11. TEMP_PASSWORD strategy never sends a plaintext password", () => {
  it("returns a temp password but never puts it in the notification", async () => {
    mockFindSettings.mockResolvedValue({
      autoCreateStudentUserOnActivation: true,
      sendStudentPortalInvite: true,
      studentPortalInviteStrategy: "TEMP_PASSWORD",
    });
    const res = await ensureStudentPortalUser({ organizationId: ORG, studentId: STUDENT, reason: "ENROLLMENT_ACTIVATED" });
    expect(res.status).toBe("created");
    expect(res.tempPassword).toBeTruthy();
    expect(mockCreateInvite).not.toHaveBeenCalled(); // no invite link for temp-password strategy
    const [, notif] = mockCreateNotification.mock.calls[0];
    const serialized = JSON.stringify(notif);
    expect(serialized).not.toContain(res.tempPassword as string);
    // Audit must never serialize the temp password either.
    const auditCall = db.auditLog.create.mock.calls[0][0];
    expect(JSON.stringify(auditCall)).not.toContain(res.tempPassword as string);
  });
});

describe("12. tenant isolation — student from another org cannot be provisioned", () => {
  it("throws NotFoundError when the student is not in the given organization", async () => {
    db.student.findFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
      if (where.userId) return null;
      return null; // student not found within this org scope
    });
    await expect(
      ensureStudentPortalUser({ organizationId: ORG, studentId: STUDENT, reason: "MANUAL" })
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(db.user.create).not.toHaveBeenCalled();
  });
});
