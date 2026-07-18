import { getDb } from "@/server/db";
import type { PrismaClientOrTx } from "@/server/db";

// =============================================================================
// STUDENT EXAM REPOSITORY — student-scoped persistence reads (READ-ONLY)
// -----------------------------------------------------------------------------
// Every query is filtered by BOTH organizationId AND studentId — the studentId is
// always the server-resolved Student.id of the authenticated user (never from a
// URL). A candidacy or result that is not the student's own simply does not match,
// so single-item reads are IDOR-safe by construction. Prisma Decimals are copied
// to numbers (never recomputed / pass-fail'd). No writes. No admin DTOs.
// =============================================================================

const toNum = (v: unknown): number | null => (v == null ? null : Number(v));

/** The one rich projection the service maps into every student exam DTO. */
export interface StudentCandidacyRow {
  examCandidateId: string;
  examSessionId: string;
  candidateStatus: string;
  eligibilityStatus: string;
  eligibilitySnapshot: string | null;
  overridden: boolean;
  registeredAt: Date | null;
  session: {
    title: string;
    status: string;
    startsAt: Date;
    endsAt: Date;
    instructions: string | null;
    roomName: string | null;
    subjectName: string | null;
    levelName: string | null;
    courseName: string | null;
    periodName: string | null;
    academicYear: string | null;
    term: string | null;
  };
  attendanceStatus: string | null;
  result: {
    examResultId: string;
    status: string;
    score: number | null;
    maxScore: number;
    normalizedScore: number | null;
    resultCode: string | null;
    publishedAt: Date | null;
    currentRevisionId: string | null;
  } | null;
}

const candidacySelect = {
  id: true,
  examSessionId: true,
  status: true,
  eligibilityStatus: true,
  eligibilitySnapshot: true,
  overriddenById: true,
  registeredAt: true,
  session: {
    select: {
      title: true,
      status: true,
      startsAt: true,
      endsAt: true,
      instructions: true,
      room: { select: { name: true } },
      period: { select: { name: true, academicYear: true, term: true } },
      levelSubject: {
        select: {
          subject: { select: { name: true } },
          courseLevel: { select: { name: true, course: { select: { name: true } } } },
        },
      },
    },
  },
  attendance: { select: { status: true } },
  result: {
    select: {
      id: true,
      status: true,
      score: true,
      maxScore: true,
      normalizedScore: true,
      resultCode: true,
      publishedAt: true,
      currentRevisionId: true,
    },
  },
} as const;

// The nested Prisma select result, typed at the boundary (Decimals arrive as
// `unknown` and are copied to numbers by `toNum`/`Number`). `session` is a required
// relation so it is always present; `attendance`/`result` are nullable 1:1.
interface RawSession {
  title: string;
  status: string;
  startsAt: Date;
  endsAt: Date;
  instructions: string | null;
  room: { name: string } | null;
  period: { name: string; academicYear: string; term: string | null } | null;
  levelSubject: {
    subject: { name: string } | null;
    courseLevel: { name: string; course: { name: string } | null } | null;
  } | null;
}
interface RawResult {
  id: string;
  status: string;
  score: unknown;
  maxScore: unknown;
  normalizedScore: unknown;
  resultCode: string | null;
  publishedAt: Date | null;
  currentRevisionId: string | null;
}
interface RawCandidacy {
  id: string;
  examSessionId: string;
  status: string;
  eligibilityStatus: string;
  eligibilitySnapshot: string | null;
  overriddenById: string | null;
  registeredAt: Date | null;
  session: RawSession;
  attendance: { status: string } | null;
  result: RawResult | null;
}

