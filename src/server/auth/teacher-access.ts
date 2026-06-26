import { AuthorizationError } from "@/shared/lib/command";
import { getDb } from "@/server/db";
import { resolveTeacherScope } from "@/server/auth/teacher-scope";
import type { AuthContext } from "@/server/auth/context";

// =============================================================================
// TEACHER ACCESS — per-record ownership guards for the TEACHER role.
//
// Companion to teacher-scope.ts. Where teacher-scope.ts scopes *list* pages
// (and redirects org-wide pages), this module enforces ownership on *single
// record* detail / write paths so a teacher-scoped user can never reach another
// teacher's record by guessing or replaying its id (IDOR). Ownership is decided
// server-side from the resolved teacherId — never from the URL — so it does not
// rely on CUID secrecy.
//
// Each guard is a NO-OP for ORG_ADMIN/SUPER_ADMIN/SECRETARY/STUDENT (anyone not
// teacher-scoped) — they keep org-wide access. For a teacher-scoped user it
// throws AuthorizationError unless the record belongs to them. A teacher-scoped
// account with no linked Teacher profile owns nothing, so it always throws.
//
// Ownership rules (always additionally scoped by organizationId):
//   • Student  — has an enrollment (deletedAt: null) in a class group I teach.
//                Mirrors the /students list filter exactly, so list ↔ detail
//                never diverge.
//   • ClassGroup — classGroup.teacherId = me.
//   • AttendanceSession — session.teacherId = me OR session.classGroup.teacherId
//                = me. The classGroup fallback covers sessions where the nullable
//                session.teacherId was never set (see M1 in docs).
//   • Assessment — assessment.teacherId = me OR assessment.classGroup.teacherId
//                = me (same classGroup fallback as sessions).
//
// See docs/teacher-access-scope.md.
// =============================================================================

/**
 * Resolves the teacher scope and returns the resolved teacherId when the caller
 * is teacher-scoped, or `null` when they are not (admin/secretary/etc. — guards
 * become no-ops). Throws when teacher-scoped with no linked Teacher profile.
 */
async function requireOwnTeacherId(context: AuthContext): Promise<string | null> {
  const scope = await resolveTeacherScope(context);
  if (!scope.isTeacherScoped) return null;
  if (!scope.teacherId) {
    throw new AuthorizationError("Esta conta de professor não está vinculada a um perfil de professor.");
  }
  return scope.teacherId;
}

async function teacherOwnsStudent(
  organizationId: string,
  teacherId: string,
  studentId: string
): Promise<boolean> {
  const db = await getDb();
  const enrollment = await db.enrollment.findFirst({
    where: {
      studentId,
      organizationId,
      deletedAt: null,
      classGroup: { teacherId },
    },
    select: { id: true },
  });
  return enrollment !== null;
}

async function teacherOwnsClassGroup(
  organizationId: string,
  teacherId: string,
  classGroupId: string
): Promise<boolean> {
  const db = await getDb();
  const group = await db.classGroup.findFirst({
    where: { id: classGroupId, organizationId, deletedAt: null, teacherId },
    select: { id: true },
  });
  return group !== null;
}

async function teacherOwnsAttendanceSession(
  organizationId: string,
  teacherId: string,
  sessionId: string
): Promise<boolean> {
  const db = await getDb();
  const session = await db.attendanceSession.findFirst({
    where: {
      id: sessionId,
      organizationId,
      deletedAt: null,
      OR: [{ teacherId }, { classGroup: { teacherId } }],
    },
    select: { id: true },
  });
  return session !== null;
}

async function teacherOwnsEnrollment(
  organizationId: string,
  teacherId: string,
  enrollmentId: string
): Promise<boolean> {
  const db = await getDb();
  const enrollment = await db.enrollment.findFirst({
    where: {
      id: enrollmentId,
      organizationId,
      deletedAt: null,
      classGroup: { teacherId },
    },
    select: { id: true },
  });
  return enrollment !== null;
}

