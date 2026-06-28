import { getDb } from "@/server/db";
import { NotFoundError } from "@/shared/lib/command";
import { normalizeEmail } from "@/shared/lib/email";
import { createStudentPortalInvite } from "@/modules/users/services/account-invite.service";
import { createNotification } from "@/modules/notifications/services/notification.service";

// =============================================================================
// GUARDIAN USER PROVISIONING
// Ensures a guardian/parent has a linked platform login (GUARDIAN role) and a
// GuardianStudent link to a specific student so they can use the Guardian
// Portal. Pure and idempotent — repeated calls never duplicate users, roles, or
// links. Never throws for recoverable business outcomes (missing email, email
// conflict) — those are returned as a status. Throws only for genuine data
// errors (student not in org, missing GUARDIAN system role). Never sends or
// stores a plaintext password — activation is always via an invite link.
// See docs/guardian-portal.md.
// =============================================================================

export type GuardianProvisionReason = "MANUAL" | "IMPORT" | "ENROLLMENT_FORM";

export type GuardianProvisionStatus =
  | "created"
  | "linked_existing_user"
  | "already_linked"
  | "missing_email"
  | "email_conflict"
  | "skipped_by_policy";

export interface EnsureGuardianPortalUserInput {
  organizationId: string;
  guardianEmail: string;
  guardianName: string;
  studentId: string;
  relationshipType: string;
  isPrimary?: boolean;
  canViewAcademic?: boolean;
  canViewAttendance?: boolean;
  canViewFinance?: boolean;
  canViewDocuments?: boolean;
  canReceiveNotifications?: boolean;
  triggeredByUserId?: string | null;
  reason: GuardianProvisionReason;
}

export interface GuardianProvisionResult {
  status: GuardianProvisionStatus;
  userId?: string;
  guardianStudentId?: string;
  /** Relative set-password URL when an invite was issued. NEVER a password. */
  inviteUrl?: string;
  invited: boolean;
}

async function findGuardianSystemRoleId(): Promise<string> {
  const db = await getDb();
  const role = await db.role.findFirst({ where: { name: "GUARDIAN", isSystem: true }, select: { id: true } });
  if (!role) throw new Error("System role GUARDIAN not found — seed roles before provisioning.");
  return role.id;
}

async function ensureMembershipAndRole(
  userId: string,
  organizationId: string,
  assignedBy: string | null
): Promise<void> {
  const db = await getDb();
  const roleId = await findGuardianSystemRoleId();

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
  result: GuardianProvisionResult
): Promise<void> {
  const db = await getDb();
  await db.auditLog.create({
    data: {
      organizationId,
      actorId,
      entity: "Student",
      entityId: studentId,
      action: "guardian.link_provisioned",
      newValues: JSON.stringify({
        status: result.status,
        userId: result.userId ?? null,
        guardianStudentId: result.guardianStudentId ?? null,
        invited: result.invited,
      }),
    },
  });
}

async function notifyAccountCreated(
  organizationId: string,
  guardianUserId: string,
  guardianName: string,
  inviteUrl: string | undefined
): Promise<void> {
  await createNotification(organizationId, {
    recipientUserId: guardianUserId,
    type: "guardian.portal_account_created",
    severity: "SUCCESS",
    title: "Acesso ao Portal do Encarregado",
    message: inviteUrl
      ? `Olá ${guardianName}, a sua conta de acesso ao Portal do Encarregado foi criada. Defina a sua palavra-passe para começar.`
      : `Olá ${guardianName}, a sua conta de acesso ao Portal do Encarregado foi criada.`,
    actionUrl: inviteUrl ?? "/guardian",
    metadata: { referenceId: guardianUserId },
  });
}