function toRow(r: RawCandidacy): StudentCandidacyRow {
  const s = r.session;
  const ls = s.levelSubject;
  const cl = ls?.courseLevel ?? null;
  const res = r.result;
  return {
    examCandidateId: r.id,
    examSessionId: r.examSessionId,
    candidateStatus: r.status,
    eligibilityStatus: r.eligibilityStatus,
    eligibilitySnapshot: r.eligibilitySnapshot ?? null,
    overridden: r.overriddenById != null,
    registeredAt: r.registeredAt ?? null,
    session: {
      title: s.title ?? "",
      status: s.status ?? "",
      startsAt: s.startsAt,
      endsAt: s.endsAt,
      instructions: s.instructions ?? null,
      roomName: s.room?.name ?? null,
      subjectName: ls?.subject?.name ?? null,
      levelName: cl?.name ?? null,
      courseName: cl?.course?.name ?? null,
      periodName: s.period?.name ?? null,
      academicYear: s.period?.academicYear ?? null,
      term: s.period?.term ?? null,
    },
    attendanceStatus: r.attendance?.status ?? null,
    result: res
      ? {
          examResultId: res.id,
          status: res.status,
          score: toNum(res.score),
          maxScore: Number(res.maxScore),
          normalizedScore: toNum(res.normalizedScore),
          resultCode: res.resultCode ?? null,
          publishedAt: res.publishedAt ?? null,
          currentRevisionId: res.currentRevisionId ?? null,
        }
      : null,
  };
}

/** Every live candidacy of the student, oldest sitting first. Single query with
 *  the session/room/subject/level/course/period joins + attendance + result. */
export async function listStudentCandidacies(
  organizationId: string,
  studentId: string,
  client?: PrismaClientOrTx
): Promise<StudentCandidacyRow[]> {
  const db = client ?? (await getDb());
  const rows = await db.examCandidate.findMany({
    where: { organizationId, studentId, deletedAt: null },
    select: candidacySelect,
    orderBy: [{ session: { startsAt: "asc" } }, { id: "asc" }],
  });
  return (rows as unknown as RawCandidacy[]).map(toRow);
}

/** A single candidacy, ownership-enforced (id AND studentId AND org). Returns null
 *  when the id is not the student's own — the IDOR guard. */
export async function findStudentCandidacy(
  organizationId: string,
  studentId: string,
  examCandidateId: string,
  client?: PrismaClientOrTx
): Promise<StudentCandidacyRow | null> {
  const db = client ?? (await getDb());
  const row = await db.examCandidate.findFirst({
    where: { id: examCandidateId, organizationId, studentId, deletedAt: null },
    select: candidacySelect,
  });
  return row ? toRow(row as unknown as RawCandidacy) : null;
}

/** Count of the student's undecided appeals (PENDING | UNDER_REVIEW). */
export async function countPendingAppeals(
  organizationId: string,
  studentId: string,
  client?: PrismaClientOrTx
): Promise<number> {
  const db = client ?? (await getDb());
  return db.examAppeal.count({
    where: { organizationId, studentId, status: { in: ["PENDING", "UNDER_REVIEW"] } },
  });
}

// =============================================================================
// PHASE 2 — Result Details, Appeals, History (all studentId-scoped, READ-ONLY)
// =============================================================================

export interface StudentResultDetailRow {
  examResultId: string;
  examCandidateId: string;
  examSessionId: string;
  subjectName: string | null;
  courseName: string | null;
  levelName: string | null;
  sessionDate: Date;
  publishedAt: Date | null;
  score: number | null;
  maxScore: number;
  normalizedScore: number | null;
  resultCode: string | null;
}

interface RawResultDetail {
  id: string;
  examCandidateId: string;
  score: unknown;
  maxScore: unknown;
  normalizedScore: unknown;
  resultCode: string | null;
  publishedAt: Date | null;
  levelSubject: {
    subject: { name: string } | null;
    courseLevel: { name: string; course: { name: string } | null } | null;
  } | null;
  candidate: { examSessionId: string; session: { startsAt: Date; room: { name: string } | null } } | null;
}

/** A single PUBLISHED result, ownership-enforced (id AND studentId AND org AND
 *  status=PUBLISHED). Returns null for any of: missing, other student, other org,
 *  not-yet-published — the page turns null into notFound(). */
