import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { getDb } from "@/server/db";
import { NotFoundError } from "@/shared/lib/command";
import { findSettings } from "@/modules/organizations/repositories/settings.repository";
import { createStudentPortalInvite } from "@/modules/users/services/account-invite.service";
import { createNotification } from "@/modules/notifications/services/notification.service";

// =============================================================================
// STUDENT USER PROVISIONING
// Ensures a Student has a linked platform login (STUDENT role) so they can use
// the Student Portal. Designed to run on enrollment activation, but is a pure,
// idempotent service callable from anywhere (event handler, manual action,
// import). Never throws for recoverable business outcomes (missing email,
// email conflict, policy-disabled) — those are returned as a status so the
// caller (e.g. enrollment activation) is never broken by provisioning. Throws
// only for genuine programming/data errors (student not in org, missing system
// role).
// =============================================================================

export type StudentProvisionReason = "ENROLLMENT_ACTIVATED" | "MANUAL" | "IMPORT";

export type StudentProvisionStatus =
  | "created"
  | "linked_existing_user"
  | "already_linked"
  | "missing_email"
  | "email_conflict"
  | "skipped_by_policy";

export type StudentPortalInviteStrategy = "INVITE_LINK" | "TEMP_PASSWORD";

export interface EnsureStudentPortalUserInput {
  organizationId: string;
  studentId: string;
  triggeredByUserId?: string | null;
  reason: StudentProvisionReason;
}

export interface StudentProvisionResult {
  status: StudentProvisionStatus;
  userId?: string;
  /** Set only for a freshly created TEMP_PASSWORD account. NEVER logged, emailed, or put in a notification. */
  tempPassword?: string;
  /** Relative set-password URL when an INVITE_LINK was issued. */
  inviteUrl?: string;
  invited: boolean;
}

async function findStudentSystemRoleId(): Promise<string> {
  const db = await getDb();
  const role = await db.role.findFirst({ where: { name: "STUDENT", isSystem: true }, select: { id: true } });
  if (!role) throw new Error("System role STUDENT not found — seed roles before provisioning.");
  return role.id;
}

async function ensureMembershipAndRole(
  userId: string,
  organizationId: string,
  assignedBy: string | null
): Promise<void> {
  const db = await getDb();
  const roleId = await findStudentSystemRoleId();

  // Idempotent — compound unique keys guarantee no duplicate rows on re-run.
  await db.userOrganization.upsert({
    where: { userId_organizationId: { userId, organizationId } },
    create: { userId, organizationId },
    update: {},
  });
  await db.userRole.upsert({
    where: { userId_roleId_organizationId: { userId, roleId, organizationId } },
    create: { userId, roleId, organizationId, assignedBy },
    update: {},
  });
}

async function audit(
  organizationId: string,
  studentId: string,
  actorId: string | null,
  result: StudentProvisionResult
): Promise<void> {
  const db = await getDb();
  await db.auditLog.create({
    data: {
      organizationId,
      actorId,
      entity: "Student",
      entityId: studentId,
      action: "student.portal_user_provisioned",
      // Never serialize tempPassword.
      newValues: JSON.stringify({ status: result.status, userId: result.userId ?? null, invited: result.invited }),
    },
  });
}

/**
 * Sends the "account created" notification to the student's user. Carries the
 * invite link in actionUrl when present; NEVER carries a password.
 */
async function notifyAccountCreated(
  organizationId: string,
  studentId: string,
  userId: string,
  studentName: string,
  inviteUrl: string | undefined
): Promise<void> {
  await createNotification(organizationId, {
    recipientUserId: userId,
    type: "student.portal_account_created",
    severity: "SUCCESS",
    title: "Acesso ao Portal do Aluno",
    message: inviteUrl
      ? `Olá ${studentName}, a sua conta de acesso ao Portal do Aluno foi criada. Defina a sua palavra-passe para começar.`
      : `Olá ${studentName}, a sua conta de acesso ao Portal do Aluno foi criada.`,
    actionUrl: inviteUrl ?? "/student",
    // Dedupe: re-running provisioning won't resend within the dedupe window.
    metadata: { referenceId: studentId },
  });
}