async function teacherOwnsAssessment(
  organizationId: string,
  teacherId: string,
  assessmentId: string
): Promise<boolean> {
  const db = await getDb();
  const assessment = await db.assessment.findFirst({
    where: {
      id: assessmentId,
      organizationId,
      deletedAt: null,
      OR: [{ teacherId }, { classGroup: { teacherId } }],
    },
    select: { id: true },
  });
  return assessment !== null;
}

/**
 * Resolves the `teacherId` to stamp on a record a user is creating (assessment,
 * attendance session, …). For a teacher-scoped user it is ALWAYS their own
 * resolved teacherId — a client-supplied value is ignored, so a teacher can
 * never assign another teacher. For admins/secretaries the client's chosen
 * `clientTeacherId` is kept as-is. Throws for a teacher-scoped account with no
 * linked Teacher profile (it owns nothing and cannot create). See
 * docs/teacher-access-scope.md.
 */
export async function resolveAssignedTeacherId(
  context: AuthContext,
  clientTeacherId: string | null | undefined
): Promise<string | null> {
  const ownTeacherId = await requireOwnTeacherId(context);
  if (ownTeacherId !== null) return ownTeacherId; // teacher-scoped → force self
  return clientTeacherId ?? null; // admin/secretary → keep client choice
}

/**
 * Asserts a teacher-scoped caller may access the given student. No-op for
 * non-teacher-scoped callers. Throws AuthorizationError otherwise.
 */
export async function assertTeacherCanAccessStudent(
  context: AuthContext,
  studentId: string
): Promise<void> {
  const teacherId = await requireOwnTeacherId(context);
  if (teacherId === null) return;
  if (!(await teacherOwnsStudent(context.organizationId, teacherId, studentId))) {
    throw new AuthorizationError("Não tem acesso a este aluno.");
  }
}

/**
 * Asserts a teacher-scoped caller may access the given class group. No-op for
 * non-teacher-scoped callers. Throws AuthorizationError otherwise.
 */
export async function assertTeacherCanAccessClassGroup(
  context: AuthContext,
  classGroupId: string
): Promise<void> {
  const teacherId = await requireOwnTeacherId(context);
  if (teacherId === null) return;
  if (!(await teacherOwnsClassGroup(context.organizationId, teacherId, classGroupId))) {
    throw new AuthorizationError("Não tem acesso a esta turma.");
  }
}

/**
 * Asserts a teacher-scoped caller may access the given attendance session. No-op
 * for non-teacher-scoped callers. Throws AuthorizationError otherwise. Used on
 * both the read (detail/mark page) and write (mark commands) paths.
 */
export async function assertTeacherCanAccessAttendanceSession(
  context: AuthContext,
  sessionId: string
): Promise<void> {
  const teacherId = await requireOwnTeacherId(context);
  if (teacherId === null) return;
  if (!(await teacherOwnsAttendanceSession(context.organizationId, teacherId, sessionId))) {
    throw new AuthorizationError("Não tem acesso a esta sessão de presença.");
  }
}

/**
 * Asserts a teacher-scoped caller may access the given enrollment (i.e. it is in
 * a class group they teach). No-op for non-teacher-scoped callers. Throws
 * AuthorizationError otherwise. Used on the per-enrollment grade-entry write path.
 */
export async function assertTeacherCanAccessEnrollment(
  context: AuthContext,
  enrollmentId: string
): Promise<void> {
  const teacherId = await requireOwnTeacherId(context);
  if (teacherId === null) return;
  if (!(await teacherOwnsEnrollment(context.organizationId, teacherId, enrollmentId))) {
    throw new AuthorizationError("Não tem acesso a esta matrícula.");
  }
}

/**
 * Asserts a teacher-scoped caller may access the given assessment. No-op for
 * non-teacher-scoped callers. Throws AuthorizationError otherwise. Used on both
 * the read (detail/grade page) and write (grade command) paths.
 */
export async function assertTeacherCanAccessAssessment(
  context: AuthContext,
  assessmentId: string
): Promise<void> {
  const teacherId = await requireOwnTeacherId(context);
  if (teacherId === null) return;
  if (!(await teacherOwnsAssessment(context.organizationId, teacherId, assessmentId))) {
    throw new AuthorizationError("Não tem acesso a esta avaliação.");
  }
}