export async function findStudentResultDetail(
  organizationId: string,
  studentId: string,
  examResultId: string,
  client?: PrismaClientOrTx
): Promise<StudentResultDetailRow | null> {
  const db = client ?? (await getDb());
  const r = (await db.examResult.findFirst({
    where: { id: examResultId, organizationId, studentId, status: "PUBLISHED" },
    select: {
      id: true,
      examCandidateId: true,
      score: true,
      maxScore: true,
      normalizedScore: true,
      resultCode: true,
      publishedAt: true,
      levelSubject: {
        select: {
          subject: { select: { name: true } },
          courseLevel: { select: { name: true, course: { select: { name: true } } } },
        },
      },
      candidate: {
        select: { examSessionId: true, session: { select: { startsAt: true, room: { select: { name: true } } } } },
      },
    },
  })) as RawResultDetail | null;
  if (!r) return null;
  const cl = r.levelSubject?.courseLevel ?? null;
  return {
    examResultId: r.id,
    examCandidateId: r.examCandidateId,
    examSessionId: r.candidate?.examSessionId ?? "",
    subjectName: r.levelSubject?.subject?.name ?? null,
    courseName: cl?.course?.name ?? null,
    levelName: cl?.name ?? null,
    sessionDate: r.candidate?.session?.startsAt as Date,
    publishedAt: r.publishedAt ?? null,
    score: toNum(r.score),
    maxScore: Number(r.maxScore),
    normalizedScore: toNum(r.normalizedScore),
    resultCode: r.resultCode ?? null,
  };
}

export interface StudentAppealRow {
  appealId: string;
  examResultId: string;
  subjectName: string | null;
  sessionDate: Date | null;
  reason: string;
  status: string;
  decision: string | null;
  decidedAt: Date | null;
  submittedAt: Date;
}

interface RawAppeal {
  id: string;
  examResultId: string;
  reason: string;
  status: string;
  decision: string | null;
  decidedAt: Date | null;
  createdAt: Date;
  result: {
    levelSubject: { subject: { name: string } | null } | null;
    candidate: { session: { startsAt: Date } | null } | null;
  } | null;
}

const appealSelectWithJoins = {
  id: true,
  examResultId: true,
  reason: true,
  status: true,
  decision: true,
  decidedAt: true,
  createdAt: true,
  result: {
    select: {
      levelSubject: { select: { subject: { select: { name: true } } } },
      candidate: { select: { session: { select: { startsAt: true } } } },
    },
  },
} as const;

function toAppealRow(r: RawAppeal): StudentAppealRow {
  return {
    appealId: r.id,
    examResultId: r.examResultId,
    subjectName: r.result?.levelSubject?.subject?.name ?? null,
    sessionDate: r.result?.candidate?.session?.startsAt ?? null,
    reason: r.reason,
    status: r.status,
    decision: r.decision ?? null,
    decidedAt: r.decidedAt ?? null,
    submittedAt: r.createdAt,
  };
}

/** All of the student's appeals, most recent first. */
export async function listStudentAppeals(
  organizationId: string,
  studentId: string,
  client?: PrismaClientOrTx
): Promise<StudentAppealRow[]> {
  const db = client ?? (await getDb());
  const rows = (await db.examAppeal.findMany({
    where: { organizationId, studentId },
    select: appealSelectWithJoins,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
  })) as RawAppeal[];
  return rows.map(toAppealRow);
}

/** A single appeal, ownership-enforced (id AND studentId AND org) → null otherwise. */
export async function findStudentAppeal(
  organizationId: string,
  studentId: string,
  appealId: string,
  client?: PrismaClientOrTx
): Promise<StudentAppealRow | null> {
  const db = client ?? (await getDb());
  const row = (await db.examAppeal.findFirst({
    where: { id: appealId, organizationId, studentId },
    select: appealSelectWithJoins,
  })) as RawAppeal | null;
  return row ? toAppealRow(row) : null;
}

/** The latest appeal for one of the student's results (any status), if any. */
export async function findLatestAppealForResult(
  organizationId: string,
  studentId: string,
  examResultId: string,
  client?: PrismaClientOrTx
): Promise<StudentAppealRow | null> {
  const db = client ?? (await getDb());
  const row = (await db.examAppeal.findFirst({
    where: { organizationId, studentId, examResultId },
    select: appealSelectWithJoins,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
  })) as RawAppeal | null;
  return row ? toAppealRow(row) : null;
}

