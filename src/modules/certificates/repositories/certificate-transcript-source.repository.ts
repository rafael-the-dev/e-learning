import { getDb } from "@/server/db";
import type { PrismaClientOrTx } from "@/server/db";
import type {
  TranscriptCertificateSourceDto,
  TranscriptSourceAssessmentDto,
  TranscriptSourceAttendanceDto,
  TranscriptSourceLevelDto,
  TranscriptSourceSubjectDto,
  TranscriptVersionSummaryDto,
} from "@/modules/certificates/types/transcript-source";

// =============================================================================
// CERTIFICATE TRANSCRIPT SOURCE REPOSITORY (Phase 2, Part A) — ANTI-CORRUPTION LAYER
// -----------------------------------------------------------------------------
// This repository is the ONLY component in the Certificate Engine allowed to read
// Transcript Engine data. It translates the transcript's internal persistence
// model into Certificate DTOs (`../types/transcript-source`). Everything else in
// the engine consumes those DTOs — nothing else ever names a transcript table.
//
// Consequences of that boundary (ADR-002):
//   • READ-ONLY. It never creates, updates, deletes, upserts, or marks-stale any
//     transcript row. No lifecycle, no numbering, no checksum, no events, no audit.
//   • NO BUSINESS LOGIC. It copies stored snapshot facts verbatim: no grade,
//     attendance, completion, or eligibility calculation; no derived fields.
//   • TENANT-SCOPED. Every query carries `organizationId` and uses findFirst /
//     findMany / count — never findUnique(id) — so one tenant can never read
//     another's transcript by id alone.
//   • It exposes NO Prisma entity, relation, or persistence detail — only DTOs.
//
// If the Transcript Engine's schema changes, ONLY this file changes; the DTO
// contract keeps every downstream certificate component untouched.
//
// Storage note the ACL absorbs: the transcript version persists course identity
// and course progress TOGETHER in one JSON column
// (`{ course, courseProgress }`). This repository parses that envelope and
// surfaces the two halves as the separate `courseSnapshot` / `courseProgressSnapshot`
// DTO fields — copied verbatim, never recomputed.
// =============================================================================

// ─── Value coercion (copy-only) ──────────────────────────────────────────────

/** Prisma Decimal | null → number | null. Copy, not calculation. */
const toNum = (v: unknown): number | null => (v == null ? null : Number(v));

/** Parse a stored JSON snapshot column verbatim. `null`/empty → null. */
function parseJson(value: unknown): Record<string, unknown> | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") return value as Record<string, unknown>;
  return JSON.parse(value) as Record<string, unknown>;
}

// ─── Selects (only the fields the DTOs need; join-key ids included) ───────────

const versionSelect = {
  id: true,
  transcriptId: true,
  status: true,
  checksum: true,
  issuedAt: true,
  issuedBy: true,
  studentSnapshot: true,
  courseSnapshot: true,
} as const;

const transcriptRootSelect = {
  id: true,
  transcriptNumber: true,
  transcriptType: true,
  studentId: true,
  courseId: true,
} as const;

const levelSelect = {
  id: true,
  courseLevelId: true,
  levelName: true,
  levelCode: true,
  levelOrder: true,
  finalGrade: true,
  status: true,
  completedAt: true,
  startedAt: true,
  earnedCredits: true,
  workloadHours: true,
} as const;

const subjectSelect = {
  id: true,
  transcriptLevelId: true,
  levelSubjectId: true,
  subjectId: true,
  subjectName: true,
  subjectCode: true,
  subjectOrder: true,
  finalGrade: true,
  status: true,
  minimumPassingGrade: true,
  attendancePercentage: true,
  minimumAttendancePercentage: true,
  completedAt: true,
  credits: true,
  workloadHours: true,
  isRequired: true,
  recoveryStatus: true,
} as const;

const assessmentSelect = {
  transcriptSubjectId: true,
  studentAssessmentResultId: true,
  assessmentComponentId: true,
  assessmentEventId: true,
  title: true,
  componentName: true,
  componentType: true,
  sourceType: true,
  grade: true,
  maxGrade: true,
  normalizedGrade: true,
  status: true,
  gradedAt: true,
  isRecovery: true,
  recoveryAttemptNumber: true,
} as const;

const attendanceSelect = {
  transcriptSubjectId: true,
  levelSubjectId: true,
  academicYearId: true,
  academicTermId: true,
  attendancePercentage: true,
  totalSessions: true,
  totalPresentMinutes: true,
  totalScheduledMinutes: true,
  status: true,
  policyId: true,
  policyName: true,
  minimumAttendancePercentage: true,
  calculatedAt: true,
} as const;

// ─── Row → DTO mappers (verbatim copy) ────────────────────────────────────────

type Row = Record<string, unknown>;

