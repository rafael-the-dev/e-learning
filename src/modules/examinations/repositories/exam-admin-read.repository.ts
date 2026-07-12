import { getDb } from "@/server/db";
import type { PrismaClientOrTx } from "@/server/db";
import { isSessionConsumed } from "@/modules/examinations/commands/integration-shared";

// =============================================================================
// EXAMINATION ADMIN PORTAL — BATCHED READ REPOSITORY (Phase 12, Increment 2)
// -----------------------------------------------------------------------------
// The ONLY new Prisma layer for the portal: tenant-scoped, minimal-`select`,
// BATCHED-by-ids reads that the admin read services need (display enrichment +
// cross-entity projections + conflict/health detection). READ-ONLY — no writes,
// no business rules. Keeps the frozen v1.0 engine repositories untouched. Portal
// read services call these; they never touch Prisma directly.
// =============================================================================

const toNum = (v: unknown): number | null => (v == null ? null : Number(v));

/** Read-only wrapper so read services can check downstream consumption without
 *  importing `@/server/db` (they must not). Reuses the canonical shared rule. */
export async function isSessionConsumedRead(
  organizationId: string,
  examSessionId: string
): Promise<boolean> {
  const db = await getDb();
  return isSessionConsumed({ organizationId, examSessionId }, db);
}

// ─── Academic display batches (for studentNumber / name / enrollment / subject) ─

export interface StudentDisplay {
  id: string;
  code: string | null;
  firstName: string;
  lastName: string;
}
export async function listStudentDisplayByIds(
  organizationId: string,
  studentIds: string[],
  client?: PrismaClientOrTx
): Promise<StudentDisplay[]> {
  if (studentIds.length === 0) return [];
  const db = client ?? (await getDb());
  return db.student.findMany({
    where: { organizationId, id: { in: studentIds } },
    select: { id: true, code: true, firstName: true, lastName: true },
  });
}

export interface EnrollmentDisplay {
  id: string;
  enrollmentNumber: string | null;
}
export async function listEnrollmentDisplayByIds(
  organizationId: string,
  enrollmentIds: string[],
  client?: PrismaClientOrTx
): Promise<EnrollmentDisplay[]> {
  if (enrollmentIds.length === 0) return [];
  const db = client ?? (await getDb());
  return db.enrollment.findMany({
    where: { organizationId, id: { in: enrollmentIds } },
    select: { id: true, enrollmentNumber: true },
  });
}

export interface LevelSubjectName {
  levelSubjectId: string;
  subjectName: string | null;
}
export async function listSubjectNamesByLevelSubjectIds(
  organizationId: string,
  levelSubjectIds: string[],
  client?: PrismaClientOrTx
): Promise<LevelSubjectName[]> {
  if (levelSubjectIds.length === 0) return [];
  const db = client ?? (await getDb());
  const rows = await db.levelSubject.findMany({
    where: { organizationId, id: { in: levelSubjectIds } },
    select: { id: true, subject: { select: { name: true } } },
  });
  return rows.map((r) => ({ levelSubjectId: r.id, subjectName: r.subject?.name ?? null }));
}

export interface BranchName {
  id: string;
  name: string;
}
export async function listBranchNamesByIds(
  organizationId: string,
  branchIds: string[],
  client?: PrismaClientOrTx
): Promise<BranchName[]> {
  if (branchIds.length === 0) return [];
  const db = client ?? (await getDb());
  return db.branch.findMany({
    where: { organizationId, id: { in: branchIds } },
    select: { id: true, name: true },
  });
}

// ─── Room portal list (org-wide, DB-filtered + paginated) ──────────────────────

export interface RoomPortalRow {
  id: string;
  organizationId: string;
  branchId: string | null;
  name: string;
  code: string | null;
  capacity: number;
  status: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}
