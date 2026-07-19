import { getDb } from "@/server/db";
import type { PrismaClientOrTx } from "@/server/db";
import type { TeacherExamSessionFilters } from "@/modules/teacher-examinations/types";

// =============================================================================
// TEACHER EXAM REPOSITORY — assignment-scoped persistence reads (READ-ONLY)
// -----------------------------------------------------------------------------
// The teacher's visibility source is EXCLUSIVELY an active ExamInvigilatorAssignment:
// every query is filtered by organizationId AND `invigilators: { some: { teacherId } }`
// with a server-resolved teacherId. A session the teacher is not assigned to (or from
// another org) simply does not match — single reads are fail-closed by construction.
// Decimals are copied to numbers. No writes. No admin/student DTOs.
// =============================================================================

const toNum = (v: unknown): number | null => (v == null ? null : Number(v));

const OPERATIONAL_STATUSES = ["LOCKED", "IN_PROGRESS", "COMPLETED"] as const;

export interface TeacherSessionRow {
  examSessionId: string;
  title: string;
  sessionStatus: string;
  startsAt: Date;
  endsAt: Date;
  instructions: string | null;
  roomName: string | null;
  subjectName: string | null;
  levelName: string | null;
  courseName: string | null;
  periodName: string | null;
  /** The teacher's role on THIS session (from their assignment). */
  role: string;
}

const sessionSelect = (teacherId: string) =>
  ({
    id: true,
    title: true,
    status: true,
    startsAt: true,
    endsAt: true,
    instructions: true,
    room: { select: { name: true } },
    period: { select: { name: true } },
    levelSubject: {
      select: {
        subject: { select: { name: true } },
        courseLevel: { select: { name: true, course: { select: { name: true } } } },
      },
    },
    // Only the ACTING teacher's assignment → their role (filtered-unique per teacher).
    invigilators: { where: { teacherId }, select: { role: true } },
  }) as const;

type RawSession = {
  id: string;
  title: string;
  status: string;
  startsAt: Date;
  endsAt: Date;
  instructions: string | null;
  room: { name: string } | null;
  period: { name: string } | null;
  levelSubject: {
    subject: { name: string } | null;
    courseLevel: { name: string; course: { name: string } | null } | null;
  } | null;
  invigilators: Array<{ role: string }>;
};

function toSessionRow(s: RawSession): TeacherSessionRow {
  const cl = s.levelSubject?.courseLevel ?? null;
  return {
    examSessionId: s.id,
    title: s.title,
    sessionStatus: s.status,
    startsAt: s.startsAt,
    endsAt: s.endsAt,
    instructions: s.instructions ?? null,
    roomName: s.room?.name ?? null,
    subjectName: s.levelSubject?.subject?.name ?? null,
    levelName: cl?.name ?? null,
    courseName: cl?.course?.name ?? null,
    periodName: s.period?.name ?? null,
    role: s.invigilators[0]?.role ?? "",
  };
}

function buildWhere(
  organizationId: string,
  teacherId: string,
  filters: TeacherExamSessionFilters
): Record<string, unknown> {
  const where: Record<string, unknown> = {
    organizationId,
    invigilators: { some: { teacherId, ...(filters.role ? { role: filters.role } : {}) } },
  };
  if (filters.status) where.status = filters.status;
  else if (filters.pending === "true") where.status = { in: [...OPERATIONAL_STATUSES] };
  if (filters.periodId) where.periodId = filters.periodId;
  if (filters.subjectId) where.levelSubject = { subjectId: filters.subjectId };
  return where;
}

/** Assigned sessions (paginated), soonest first. */
export async function listAssignedSessions(
  organizationId: string,
  teacherId: string,
  filters: TeacherExamSessionFilters,
  skip: number,
  take: number,
  client?: PrismaClientOrTx
): Promise<TeacherSessionRow[]> {
  const db = client ?? (await getDb());
  const rows = (await db.examSession.findMany({
    where: buildWhere(organizationId, teacherId, filters),
    select: sessionSelect(teacherId),
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
    skip,
    take,
  })) as RawSession[];
  return rows.map(toSessionRow);
}

export async function countAssignedSessions(
  organizationId: string,
  teacherId: string,
  filters: TeacherExamSessionFilters,
  client?: PrismaClientOrTx
): Promise<number> {
  const db = client ?? (await getDb());
  return db.examSession.count({ where: buildWhere(organizationId, teacherId, filters) });
}

/** A single assigned session — fail-closed: returns null when the teacher is not
 *  assigned, the session is missing, or it belongs to another org. */
export async function findAssignedSession(
  organizationId: string,
  teacherId: string,
  examSessionId: string,
  client?: PrismaClientOrTx
): Promise<TeacherSessionRow | null> {
  const db = client ?? (await getDb());
  const s = (await db.examSession.findFirst({
    where: { id: examSessionId, organizationId, invigilators: { some: { teacherId } } },
    select: sessionSelect(teacherId),
  })) as RawSession | null;
  return s ? toSessionRow(s) : null;
}

export interface TeacherSessionProgressRow {
  examSessionId: string;
  candidateCount: number;
  attendanceMarked: number;
  resultsDraft: number;
  resultsSubmitted: number;
}