export async function ensureStudentPortalUser(
  input: EnsureStudentPortalUserInput
): Promise<StudentProvisionResult> {
  const { organizationId, studentId, triggeredByUserId = null, reason } = input;
  const db = await getDb();

  // Policy gate (defaults to enabled when no settings row exists). The
  // autoCreate switch only governs the AUTOMATIC trigger (enrollment activation);
  // an explicit MANUAL/IMPORT call is a deliberate admin override and bypasses it.
  const settings = await findSettings(organizationId);
  const autoCreate = settings?.autoCreateStudentUserOnActivation ?? true;
  const sendInvite = settings?.sendStudentPortalInvite ?? true;
  const strategy = (settings?.studentPortalInviteStrategy ?? "INVITE_LINK") as StudentPortalInviteStrategy;

  if (reason === "ENROLLMENT_ACTIVATED" && !autoCreate) {
    return { status: "skipped_by_policy", invited: false };
  }

  // Tenant-scoped load — a studentId from another org resolves to null and throws.
  const student = await db.student.findFirst({
    where: { id: studentId, organizationId, deletedAt: null },
    select: { id: true, userId: true, email: true, firstName: true, lastName: true },
  });
  if (!student) throw new NotFoundError("Aluno", studentId);

  const studentName = `${student.firstName} ${student.lastName}`.trim();

  if (student.userId) {
    return { status: "already_linked", userId: student.userId, invited: false };
  }

  const email = student.email?.trim();
  if (!email) {
    const result: StudentProvisionResult = { status: "missing_email", invited: false };
    await audit(organizationId, studentId, triggeredByUserId, result);
    return result;
  }

  const existingUser = await db.user.findUnique({ where: { email }, select: { id: true, passwordHash: true } });

  // ── Link an existing user ───────────────────────────────────────────────────
  if (existingUser) {
    // Student.userId is globally unique — a user already bound to a different
    // student (in ANY org) cannot be linked here.
    const conflict = await db.student.findFirst({
      where: { userId: existingUser.id, NOT: { id: studentId } },
      select: { id: true },
    });
    if (conflict) {
      const result: StudentProvisionResult = { status: "email_conflict", invited: false };
      await audit(organizationId, studentId, triggeredByUserId, result);
      return result;
    }

    await db.student.update({ where: { id: studentId }, data: { userId: existingUser.id } });
    await ensureMembershipAndRole(existingUser.id, organizationId, triggeredByUserId);

    // Only invite (set-password) if the existing account has no password yet.
    let inviteUrl: string | undefined;
    let invited = false;
    if (sendInvite && strategy === "INVITE_LINK" && !existingUser.passwordHash) {
      inviteUrl = (await createStudentPortalInvite(email)).inviteUrl;
      invited = true;
    }
    if (sendInvite) {
      await notifyAccountCreated(organizationId, studentId, existingUser.id, studentName, inviteUrl);
    }

    const result: StudentProvisionResult = {
      status: "linked_existing_user",
      userId: existingUser.id,
      inviteUrl,
      invited,
    };
    await audit(organizationId, studentId, triggeredByUserId, result);
    return result;
  }

  // ── Create a new user ───────────────────────────────────────────────────────
  let tempPassword: string | undefined;
  let passwordHash: string | null = null;
  if (strategy === "TEMP_PASSWORD") {
    tempPassword = crypto.randomBytes(12).toString("base64url");
    passwordHash = await bcrypt.hash(tempPassword, 12);
  }
  // INVITE_LINK → passwordHash stays null; the user cannot log in until they set
  // a password via the invite (auth `authorize` rejects null-hash accounts).

  const user = await db.user.create({
    data: { email, name: studentName || email, passwordHash, isActive: true },
    select: { id: true },
  });

  await db.student.update({ where: { id: studentId }, data: { userId: user.id } });
  await ensureMembershipAndRole(user.id, organizationId, triggeredByUserId);

  let inviteUrl: string | undefined;
  let invited = false;
  if (sendInvite && strategy === "INVITE_LINK") {
    inviteUrl = (await createStudentPortalInvite(email)).inviteUrl;
    invited = true;
  }
  if (sendInvite) {
    await notifyAccountCreated(organizationId, studentId, user.id, studentName, inviteUrl);
  }

  const result: StudentProvisionResult = {
    status: "created",
    userId: user.id,
    tempPassword,
    inviteUrl,
    invited,
  };
  await audit(organizationId, studentId, triggeredByUserId, result);
  return result;
}