export interface RoomPortalFilters {
  organizationId: string;
  branchId?: string;
  status?: string;
  minCapacity?: number;
  maxCapacity?: number;
  search?: string;
}
function buildRoomWhere(f: RoomPortalFilters): Record<string, unknown> {
  const where: Record<string, unknown> = { organizationId: f.organizationId, deletedAt: null };
  if (f.branchId) where.branchId = f.branchId;
  if (f.status) where.status = f.status;
  if (f.minCapacity != null || f.maxCapacity != null) {
    where.capacity = {
      ...(f.minCapacity != null ? { gte: f.minCapacity } : {}),
      ...(f.maxCapacity != null ? { lte: f.maxCapacity } : {}),
    };
  }
  if (f.search) {
    where.OR = [
      { name: { contains: f.search } },
      { code: { contains: f.search } },
    ];
  }
  return where;
}
export async function listRoomsForPortal(
  filters: RoomPortalFilters & { skip: number; take: number },
  client?: PrismaClientOrTx
): Promise<RoomPortalRow[]> {
  const db = client ?? (await getDb());
  return db.examRoom.findMany({
    where: buildRoomWhere(filters),
    select: {
      id: true,
      organizationId: true,
      branchId: true,
      name: true,
      code: true,
      capacity: true,
      status: true,
      description: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    skip: filters.skip,
    take: filters.take,
  });
}
export async function countRoomsForPortal(
  filters: RoomPortalFilters,
  client?: PrismaClientOrTx
): Promise<number> {
  const db = client ?? (await getDb());
  return db.examRoom.count({ where: buildRoomWhere(filters) });
}

// ─── Room → upcoming sessions (batched) ────────────────────────────────────────

export interface UpcomingSessionRef {
  roomId: string;
  id: string;
  title: string;
  status: string;
  startsAt: Date;
  endsAt: Date;
}
/** Non-terminal sessions (SCHEDULED / LOCKED / IN_PROGRESS) attached to the given
 *  rooms — "upcoming/active" occupancy. One query for the whole room set. */
export async function listUpcomingSessionsByRoomIds(
  organizationId: string,
  roomIds: string[],
  client?: PrismaClientOrTx
): Promise<UpcomingSessionRef[]> {
  if (roomIds.length === 0) return [];
  const db = client ?? (await getDb());
  const rows = await db.examSession.findMany({
    where: {
      organizationId,
      deletedAt: null,
      roomId: { in: roomIds },
      status: { in: ["SCHEDULED", "LOCKED", "IN_PROGRESS"] },
    },
    select: { id: true, title: true, status: true, startsAt: true, endsAt: true, roomId: true },
    orderBy: { startsAt: "asc" },
  });
  return rows.map((r) => ({
    roomId: r.roomId as string,
    id: r.id,
    title: r.title,
    status: r.status,
    startsAt: r.startsAt,
    endsAt: r.endsAt,
  }));
}

// ─── Result → current revisions (batched official overlay) ─────────────────────

export interface CurrentRevisionProjection {
  examResultId: string;
  revisionId: string;
  revisionNumber: number;
  revisedScore: number | null;
}
export async function listCurrentRevisionsByResultIds(
  organizationId: string,
  resultIds: string[],
  client?: PrismaClientOrTx
): Promise<CurrentRevisionProjection[]> {
  if (resultIds.length === 0) return [];
  const db = client ?? (await getDb());
  const rows = await db.examResultRevision.findMany({
    where: { organizationId, examResultId: { in: resultIds }, isCurrent: true },
    select: { id: true, examResultId: true, revisionNumber: true, revisedScore: true },
  });
  return rows.map((r) => ({
    examResultId: r.examResultId,
    revisionId: r.id,
    revisionNumber: r.revisionNumber,
    revisedScore: toNum(r.revisedScore),
  }));
}

// ─── Results by ids (batched projection, e.g. for appeals) ─────────────────────

export interface ResultProjection {
  id: string;
  examCandidateId: string;
  levelSubjectId: string;
  status: string;
  resultCode: string | null;
  score: number | null;
  maxScore: number;
  normalizedScore: number | null;
  currentRevisionId: string | null;
}
export async function listResultsByIds(
  organizationId: string,
  resultIds: string[],
  client?: PrismaClientOrTx
): Promise<ResultProjection[]> {
  if (resultIds.length === 0) return [];
  const db = client ?? (await getDb());
  const rows = await db.examResult.findMany({
    where: { organizationId, id: { in: resultIds } },
    select: {
      id: true,
      examCandidateId: true,
      levelSubjectId: true,
      status: true,
      resultCode: true,
      score: true,
      maxScore: true,
      normalizedScore: true,
      currentRevisionId: true,
    },
  });
  return rows.map((r) => ({
    id: r.id,
    examCandidateId: r.examCandidateId,
    levelSubjectId: r.levelSubjectId,
    status: r.status,
    resultCode: r.resultCode ?? null,
    score: toNum(r.score),
    maxScore: Number(r.maxScore),
    normalizedScore: toNum(r.normalizedScore),
    currentRevisionId: r.currentRevisionId ?? null,
  }));
}

// ─── Result → integration ledger events (batched) ──────────────────────────────

export interface IntegrationEventProjection {
  examResultId: string;
  eventType: string;
  metadata: string | null;
  createdAt: Date;
}
export async function listIntegrationEventsByResultIds(
  organizationId: string,
  resultIds: string[],
  client?: PrismaClientOrTx
): Promise<IntegrationEventProjection[]> {
  if (resultIds.length === 0) return [];
  const db = client ?? (await getDb());
  const rows = await db.examEvent.findMany({
    where: {
      organizationId,
      aggregateType: "EXAM_RESULT",
      aggregateId: { in: resultIds },
      eventType: { in: ["exam_result.integrated", "exam_result.integration_reconciled"] },
    },
    select: { aggregateId: true, eventType: true, metadata: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => ({
    examResultId: r.aggregateId,
    eventType: r.eventType,
    metadata: r.metadata ?? null,
    createdAt: r.createdAt,
  }));
}

// ─── Conflict / health detection reads ─────────────────────────────────────────

export interface ConflictSessionRow {
  id: string;
  title: string;
  status: string;
  startsAt: Date;
  endsAt: Date;
  roomId: string | null;
  capacity: number;
  periodId: string;
}
/** Non-cancelled, schedulable/active sessions used for conflict detection. */
export async function listSessionsForConflicts(
  organizationId: string,
  client?: PrismaClientOrTx
): Promise<ConflictSessionRow[]> {
  const db = client ?? (await getDb());
  const rows = await db.examSession.findMany({
    where: {
      organizationId,
      deletedAt: null,
      status: { in: ["SCHEDULED", "LOCKED", "IN_PROGRESS"] },
    },
    select: {
      id: true,
      title: true,
      status: true,
      startsAt: true,
      endsAt: true,
      roomId: true,
      capacity: true,
      periodId: true,
    },
    orderBy: { startsAt: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    startsAt: r.startsAt,
    endsAt: r.endsAt,
    roomId: r.roomId ?? null,
    capacity: r.capacity,
    periodId: r.periodId,
  }));
}

export interface InvigilatorAssignmentRow {
  examSessionId: string;
  invigilatorId: string;
}
export async function listInvigilatorAssignmentsBySessionIds(
  organizationId: string,
  sessionIds: string[],
  client?: PrismaClientOrTx
): Promise<InvigilatorAssignmentRow[]> {
  if (sessionIds.length === 0) return [];
  const db = client ?? (await getDb());
  const rows = await db.examInvigilatorAssignment.findMany({
    where: { organizationId, examSessionId: { in: sessionIds } },
    select: { examSessionId: true, teacherId: true, userId: true },
  });
  return rows.map((r) => ({
    examSessionId: r.examSessionId,
    invigilatorId: (r.teacherId ?? r.userId ?? "") as string,
  }));
}

// ─── Invigilators for the portal (names resolved + assignable teacher source) ──

export interface InvigilatorForSession {
  assignmentId: string;
  teacherId: string | null;
  userId: string | null;
  role: string;
  name: string;
}

/** Assignments for ONE session, with the invigilator's display name resolved
 *  (teacher first, else user). Read-only; used by the Vigilantes tab. */
export async function listInvigilatorsForSession(
  organizationId: string,
  examSessionId: string,
  client?: PrismaClientOrTx
): Promise<InvigilatorForSession[]> {
  const db = client ?? (await getDb());
  const rows = await db.examInvigilatorAssignment.findMany({
    where: { organizationId, examSessionId },
    select: { id: true, teacherId: true, userId: true, role: true },
    orderBy: { assignedAt: "asc" },
  });
  if (rows.length === 0) return [];
  const teacherIds = rows.map((r) => r.teacherId).filter((v): v is string => !!v);
  const userIds = rows.map((r) => r.userId).filter((v): v is string => !!v);
  const [teachers, users] = await Promise.all([
    teacherIds.length
      ? db.teacher.findMany({ where: { organizationId, id: { in: teacherIds } }, select: { id: true, firstName: true, lastName: true } })
      : Promise.resolve([] as Array<{ id: string; firstName: string; lastName: string }>),
    userIds.length
      ? db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } })
      : Promise.resolve([] as Array<{ id: string; name: string; email: string }>),
  ]);
  const teacherName = new Map(teachers.map((t) => [t.id, `${t.firstName} ${t.lastName}`.trim()]));
  const userName = new Map(users.map((u) => [u.id, u.name || u.email]));
  return rows.map((r) => ({
    assignmentId: r.id,
    teacherId: r.teacherId,
    userId: r.userId,
    role: r.role,
    name: r.teacherId
      ? teacherName.get(r.teacherId) ?? r.teacherId
      : r.userId
        ? userName.get(r.userId) ?? r.userId
        : "—",
  }));
}