/**
 * Finds an ACTIVE GuardianStudent link, or creates one. Idempotent: an existing
 * active link is returned untouched (visibility-flag edits go through
 * {@link updateGuardianLinkPermissions}, not provisioning).
 *
 * CONCURRENCY: this is a find-then-create, so two simultaneous provisioning
 * calls for the same (org, guardian, student) could both pass the findFirst.
 * The last line of defence against a duplicate ACTIVE link is the SQL Server
 * FILTERED UNIQUE INDEX `guardian_students_active_link_key`
 * (`(organizationId, guardianUserId, studentId) WHERE deletedAt IS NULL`),
 * maintained MANUALLY in the migration — it cannot be expressed as a Prisma
 * `@@unique` (no partial-index support), so it is NOT represented in
 * schema.prisma. If that index is ever dropped, this race becomes a real
 * duplicate-link bug. A losing concurrent create raises a unique-violation that
 * propagates to the caller (we never swallow it into a fake success).
 */
async function ensureGuardianLink(
  input: EnsureGuardianPortalUserInput,
  guardianUserId: string
): Promise<{ id: string; created: boolean }> {
  const db = await getDb();
  const existing = await db.guardianStudent.findFirst({
    where: {
      organizationId: input.organizationId,
      guardianUserId,
      studentId: input.studentId,
      deletedAt: null,
    },
    select: { id: true },
  });
  if (existing) return { id: existing.id, created: false };

  const link = await db.guardianStudent.create({
    data: {
      organizationId: input.organizationId,
      guardianUserId,
      studentId: input.studentId,
      relationshipType: input.relationshipType,
      isPrimary: input.isPrimary ?? false,
      canViewAcademic: input.canViewAcademic ?? true,
      canViewAttendance: input.canViewAttendance ?? true,
      canViewFinance: input.canViewFinance ?? false,
      canViewDocuments: input.canViewDocuments ?? true,
      canReceiveNotifications: input.canReceiveNotifications ?? true,
      createdBy: input.triggeredByUserId ?? null,
    },
    select: { id: true },
  });
  return { id: link.id, created: true };
}

export async function ensureGuardianPortalUser(
  input: EnsureGuardianPortalUserInput
): Promise<GuardianProvisionResult> {
  const { organizationId, studentId, triggeredByUserId = null } = input;
  const db = await getDb();

  // Tenant-scoped load — a studentId from another org resolves to null and throws.
  const student = await db.student.findFirst({
    where: { id: studentId, organizationId, deletedAt: null },
    select: { id: true },
  });
  if (!student) throw new NotFoundError("Aluno", studentId);

  const email = normalizeEmail(input.guardianEmail);
  if (!email) {
    const result: GuardianProvisionResult = { status: "missing_email", invited: false };
    await audit(organizationId, studentId, triggeredByUserId, result);
    return result;
  }

  const guardianName = input.guardianName?.trim() || email;

  const existingUser = await db.user.findUnique({
    where: { email },
    select: {
      id: true,
      passwordHash: true,
      studentProfile: { select: { id: true } },
      teacherProfile: { select: { id: true } },
    },
  });

  // ── Link an existing user ───────────────────────────────────────────────────
  if (existingUser) {
    // Never co-opt a student's or teacher's own self-service login as a guardian
    // account — the nav/data scoping is single-role per account. A genuine
    // parent needs a distinct guardian email.
    if (existingUser.studentProfile || existingUser.teacherProfile) {
      const result: GuardianProvisionResult = { status: "email_conflict", invited: false };
      await audit(organizationId, studentId, triggeredByUserId, result);
      return result;
    }

    await ensureMembershipAndRole(existingUser.id, organizationId, triggeredByUserId);
    const link = await ensureGuardianLink(input, existingUser.id);

    let inviteUrl: string | undefined;
    let invited = false;
    // Only invite (set-password) if the account has never set a password.
    if (!existingUser.passwordHash) {
      inviteUrl = (await createStudentPortalInvite(email)).inviteUrl;
      invited = true;
    }
    await notifyAccountCreated(organizationId, existingUser.id, guardianName, inviteUrl);

    const result: GuardianProvisionResult = {
      status: link.created ? "linked_existing_user" : "already_linked",
      userId: existingUser.id,
      guardianStudentId: link.id,
      inviteUrl,
      invited,
    };
    await audit(organizationId, studentId, triggeredByUserId, result);
    return result;
  }

  // ── Create a new user ───────────────────────────────────────────────────────
  // passwordHash stays null; the guardian cannot log in until they set a
  // password via the invite (auth `authorize` rejects null-hash accounts).
  const user = await db.user.create({
    data: { email, name: guardianName, passwordHash: null, isActive: true },
    select: { id: true },
  });

  await ensureMembershipAndRole(user.id, organizationId, triggeredByUserId);
  const link = await ensureGuardianLink(input, user.id);

  const { inviteUrl } = await createStudentPortalInvite(email);
  await notifyAccountCreated(organizationId, user.id, guardianName, inviteUrl);

  const result: GuardianProvisionResult = {
    status: "created",
    userId: user.id,
    guardianStudentId: link.id,
    inviteUrl,
    invited: true,
  };
  await audit(organizationId, studentId, triggeredByUserId, result);
  return result;
}