// =============================================================================
// ADMIN PANEL — status + remediation (Student 360)
// =============================================================================

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type StudentPortalAccountStatus =
  | "linked"
  | "not_linked"
  | "missing_email"
  | "email_conflict"
  | "invite_pending"
  | "invite_expired"
  | "disabled_by_policy";

export interface StudentPortalAccountDto {
  status: StudentPortalAccountStatus;
  studentId: string;
  studentEmail: string | null;
  linkedUser?: {
    id: string;
    name: string;
    email: string;
    status: "ACTIVE" | "DISABLED";
    lastLoginAt: Date | null;
  };
  invite?: {
    /** Approximate — derived from expiresAt minus the fixed TTL (VerificationToken has no createdAt). */
    sentAt: Date | null;
    expiresAt: Date;
    status: "active" | "expired";
  };
  policy: {
    autoCreateStudentUserOnActivation: boolean;
    sendStudentPortalInvite: boolean;
    studentPortalInviteStrategy: string;
  };
}

async function latestInvite(email: string, now: Date) {
  const db = await getDb();
  const token = await db.verificationToken.findFirst({
    where: { identifier: email },
    orderBy: { expires: "desc" },
    select: { expires: true },
  });
  if (!token) return undefined;
  return {
    sentAt: new Date(token.expires.getTime() - INVITE_TTL_MS),
    expiresAt: token.expires,
    status: (token.expires > now ? "active" : "expired") as "active" | "expired",
  };
}

/**
 * Read-only status DTO for the Student 360 Portal Account panel. Never returns
 * password hashes or token values. Throws NotFoundError if the student is not
 * in the org (tenant isolation).
 */
export async function getStudentPortalAccountStatus(
  studentId: string,
  organizationId: string,
  now: Date = new Date()
): Promise<StudentPortalAccountDto> {
  const db = await getDb();
  const settings = await findSettings(organizationId);
  const policy = {
    autoCreateStudentUserOnActivation: settings?.autoCreateStudentUserOnActivation ?? true,
    sendStudentPortalInvite: settings?.sendStudentPortalInvite ?? true,
    studentPortalInviteStrategy: settings?.studentPortalInviteStrategy ?? "INVITE_LINK",
  };

  const student = await db.student.findFirst({
    where: { id: studentId, organizationId, deletedAt: null },
    select: { id: true, userId: true, email: true },
  });
  if (!student) throw new NotFoundError("Aluno", studentId);

  const studentEmail = student.email?.trim() || null;

  // ── Already linked ──────────────────────────────────────────────────────────
  if (student.userId) {
    const user = await db.user.findUnique({
      where: { id: student.userId },
      select: { id: true, name: true, email: true, isActive: true, passwordHash: true, lastLoginAt: true },
    });
    const invite = user?.email ? await latestInvite(user.email, now) : undefined;
    const linkedUser = user
      ? {
          id: user.id,
          name: user.name,
          email: user.email,
          status: (user.isActive ? "ACTIVE" : "DISABLED") as "ACTIVE" | "DISABLED",
          lastLoginAt: user.lastLoginAt,
        }
      : undefined;

    let status: StudentPortalAccountStatus;
    if (user?.passwordHash) status = "linked";
    else if (invite?.status === "active") status = "invite_pending";
    else status = "invite_expired";

    return { status, studentId, studentEmail, linkedUser, invite, policy };
  }

  // ── Not linked ──────────────────────────────────────────────────────────────
  if (!studentEmail) {
    return { status: "missing_email", studentId, studentEmail: null, policy };
  }

  const existingUser = await db.user.findUnique({ where: { email: studentEmail }, select: { id: true } });
  if (existingUser) {
    const conflict = await db.student.findFirst({
      where: { userId: existingUser.id, NOT: { id: studentId } },
      select: { id: true },
    });
    if (conflict) {
      return { status: "email_conflict", studentId, studentEmail, policy };
    }
  }

  const status: StudentPortalAccountStatus = policy.autoCreateStudentUserOnActivation
    ? "not_linked"
    : "disabled_by_policy";
  return { status, studentId, studentEmail, policy };
}