export interface AssignableTeacher {
  teacherId: string;
  name: string;
}

/** Active teachers of the org, id + name, for the invigilator picker. */
export async function listAssignableTeachers(
  organizationId: string,
  client?: PrismaClientOrTx
): Promise<AssignableTeacher[]> {
  const db = client ?? (await getDb());
  const rows = await db.teacher.findMany({
    where: { organizationId, status: "ACTIVE", deletedAt: null },
    select: { id: true, firstName: true, lastName: true },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
  });
  return rows.map((t) => ({ teacherId: t.id, name: `${t.firstName} ${t.lastName}`.trim() }));
}

// ─── Entity lookups for the pickers (capped, name-first, tenant-scoped) ────────
// Read-only, minimal-select, TAKE-capped searches that power EntityLookupCombobox.
// SQL Server `contains` is collation-driven (no `mode: insensitive` on this connector),
// mirroring the existing room search.

const LOOKUP_TAKE = 20;

export interface StudentLookupRow {
  id: string;
  code: string | null;
  name: string;
}
export async function lookupStudents(
  organizationId: string,
  query: string,
  client?: PrismaClientOrTx
): Promise<StudentLookupRow[]> {
  const db = client ?? (await getDb());
  const q = query.trim();
  const rows = await db.student.findMany({
    where: {
      organizationId,
      deletedAt: null,
      ...(q ? { OR: [{ firstName: { contains: q } }, { lastName: { contains: q } }, { code: { contains: q } }] } : {}),
    },
    select: { id: true, code: true, firstName: true, lastName: true },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    take: LOOKUP_TAKE,
  });
  return rows.map((r) => ({ id: r.id, code: r.code, name: `${r.firstName} ${r.lastName}`.trim() }));
}

