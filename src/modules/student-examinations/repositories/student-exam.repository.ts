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

/** Current-official overlay: for a published result whose `currentRevisionId` is
 *  set, the CURRENT revision's revised score (appeals, Phase 2). Read-only; no
 *  pass/fail. Batched by result id. */
export interface CurrentRevisionOverlay {
  examResultId: string;
  revisedScore: number | null;
}

export async function listCurrentRevisionsByResultIds(
  organizationId: string,
  revisionIds: string[],
  client?: PrismaClientOrTx
): Promise<CurrentRevisionOverlay[]> {
  if (revisionIds.length === 0) return [];
  const db = client ?? (await getDb());
  const rows = await db.examResultRevision.findMany({
    where: { organizationId, id: { in: revisionIds }, isCurrent: true },
    select: { examResultId: true, revisedScore: true },
  });
  return rows.map((r) => ({
    examResultId: r.examResultId,
    revisedScore: toNum(r.revisedScore),
  }));
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