// =============================================================================
// ADMIN PANEL — Student 360 guardian management (read + remediation)
// =============================================================================

export type GuardianLinkAccountStatus = "active" | "invite_pending" | "invite_expired" | "disabled";

export interface StudentGuardianLinkDto {
  linkId: string;
  guardianUserId: string;
  guardianName: string;
  guardianEmail: string;
  relationshipType: string;
  isPrimary: boolean;
  canViewAcademic: boolean;
  canViewAttendance: boolean;
  canViewFinance: boolean;
  canViewDocuments: boolean;
  canReceiveNotifications: boolean;
  accountStatus: GuardianLinkAccountStatus;
  createdAt: Date;
}

/**
 * Lists the ACTIVE guardian links for a student (Student 360 "Encarregados"
 * card). Tenant-scoped. Returns the guardian's account/invite status so the UI
 * can show pending invites. Never returns password hashes or token values.
 */
export async function getStudentGuardianLinks(
  studentId: string,
  organizationId: string,
  now: Date = new Date()
): Promise<StudentGuardianLinkDto[]> {
  const db = await getDb();

  // Tenant guard — student must belong to the org.
  const student = await db.student.findFirst({
    where: { id: studentId, organizationId, deletedAt: null },
    select: { id: true },
  });
  if (!student) throw new NotFoundError("Aluno", studentId);

  const links = await db.guardianStudent.findMany({
    where: { organizationId, studentId, deletedAt: null },
    select: {
      id: true,
      guardianUserId: true,
      relationshipType: true,
      isPrimary: true,
      canViewAcademic: true,
      canViewAttendance: true,
      canViewFinance: true,
      canViewDocuments: true,
      canReceiveNotifications: true,
      createdAt: true,
      guardian: { select: { name: true, email: true, isActive: true, passwordHash: true } },
    },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
  });

  const result: StudentGuardianLinkDto[] = [];
  for (const l of links) {
    let accountStatus: GuardianLinkAccountStatus;
    if (!l.guardian.isActive) {
      accountStatus = "disabled";
    } else if (l.guardian.passwordHash) {
      accountStatus = "active";
    } else {
      const token = await db.verificationToken.findFirst({
        where: { identifier: l.guardian.email },
        orderBy: { expires: "desc" },
        select: { expires: true },
      });
      accountStatus = token && token.expires > now ? "invite_pending" : "invite_expired";
    }

    result.push({
      linkId: l.id,
      guardianUserId: l.guardianUserId,
      guardianName: l.guardian.name,
      guardianEmail: l.guardian.email,
      relationshipType: l.relationshipType,
      isPrimary: l.isPrimary,
      canViewAcademic: l.canViewAcademic,
      canViewAttendance: l.canViewAttendance,
      canViewFinance: l.canViewFinance,
      canViewDocuments: l.canViewDocuments,
      canReceiveNotifications: l.canReceiveNotifications,
      accountStatus,
      createdAt: l.createdAt,
    });
  }
  return result;
}