export interface EnrollmentLookupRow {
  id: string;
  enrollmentNumber: string | null;
  courseName: string;
  status: string;
}
export async function lookupEnrollmentsForStudent(
  organizationId: string,
  studentId: string,
  client?: PrismaClientOrTx
): Promise<EnrollmentLookupRow[]> {
  const db = client ?? (await getDb());
  const rows = await db.enrollment.findMany({
    where: { organizationId, studentId, deletedAt: null },
    select: { id: true, enrollmentNumber: true, status: true, course: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: LOOKUP_TAKE,
  });
  return rows.map((r) => ({ id: r.id, enrollmentNumber: r.enrollmentNumber, courseName: r.course?.name ?? "—", status: r.status }));
}

export interface RoomLookupRow {
  id: string;
  name: string;
  code: string | null;
}
export async function lookupRooms(
  organizationId: string,
  query: string,
  client?: PrismaClientOrTx
): Promise<RoomLookupRow[]> {
  const db = client ?? (await getDb());
  const q = query.trim();
  return db.examRoom.findMany({
    where: { organizationId, status: "ACTIVE", ...(q ? { OR: [{ name: { contains: q } }, { code: { contains: q } }] } : {}) },
    select: { id: true, name: true, code: true },
    orderBy: { name: "asc" },
    take: LOOKUP_TAKE,
  });
}

export interface LevelSubjectLookupRow {
  id: string;
  subjectName: string;
  levelName: string;
  courseName: string;
}
export async function lookupLevelSubjects(
  organizationId: string,
  query: string,
  client?: PrismaClientOrTx
): Promise<LevelSubjectLookupRow[]> {
  const db = client ?? (await getDb());
  const q = query.trim();
  const rows = await db.levelSubject.findMany({
    where: { organizationId, deletedAt: null, status: "ACTIVE", ...(q ? { subject: { name: { contains: q } } } : {}) },
    select: {
      id: true,
      subject: { select: { name: true } },
      courseLevel: { select: { name: true, course: { select: { name: true } } } },
    },
    take: LOOKUP_TAKE,
  });
  return rows.map((r) => ({
    id: r.id,
    subjectName: r.subject?.name ?? "—",
    levelName: r.courseLevel?.name ?? "",
    courseName: r.courseLevel?.course?.name ?? "",
  }));
}

// ─── Registerable students for a session (bulk-register roster + preview) ─────

export interface RegisterableStudentRow {
  studentId: string;
  enrollmentId: string;
  name: string;
  number: string | null;
  alreadyRegistered: boolean;
}
export interface RegisterableStudentsResult {
  capacity: number;
  registeredCount: number;
  items: RegisterableStudentRow[];
}

/** Students with an ACTIVE enrollment in the session's course, each flagged whether they
 *  already have a (non-terminal) candidate row in this session — plus capacity + current
 *  registered count so the UI can pre-flight "eligible / already / no-vacancy". Read-only. */
export async function getRegisterableStudents(
  organizationId: string,
  session: { id: string; courseId: string | null; courseLevelId: string | null; levelSubjectId: string; capacity: number },
  client?: PrismaClientOrTx
): Promise<RegisterableStudentsResult> {
  const db = client ?? (await getDb());

  // Resolve the governing course (session.courseId, else via the level-subject's level).
  let courseId = session.courseId;
  if (!courseId) {
    const ls = await db.levelSubject.findUnique({
      where: { id: session.levelSubjectId },
      select: { courseLevel: { select: { courseId: true } } },
    });
    courseId = ls?.courseLevel?.courseId ?? null;
  }

  // Existing candidates in this session (non-terminal ⇒ already registered).
  const existing = await db.examCandidate.findMany({
    where: { organizationId, examSessionId: session.id },
    select: { studentId: true, status: true },
  });
  const terminal = new Set(["WITHDRAWN", "DISQUALIFIED"]);
  const activeStudentIds = new Set(existing.filter((c) => !terminal.has(c.status as string)).map((c) => c.studentId));
  const registeredCount = activeStudentIds.size;

  if (!courseId) return { capacity: session.capacity, registeredCount, items: [] };

  const enrollments = await db.enrollment.findMany({
    where: { organizationId, courseId, status: "ACTIVE", deletedAt: null },
    select: { id: true, studentId: true, student: { select: { code: true, firstName: true, lastName: true } } },
    orderBy: [{ student: { firstName: "asc" } }, { student: { lastName: "asc" } }],
    take: 1000,
  });

  const items: RegisterableStudentRow[] = enrollments.map((e) => ({
    studentId: e.studentId,
    enrollmentId: e.id,
    name: `${e.student?.firstName ?? ""} ${e.student?.lastName ?? ""}`.trim() || e.studentId,
    number: e.student?.code ?? null,
    alreadyRegistered: activeStudentIds.has(e.studentId),
  }));

  return { capacity: session.capacity, registeredCount, items };
}

export interface PeriodLookupRow {
  id: string;
  name: string;
  academicYear: string;
}
export async function lookupPeriods(
  organizationId: string,
  query: string,
  client?: PrismaClientOrTx
): Promise<PeriodLookupRow[]> {
  const db = client ?? (await getDb());
  const q = query.trim();
  return db.examPeriod.findMany({
    where: { organizationId, deletedAt: null, ...(q ? { OR: [{ name: { contains: q } }, { academicYear: { contains: q } }] } : {}) },
    select: { id: true, name: true, academicYear: true },
    orderBy: { createdAt: "desc" },
    take: LOOKUP_TAKE,
  });
}

export interface SessionCandidateCount {
  examSessionId: string;
  activeCount: number;
}
export async function countActiveCandidatesBySessionIds(
  organizationId: string,
  sessionIds: string[],
  client?: PrismaClientOrTx
): Promise<SessionCandidateCount[]> {
  if (sessionIds.length === 0) return [];
  const db = client ?? (await getDb());
  const rows = await db.examCandidate.groupBy({
    by: ["examSessionId"],
    where: {
      organizationId,
      examSessionId: { in: sessionIds },
      deletedAt: null,
      status: { notIn: ["WITHDRAWN", "DISQUALIFIED"] },
    },
    _count: { _all: true },
  });
  return rows.map((r) => ({ examSessionId: r.examSessionId, activeCount: r._count._all }));
}

export interface PeriodWindow {
  id: string;
  startsAt: Date;
  endsAt: Date;
}
export async function listPeriodWindowsByIds(
  organizationId: string,
  periodIds: string[],
  client?: PrismaClientOrTx
): Promise<PeriodWindow[]> {
  if (periodIds.length === 0) return [];
  const db = client ?? (await getDb());
  return db.examPeriod.findMany({
    where: { organizationId, id: { in: periodIds } },
    select: { id: true, startsAt: true, endsAt: true },
  });
}

export interface ActiveBindingRef {
  examSessionId: string;
  bindingId: string;
  assessmentComponentId: string;
}
export async function listActiveBindingsBySessionIds(
  organizationId: string,
  sessionIds: string[],
  client?: PrismaClientOrTx
): Promise<ActiveBindingRef[]> {
  if (sessionIds.length === 0) return [];
  const db = client ?? (await getDb());
  const rows = await db.examGradeComponentBinding.findMany({
    where: { organizationId, examSessionId: { in: sessionIds }, deletedAt: null },
    select: { id: true, examSessionId: true, assessmentComponentId: true },
  });
  return rows.map((r) => ({
    examSessionId: r.examSessionId,
    bindingId: r.id,
    assessmentComponentId: r.assessmentComponentId,
  }));
}