/** True when the student already has an ACTIVE (PENDING | UNDER_REVIEW) appeal for
 *  a result — the create-appeal duplicate guard, student-scoped. */
export async function hasActiveAppealForResult(
  organizationId: string,
  studentId: string,
  examResultId: string,
  client?: PrismaClientOrTx
): Promise<boolean> {
  const db = client ?? (await getDb());
  const row = await db.examAppeal.findFirst({
    where: { organizationId, studentId, examResultId, status: { in: ["PENDING", "UNDER_REVIEW"] } },
    select: { id: true },
  });
  return row != null;
}

export interface StudentHistoryFilters {
  year?: number;
  subjectId?: string;
  status?: string;
  skip?: number;
  take?: number;
}

function buildHistoryWhere(
  organizationId: string,
  studentId: string,
  filters: StudentHistoryFilters
): Record<string, unknown> {
  const where: Record<string, unknown> = { organizationId, studentId, deletedAt: null };
  const session: Record<string, unknown> = {};
  if (filters.year !== undefined) {
    session.startsAt = {
      gte: new Date(Date.UTC(filters.year, 0, 1)),
      lt: new Date(Date.UTC(filters.year + 1, 0, 1)),
    };
  }
  if (filters.subjectId) session.levelSubject = { subjectId: filters.subjectId };
  if (Object.keys(session).length > 0) where.session = session;
  if (filters.status) where.status = filters.status;
  return where;
}

/** Candidacy-based history (paginated, filtered) — reuses the rich candidacy select. */
export async function listStudentHistory(
  organizationId: string,
  studentId: string,
  filters: StudentHistoryFilters,
  client?: PrismaClientOrTx
): Promise<StudentCandidacyRow[]> {
  const db = client ?? (await getDb());
  const rows = await db.examCandidate.findMany({
    where: buildHistoryWhere(organizationId, studentId, filters),
    select: candidacySelect,
    orderBy: [{ session: { startsAt: "desc" } }, { id: "asc" }],
    skip: filters.skip,
    take: filters.take,
  });
  return (rows as unknown as RawCandidacy[]).map(toRow);
}

export async function countStudentHistory(
  organizationId: string,
  studentId: string,
  filters: StudentHistoryFilters,
  client?: PrismaClientOrTx
): Promise<number> {
  const db = client ?? (await getDb());
  return db.examCandidate.count({ where: buildHistoryWhere(organizationId, studentId, filters) });
}

export interface StudentHistoryFacets {
  years: number[];
  subjects: Array<{ id: string; name: string }>;
}

interface RawFacetRow {
  session: { startsAt: Date; levelSubject: { subjectId: string; subject: { name: string } | null } | null } | null;
}

/** Distinct years + subjects across ALL the student's candidacies — the History
 *  filter options (never just the current page). */
export async function listStudentHistoryFacets(
  organizationId: string,
  studentId: string,
  client?: PrismaClientOrTx
): Promise<StudentHistoryFacets> {
  const db = client ?? (await getDb());
  const rows = (await db.examCandidate.findMany({
    where: { organizationId, studentId, deletedAt: null },
    select: {
      session: {
        select: {
          startsAt: true,
          levelSubject: { select: { subjectId: true, subject: { select: { name: true } } } },
        },
      },
    },
  })) as RawFacetRow[];

  const years = new Set<number>();
  const subjects = new Map<string, string>();
  for (const r of rows) {
    if (r.session?.startsAt) years.add(new Date(r.session.startsAt).getUTCFullYear());
    const ls = r.session?.levelSubject;
    if (ls?.subjectId) subjects.set(ls.subjectId, ls.subject?.name ?? ls.subjectId);
  }
  return {
    years: [...years].sort((a, b) => b - a),
    subjects: [...subjects.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-PT")),
  };
}