function toLevelDto(row: Row): TranscriptSourceLevelDto {
  return {
    transcriptLevelId: row.id as string,
    courseLevelId: (row.courseLevelId as string | null) ?? null,
    levelName: row.levelName as string,
    levelCode: (row.levelCode as string | null) ?? null,
    levelOrder: row.levelOrder as number,
    finalGrade: toNum(row.finalGrade),
    status: row.status as string,
    completedAt: (row.completedAt as Date | null) ?? null,
    startedAt: (row.startedAt as Date | null) ?? null,
    earnedCredits: (row.earnedCredits as number | null) ?? null,
    workloadHours: (row.workloadHours as number | null) ?? null,
  };
}

function toSubjectDto(row: Row): TranscriptSourceSubjectDto {
  return {
    transcriptSubjectId: row.id as string,
    transcriptLevelId: row.transcriptLevelId as string,
    levelSubjectId: (row.levelSubjectId as string | null) ?? null,
    subjectId: (row.subjectId as string | null) ?? null,
    subjectName: row.subjectName as string,
    subjectCode: (row.subjectCode as string | null) ?? null,
    subjectOrder: row.subjectOrder as number,
    finalGrade: toNum(row.finalGrade),
    status: row.status as string,
    minimumPassingGrade: toNum(row.minimumPassingGrade),
    attendancePercentage: toNum(row.attendancePercentage),
    minimumAttendancePercentage: toNum(row.minimumAttendancePercentage),
    completedAt: (row.completedAt as Date | null) ?? null,
    credits: (row.credits as number | null) ?? null,
    workloadHours: (row.workloadHours as number | null) ?? null,
    isRequired: row.isRequired as boolean,
    recoveryStatus: (row.recoveryStatus as string | null) ?? null,
  };
}

function toAssessmentDto(row: Row): TranscriptSourceAssessmentDto {
  return {
    transcriptSubjectId: row.transcriptSubjectId as string,
    studentAssessmentResultId: (row.studentAssessmentResultId as string | null) ?? null,
    assessmentComponentId: (row.assessmentComponentId as string | null) ?? null,
    assessmentEventId: (row.assessmentEventId as string | null) ?? null,
    title: (row.title as string | null) ?? null,
    componentName: row.componentName as string,
    componentType: (row.componentType as string | null) ?? null,
    sourceType: row.sourceType as string,
    grade: Number(row.grade),
    maxGrade: Number(row.maxGrade),
    normalizedGrade: Number(row.normalizedGrade),
    status: row.status as string,
    gradedAt: (row.gradedAt as Date | null) ?? null,
    isRecovery: row.isRecovery as boolean,
    recoveryAttemptNumber: (row.recoveryAttemptNumber as number | null) ?? null,
  };
}

function toAttendanceDto(row: Row): TranscriptSourceAttendanceDto {
  return {
    transcriptSubjectId: (row.transcriptSubjectId as string | null) ?? null,
    levelSubjectId: (row.levelSubjectId as string | null) ?? null,
    academicYearId: (row.academicYearId as string | null) ?? null,
    academicTermId: (row.academicTermId as string | null) ?? null,
    attendancePercentage: toNum(row.attendancePercentage),
    totalSessions: row.totalSessions as number,
    totalPresentMinutes: row.totalPresentMinutes as number,
    totalScheduledMinutes: row.totalScheduledMinutes as number,
    status: row.status as string,
    policyId: (row.policyId as string | null) ?? null,
    policyName: (row.policyName as string | null) ?? null,
    minimumAttendancePercentage: toNum(row.minimumAttendancePercentage),
    calculatedAt: (row.calculatedAt as Date | null) ?? null,
  };
}

// ─── Params ──────────────────────────────────────────────────────────────────

export interface TranscriptVersionSourceParams {
  organizationId: string;
  transcriptVersionId: string;
}

// ─── Reads (org-scoped, read-only) ────────────────────────────────────────────

/**
 * Load a complete, immutable snapshot of one ISSUED transcript version as a
 * Certificate DTO. Returns `null` when no matching ISSUED version exists for the
 * organization (missing, wrong tenant, or not ISSUED — DRAFT / SUPERSEDED /
 * REVOKED are ignored). The caller (a command) decides what a `null` means; this
 * layer raises no domain/validation/authorization error.
 *
 * Single aggregate load with bulk child reads (no N+1). Children come back in a
 * deterministic order: levels by `levelOrder`, subjects by `subjectOrder`,
 * assessments by parent then `createdAt`, attendance by parent — each with an `id`
 * tie-break.
 */