export interface ResendInviteResult {
  status: StudentProvisionStatus | "invite_resent" | "already_active" | "not_linked";
  userId?: string;
  inviteUrl?: string;
}

/**
 * Re-issues a set-password invite. If the student isn't linked yet, provisions
 * first (which issues the invite). For an already-active account (has a
 * password) it is a no-op (`already_active`) — we never silently reset a
 * working password.
 */
export async function resendStudentPortalInvite(
  studentId: string,
  organizationId: string,
  triggeredByUserId: string | null
): Promise<ResendInviteResult> {
  const db = await getDb();
  const student = await db.student.findFirst({
    where: { id: studentId, organizationId, deletedAt: null },
    select: { id: true, userId: true },
  });
  if (!student) throw new NotFoundError("Aluno", studentId);

  if (!student.userId) {
    const res = await ensureStudentPortalUser({
      organizationId,
      studentId,
      triggeredByUserId,
      reason: "MANUAL",
    });
    return { status: res.status, userId: res.userId, inviteUrl: res.inviteUrl };
  }

  const user = await db.user.findUnique({
    where: { id: student.userId },
    select: { id: true, email: true, name: true, passwordHash: true },
  });
  if (!user) throw new NotFoundError("Utilizador", student.userId);
  if (user.passwordHash) {
    return { status: "already_active", userId: user.id };
  }

  // Invalidate prior unused invites for this email, then issue a fresh one.
  await db.verificationToken.deleteMany({ where: { identifier: user.email } });
  const { inviteUrl } = await createStudentPortalInvite(user.email);
  await notifyAccountCreated(organizationId, studentId, user.id, user.name, inviteUrl);

  await db.auditLog.create({
    data: {
      organizationId,
      actorId: triggeredByUserId,
      entity: "Student",
      entityId: studentId,
      action: "student_portal_account.invite_resent",
      newValues: JSON.stringify({ userId: user.id }),
    },
  });

  return { status: "invite_resent", userId: user.id, inviteUrl };
}

export interface UnlinkResult {
  status: "unlinked" | "not_linked";
  userId?: string;
}

/**
 * Unlinks the Portal login from a student: clears Student.userId. Deliberately
 * does NOT delete the User and does NOT remove the STUDENT role (the same person
 * may legitimately remain a user, and role cleanup is left to user admin). Any
 * outstanding invite token is invalidated.
 */
export async function unlinkStudentPortalAccount(
  studentId: string,
  organizationId: string,
  triggeredByUserId: string | null
): Promise<UnlinkResult> {
  const db = await getDb();
  const student = await db.student.findFirst({
    where: { id: studentId, organizationId, deletedAt: null },
    select: { id: true, userId: true },
  });
  if (!student) throw new NotFoundError("Aluno", studentId);
  if (!student.userId) return { status: "not_linked" };

  const userId = student.userId;
  const user = await db.user.findUnique({ where: { id: userId }, select: { email: true } });

  await db.student.update({ where: { id: studentId }, data: { userId: null } });
  if (user?.email) {
    await db.verificationToken.deleteMany({ where: { identifier: user.email } });
  }

  await db.auditLog.create({
    data: {
      organizationId,
      actorId: triggeredByUserId,
      entity: "Student",
      entityId: studentId,
      action: "student_portal_account.unlinked",
      newValues: JSON.stringify({ userId }),
    },
  });

  return { status: "unlinked", userId };
}
