import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  db: {
    student: { findFirst: vi.fn() },
    user: { findUnique: vi.fn(), create: vi.fn() },
    role: { findFirst: vi.fn() },
    userOrganization: { upsert: vi.fn() },
    userRole: { upsert: vi.fn() },
    guardianStudent: { findFirst: vi.fn(), create: vi.fn() },
    auditLog: { create: vi.fn() },
  },
  createStudentPortalInvite: vi.fn(),
  createNotification: vi.fn(),
}));

vi.mock("@/server/db", () => ({ getDb: vi.fn().mockResolvedValue(h.db) }));
vi.mock("@/modules/users/services/account-invite.service", () => ({
  createStudentPortalInvite: h.createStudentPortalInvite,
}));
vi.mock("@/modules/notifications/services/notification.service", () => ({
  createNotification: h.createNotification,
}));

import { ensureGuardianPortalUser } from "../guardian-provisioning.service";

const baseInput = {
  organizationId: "org-1",
  guardianEmail: "Parent@Example.PT",
  guardianName: "Maria Silva",
  studentId: "stu-1",
  relationshipType: "MOTHER",
  triggeredByUserId: "admin-1",
  reason: "MANUAL" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  h.db.student.findFirst.mockResolvedValue({ id: "stu-1" });
  h.db.role.findFirst.mockResolvedValue({ id: "guardian-role" });
  h.db.userOrganization.upsert.mockResolvedValue({});
  h.db.userRole.upsert.mockResolvedValue({});
  h.db.auditLog.create.mockResolvedValue({});
  h.db.guardianStudent.findFirst.mockResolvedValue(null);
  h.db.guardianStudent.create.mockResolvedValue({ id: "gs-1" });
  h.createStudentPortalInvite.mockResolvedValue({ token: "tok", inviteUrl: "/set-password?token=tok" });
  h.createNotification.mockResolvedValue({});
});

describe("ensureGuardianPortalUser — create new guardian user", () => {
  it("creates the user, assigns GUARDIAN role, links the student and issues an invite", async () => {
    h.db.user.findUnique.mockResolvedValue(null);
    h.db.user.create.mockResolvedValue({ id: "user-new" });

    const res = await ensureGuardianPortalUser(baseInput);

    expect(res.status).toBe("created");
    expect(res.userId).toBe("user-new");
    expect(res.guardianStudentId).toBe("gs-1");
    expect(res.invited).toBe(true);
    expect(res.inviteUrl).toBe("/set-password?token=tok");

    // Email is normalized to lowercase before user creation/lookup.
    expect(h.db.user.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ email: "parent@example.pt", passwordHash: null }) })
    );
    // GUARDIAN role assigned via the resolved role id.
    expect(h.db.userRole.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ roleId: "guardian-role" }) })
    );
    // Never stores or returns a plaintext password.
    expect(res).not.toHaveProperty("tempPassword");
  });
});

describe("ensureGuardianPortalUser — existing user", () => {
  it("links an existing non-student/non-teacher user", async () => {
    h.db.user.findUnique.mockResolvedValue({
      id: "user-existing",
      passwordHash: "hash",
      studentProfile: null,
      teacherProfile: null,
    });

    const res = await ensureGuardianPortalUser(baseInput);
    expect(res.status).toBe("linked_existing_user");
    expect(res.userId).toBe("user-existing");
    // Has a password already → no invite issued.
    expect(res.invited).toBe(false);
    expect(h.createStudentPortalInvite).not.toHaveBeenCalled();
  });

  it("is idempotent — an existing active link returns already_linked", async () => {
    h.db.user.findUnique.mockResolvedValue({
      id: "user-existing",
      passwordHash: "hash",
      studentProfile: null,
      teacherProfile: null,
    });
    h.db.guardianStudent.findFirst.mockResolvedValue({ id: "gs-existing" });

    const res = await ensureGuardianPortalUser(baseInput);
    expect(res.status).toBe("already_linked");
    expect(res.guardianStudentId).toBe("gs-existing");
    // No duplicate link created.
    expect(h.db.guardianStudent.create).not.toHaveBeenCalled();
  });

  it("rejects co-opting a student's own login (email_conflict)", async () => {
    h.db.user.findUnique.mockResolvedValue({
      id: "user-student",
      passwordHash: "hash",
      studentProfile: { id: "stu-9" },
      teacherProfile: null,
    });

    const res = await ensureGuardianPortalUser(baseInput);
    expect(res.status).toBe("email_conflict");
    expect(h.db.guardianStudent.create).not.toHaveBeenCalled();
    expect(h.db.userRole.upsert).not.toHaveBeenCalled();
  });
});

describe("ensureGuardianPortalUser — guard rails", () => {
  it("returns missing_email when no email is provided", async () => {
    const res = await ensureGuardianPortalUser({ ...baseInput, guardianEmail: "   " });
    expect(res.status).toBe("missing_email");
    expect(h.db.user.findUnique).not.toHaveBeenCalled();
  });

  it("throws when the student is not in the organization (tenant isolation)", async () => {
    h.db.student.findFirst.mockResolvedValue(null);
    await expect(ensureGuardianPortalUser(baseInput)).rejects.toThrow();
  });
});

describe("ensureGuardianPortalUser — duplicate-link protection (M3)", () => {
  // The active-link uniqueness is a SQL Server FILTERED unique index
  // (guardian_students_active_link_key), so a true concurrent-duplicate race can
  // only be exercised by an integration test against a real DB. At the unit
  // level we assert the surrounding contract: ensureGuardianLink is a
  // find-then-create, and a unique-violation thrown by `create` (the index
  // firing on a race) PROPAGATES — it is never swallowed into a fake success.
  it("propagates a unique-violation raised by guardian_students_active_link_key", async () => {
    h.db.user.findUnique.mockResolvedValue(null);
    h.db.user.create.mockResolvedValue({ id: "user-new" });
    h.db.guardianStudent.findFirst.mockResolvedValue(null); // race: both callers pass the findFirst
    h.db.guardianStudent.create.mockRejectedValue(
      Object.assign(new Error("Unique constraint failed"), { code: "P2002" })
    );

    await expect(ensureGuardianPortalUser(baseInput)).rejects.toThrow();
  });

  it("reuses an existing active link instead of creating a duplicate", async () => {
    h.db.user.findUnique.mockResolvedValue({
      id: "user-existing",
      passwordHash: "hash",
      studentProfile: null,
      teacherProfile: null,
    });
    h.db.guardianStudent.findFirst.mockResolvedValue({ id: "gs-existing" });

    const res = await ensureGuardianPortalUser(baseInput);
    expect(res.status).toBe("already_linked");
    expect(h.db.guardianStudent.create).not.toHaveBeenCalled();
  });
});