export async function findIssuedTranscriptVersionForCertificate(
  params: TranscriptVersionSourceParams,
  client?: PrismaClientOrTx
): Promise<TranscriptCertificateSourceDto | null> {
  const db = client ?? (await getDb());

  const version = await db.academicTranscriptVersion.findFirst({
    where: {
      id: params.transcriptVersionId,
      organizationId: params.organizationId,
      status: "ISSUED",
    },
    select: versionSelect,
  });
  if (!version) return null;

  const root = await db.academicTranscript.findFirst({
    where: { id: version.transcriptId as string, organizationId: params.organizationId },
    select: transcriptRootSelect,
  });
  if (!root) return null;

  const versionScope = {
    transcriptVersionId: params.transcriptVersionId,
    organizationId: params.organizationId,
  };

  const [levelRows, subjectRows, attendanceRows] = await Promise.all([
    db.academicTranscriptLevel.findMany({
      where: versionScope,
      select: levelSelect,
      orderBy: [{ levelOrder: "asc" }, { id: "asc" }],
    }),
    db.academicTranscriptSubject.findMany({
      where: versionScope,
      select: subjectSelect,
      orderBy: [{ subjectOrder: "asc" }, { id: "asc" }],
    }),
    db.academicTranscriptAttendance.findMany({
      where: versionScope,
      select: attendanceSelect,
      orderBy: [{ transcriptSubjectId: "asc" }, { id: "asc" }],
    }),
  ]);

  const subjects = subjectRows.map(toSubjectDto);
  const subjectIds = subjects.map((s) => s.transcriptSubjectId);

  // Bulk-load assessments for all subjects at once (avoids N+1). Assessments are
  // parented by subject, not version, so they are fetched by the subject id set.
  const assessmentRows =
    subjectIds.length === 0
      ? []
      : await db.academicTranscriptAssessment.findMany({
          where: {
            organizationId: params.organizationId,
            transcriptSubjectId: { in: subjectIds },
          },
          select: assessmentSelect,
          orderBy: [{ transcriptSubjectId: "asc" }, { createdAt: "asc" }, { id: "asc" }],
        });

  const courseEnvelope = parseJson(version.courseSnapshot);

  return {
    transcriptVersionId: version.id as string,
    transcriptNumber: (root.transcriptNumber as string | null) ?? null,
    transcriptChecksum: (version.checksum as string | null) ?? null,
    transcriptStatus: version.status as string,
    transcriptType: root.transcriptType as string,
    issuedAt: (version.issuedAt as Date | null) ?? null,
    issuedBy: (version.issuedBy as string | null) ?? null,
    studentSnapshot: parseJson(version.studentSnapshot) ?? {},
    courseSnapshot: courseEnvelope
      ? ((courseEnvelope.course as Record<string, unknown> | null) ?? null)
      : null,
    courseProgressSnapshot: courseEnvelope
      ? ((courseEnvelope.courseProgress as Record<string, unknown> | null) ?? null)
      : null,
    levels: levelRows.map(toLevelDto),
    subjects,
    assessments: assessmentRows.map(toAssessmentDto),
    attendance: attendanceRows.map(toAttendanceDto),
  };
}

/**
 * Lightweight metadata for a transcript version (any status), or `null` when the
 * version does not exist for the organization. No snapshot children are loaded.
 * `transcriptNumber`, `studentId`, and `courseId` come from the parent transcript
 * root; the rest from the version.
 */
export async function findTranscriptVersionSummary(
  params: TranscriptVersionSourceParams,
  client?: PrismaClientOrTx
): Promise<TranscriptVersionSummaryDto | null> {
  const db = client ?? (await getDb());

  const version = await db.academicTranscriptVersion.findFirst({
    where: { id: params.transcriptVersionId, organizationId: params.organizationId },
    select: {
      id: true,
      transcriptId: true,
      status: true,
      checksum: true,
      issuedAt: true,
    },
  });
  if (!version) return null;

  const root = await db.academicTranscript.findFirst({
    where: { id: version.transcriptId as string, organizationId: params.organizationId },
    select: { transcriptNumber: true, studentId: true, courseId: true },
  });
  if (!root) return null;

  return {
    transcriptVersionId: version.id as string,
    transcriptNumber: (root.transcriptNumber as string | null) ?? null,
    checksum: (version.checksum as string | null) ?? null,
    status: version.status as string,
    issuedAt: (version.issuedAt as Date | null) ?? null,
    studentId: root.studentId as string,
    courseId: (root.courseId as string | null) ?? null,
  };
}

/**
 * Whether an ISSUED transcript version with this id exists for the organization.
 * Read-only, tenant-scoped `count`. Never throws for a missing row — returns
 * `false`.
 */
export async function existsIssuedTranscript(
  params: TranscriptVersionSourceParams,
  client?: PrismaClientOrTx
): Promise<boolean> {
  const db = client ?? (await getDb());
  const n = await db.academicTranscriptVersion.count({
    where: {
      id: params.transcriptVersionId,
      organizationId: params.organizationId,
      status: "ISSUED",
    },
  });
  return n > 0;
}