export interface UpdateGuardianLinkInput {
  relationshipType?: string;
  isPrimary?: boolean;
  canViewAcademic?: boolean;
  canViewAttendance?: boolean;
  canViewFinance?: boolean;
  canViewDocuments?: boolean;
  canReceiveNotifications?: boolean;
}

/** Updates a guardian link's relationship/visibility flags. Tenant-scoped by org. */
export async function updateGuardianLinkPermissions(
  linkId: string,
  organizationId: string,
  input: UpdateGuardianLinkInput,
  triggeredByUserId: string | null
): Promise<void> {
  const db = await getDb();
  const link = await db.guardianStudent.findFirst({
    where: { id: linkId, organizationId, deletedAt: null },
    select: { id: true, studentId: true },
  });
  if (!link) throw new NotFoundError("Vínculo de encarregado", linkId);

  await db.guardianStudent.update({
    where: { id: linkId },
    data: { ...input, updatedBy: triggeredByUserId },
  });

  await db.auditLog.create({
    data: {
      organizationId,
      actorId: triggeredByUserId,
      entity: "GuardianStudent",
      entityId: linkId,
      action: "guardian.link_updated",
      newValues: JSON.stringify(input),
    },
  });
}

/** Soft-deletes a guardian link (revokes Portal visibility for that student). */
export async function removeGuardianLink(
  linkId: string,
  organizationId: string,
  triggeredByUserId: string | null
): Promise<void> {
  const db = await getDb();
  const link = await db.guardianStudent.findFirst({
    where: { id: linkId, organizationId, deletedAt: null },
    select: { id: true },
  });
  if (!link) throw new NotFoundError("Vínculo de encarregado", linkId);

  await db.guardianStudent.update({
    where: { id: linkId },
    data: { deletedAt: new Date(), updatedBy: triggeredByUserId },
  });

  await db.auditLog.create({
    data: {
      organizationId,
      actorId: triggeredByUserId,
      entity: "GuardianStudent",
      entityId: linkId,
      action: "guardian.link_removed",
      newValues: JSON.stringify({ linkId }),
    },
  });
}

export interface ResendGuardianInviteResult {
  status: "invite_resent" | "already_active";
  inviteUrl?: string;
}

/**
 * Re-issues a set-password invite for a guardian link's user. No-op (returns
 * `already_active`) when the account already has a password — we never silently
 * reset a working password.
 */
export async function resendGuardianInvite(
  linkId: string,
  organizationId: string,
  triggeredByUserId: string | null
): Promise<ResendGuardianInviteResult> {
  const db = await getDb();
  const link = await db.guardianStudent.findFirst({
    where: { id: linkId, organizationId, deletedAt: null },
    select: { id: true, guardianUserId: true },
  });
  if (!link) throw new NotFoundError("Vínculo de encarregado", linkId);

  const user = await db.user.findUnique({
    where: { id: link.guardianUserId },
    select: { id: true, email: true, name: true, passwordHash: true },
  });
  if (!user) throw new NotFoundError("Utilizador", link.guardianUserId);
  if (user.passwordHash) return { status: "already_active" };

  await db.verificationToken.deleteMany({ where: { identifier: user.email } });
  const { inviteUrl } = await createStudentPortalInvite(user.email);
  await notifyAccountCreated(organizationId, user.id, user.name, inviteUrl);

  await db.auditLog.create({
    data: {
      organizationId,
      actorId: triggeredByUserId,
      entity: "GuardianStudent",
      entityId: linkId,
      action: "guardian.invite_resent",
      newValues: JSON.stringify({ guardianUserId: user.id }),
    },
  });

  return { status: "invite_resent", inviteUrl };
}