type RawProgressCandidate = {
  examSessionId: string;
  status: string;
  attendance: { status: string } | null;
  result: { status: string } | null;
};

/** Batched work-progress for a set of sessions (candidate/attendance/result counts).
 *  candidateCount = REGISTERED candidates. */
export async function loadSessionsProgress(
  organizationId: string,
  examSessionIds: string[],
  client?: PrismaClientOrTx
): Promise<Map<string, TeacherSessionProgressRow>> {
  const out = new Map<string, TeacherSessionProgressRow>();
  for (const id of examSessionIds) {
    out.set(id, { examSessionId: id, candidateCount: 0, attendanceMarked: 0, resultsDraft: 0, resultsSubmitted: 0 });
  }
  if (examSessionIds.length === 0) return out;

  const db = client ?? (await getDb());
  const cands = (await db.examCandidate.findMany({
    where: { organizationId, examSessionId: { in: examSessionIds }, deletedAt: null },
    select: {
      examSessionId: true,
      status: true,
      attendance: { select: { status: true } },
      result: { select: { status: true } },
    },
  })) as RawProgressCandidate[];

  for (const c of cands) {
    const p = out.get(c.examSessionId);
    if (!p) continue;
    if (c.status === "REGISTERED") p.candidateCount += 1;
    if (c.attendance) p.attendanceMarked += 1;
    if (c.result?.status === "DRAFT") p.resultsDraft += 1;
    if (c.result?.status === "SUBMITTED") p.resultsSubmitted += 1;
  }
  return out;
}

export interface TeacherCandidateRow {
  examCandidateId: string;
  studentName: string | null;
  studentNumber: string | null;
  candidateStatus: string;
  attendanceStatus: string | null;
  resultId: string | null;
  resultStatus: string | null;
  resultCode: string | null;
  score: number | null;
  maxScore: number | null;
  normalizedScore: number | null;
}

type RawDetailCandidate = {
  id: string;
  status: string;
  student: { firstName: string; lastName: string; code: string | null } | null;
  attendance: { status: string } | null;
  result: {
    id: string;
    status: string;
    resultCode: string | null;
    score: unknown;
    maxScore: unknown;
    normalizedScore: unknown;
  } | null;
};

/** The candidate roster of a session (read-only). Caller must have already resolved
 *  the assignment via `findAssignedSession` — this is org-scoped only. */
export async function listSessionCandidates(
  organizationId: string,
  examSessionId: string,
  client?: PrismaClientOrTx
): Promise<TeacherCandidateRow[]> {
  const db = client ?? (await getDb());
  const rows = (await db.examCandidate.findMany({
    where: { organizationId, examSessionId, deletedAt: null },
    select: {
      id: true,
      status: true,
      student: { select: { firstName: true, lastName: true, code: true } },
      attendance: { select: { status: true } },
      result: {
        select: { id: true, status: true, resultCode: true, score: true, maxScore: true, normalizedScore: true },
      },
    },
    orderBy: [{ student: { lastName: "asc" } }, { id: "asc" }],
  })) as RawDetailCandidate[];

  return rows.map((c) => ({
    examCandidateId: c.id,
    studentName: c.student ? `${c.student.firstName} ${c.student.lastName}` : null,
    studentNumber: c.student?.code ?? null,
    candidateStatus: c.status,
    attendanceStatus: c.attendance?.status ?? null,
    resultId: c.result?.id ?? null,
    resultStatus: c.result?.status ?? null,
    resultCode: c.result?.resultCode ?? null,
    score: toNum(c.result?.score),
    maxScore: toNum(c.result?.maxScore),
    normalizedScore: toNum(c.result?.normalizedScore),
  }));
}

export interface TeacherSessionFacets {
  subjects: Array<{ id: string; name: string }>;
  periods: Array<{ id: string; name: string }>;
}

type RawFacetSession = {
  periodId: string;
  period: { name: string } | null;
  levelSubject: { subjectId: string; subject: { name: string } | null } | null;
};

/** Distinct subjects + periods across the teacher's assigned sessions (filter options). */
export async function listAssignedSessionFacets(
  organizationId: string,
  teacherId: string,
  client?: PrismaClientOrTx
): Promise<TeacherSessionFacets> {
  const db = client ?? (await getDb());
  const rows = (await db.examSession.findMany({
    where: { organizationId, invigilators: { some: { teacherId } } },
    select: {
      periodId: true,
      period: { select: { name: true } },
      levelSubject: { select: { subjectId: true, subject: { select: { name: true } } } },
    },
  })) as RawFacetSession[];

  const subjects = new Map<string, string>();
  const periods = new Map<string, string>();
  for (const r of rows) {
    if (r.periodId) periods.set(r.periodId, r.period?.name ?? r.periodId);
    const ls = r.levelSubject;
    if (ls?.subjectId) subjects.set(ls.subjectId, ls.subject?.name ?? ls.subjectId);
  }
  return {
    subjects: [...subjects.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "pt-PT")),
    periods: [...periods.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "pt-PT")),
  };
}
