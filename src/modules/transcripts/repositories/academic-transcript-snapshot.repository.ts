import { getDb } from "@/server/db";
import type { PrismaClientOrTx } from "@/server/db";
import type {
  TranscriptLevelSnapshotRecord,
  TranscriptSubjectSnapshotRecord,
  TranscriptAssessmentSnapshotRecord,
  TranscriptAttendanceSnapshotRecord,
  TranscriptSnapshotTree,
  TranscriptSnapshotLevelNode,
  TranscriptSnapshotSubjectNode,
} from "@/modules/transcripts/types";

// =============================================================================
// ACADEMIC TRANSCRIPT SNAPSHOT REPOSITORY (Phase 2)
//
// Immutable snapshot children (levels → subjects → assessments + attendance).
// CREATE and READ ONLY — this module intentionally exposes NO update/delete/
// upsert methods. Once a version's children are written they are frozen; the
// only correction path is a brand-new version (append-only, per the governing
// rule). Every row carries `organizationId`; every read is org-scoped.
//
// Creates return the persisted rows (with generated ids) so the caller can wire
// the parent→child references (level id → subjects, subject id → assessments).
// Rows are inserted one-by-one to obtain ids — `createManyAndReturn` is not
// supported on SQL Server. Callers run this inside the generate transaction.
// =============================================================================

const toNum = (v: unknown): number | null => (v == null ? null : Number(v));

// ─── Selects ─────────────────────────────────────────────────────────────────

const levelSelect = {
  id: true,
  organizationId: true,
  transcriptVersionId: true,
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
  createdAt: true,
} as const;

const subjectSelect = {
  id: true,
  organizationId: true,
  transcriptVersionId: true,
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
  createdAt: true,
} as const;

const assessmentSelect = {
  id: true,
  organizationId: true,
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
  createdAt: true,
} as const;

const attendanceSelect = {
  id: true,
  organizationId: true,
  transcriptVersionId: true,
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
  createdAt: true,
} as const;

// ─── Mappers ─────────────────────────────────────────────────────────────────

type LevelRow = { [K in keyof typeof levelSelect]: unknown };
type SubjectRow = { [K in keyof typeof subjectSelect]: unknown };
type AssessmentRow = { [K in keyof typeof assessmentSelect]: unknown };
type AttendanceRow = { [K in keyof typeof attendanceSelect]: unknown };

function toLevelRecord(row: LevelRow): TranscriptLevelSnapshotRecord {
  return {
    id: row.id as string,
    organizationId: row.organizationId as string,
    transcriptVersionId: row.transcriptVersionId as string,
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
    createdAt: row.createdAt as Date,
  };
}

function toSubjectRecord(row: SubjectRow): TranscriptSubjectSnapshotRecord {
  return {
    id: row.id as string,
    organizationId: row.organizationId as string,
    transcriptVersionId: row.transcriptVersionId as string,
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
    createdAt: row.createdAt as Date,
  };
}

function toAssessmentRecord(row: AssessmentRow): TranscriptAssessmentSnapshotRecord {
  return {
    id: row.id as string,
    organizationId: row.organizationId as string,
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
    createdAt: row.createdAt as Date,
  };
}

function toAttendanceRecord(row: AttendanceRow): TranscriptAttendanceSnapshotRecord {
  return {
    id: row.id as string,
    organizationId: row.organizationId as string,
    transcriptVersionId: row.transcriptVersionId as string,
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
    createdAt: row.createdAt as Date,
  };
}

// ─── Create inputs ─────────────────────────────────────────────────────────

export interface LevelSnapshotInput {
  courseLevelId?: string | null;
  levelName: string;
  levelCode?: string | null;
  levelOrder: number;
  finalGrade?: number | null;
  status: string;
  completedAt?: Date | null;
  startedAt?: Date | null;
  earnedCredits?: number | null;
  workloadHours?: number | null;
}

export interface SubjectSnapshotInput {
  transcriptLevelId: string;
  levelSubjectId?: string | null;
  subjectId?: string | null;
  subjectName: string;
  subjectCode?: string | null;
  subjectOrder: number;
  finalGrade?: number | null;
  status: string;
  minimumPassingGrade?: number | null;
  attendancePercentage?: number | null;
  minimumAttendancePercentage?: number | null;
  completedAt?: Date | null;
  credits?: number | null;
  workloadHours?: number | null;
  isRequired: boolean;
  recoveryStatus?: string | null;
}

export interface AssessmentSnapshotInput {
  transcriptSubjectId: string;
  studentAssessmentResultId?: string | null;
  assessmentComponentId?: string | null;
  assessmentEventId?: string | null;
  title?: string | null;
  componentName: string;
  componentType?: string | null;
  sourceType: string;
  grade: number;
  maxGrade: number;
  normalizedGrade: number;
  status: string;
  gradedAt?: Date | null;
  isRecovery: boolean;
  recoveryAttemptNumber?: number | null;
}

export interface AttendanceSnapshotInput {
  transcriptSubjectId?: string | null;
  levelSubjectId?: string | null;
  academicYearId?: string | null;
  academicTermId?: string | null;
  attendancePercentage?: number | null;
  totalSessions: number;
  totalPresentMinutes: number;
  totalScheduledMinutes: number;
  status: string;
  policyId?: string | null;
  policyName?: string | null;
  minimumAttendancePercentage?: number | null;
  calculatedAt?: Date | null;
}

// ─── Creates (append-only) ───────────────────────────────────────────────────

export interface CreateLevelSnapshotsParams {
  organizationId: string;
  transcriptVersionId: string;
  levels: LevelSnapshotInput[];
}

export async function createLevelSnapshots(
  params: CreateLevelSnapshotsParams,
  client?: PrismaClientOrTx
): Promise<TranscriptLevelSnapshotRecord[]> {
  const db = client ?? (await getDb());
  const out: TranscriptLevelSnapshotRecord[] = [];
  for (const level of params.levels) {
    const row = await db.academicTranscriptLevel.create({
      data: {
        organizationId: params.organizationId,
        transcriptVersionId: params.transcriptVersionId,
        courseLevelId: level.courseLevelId ?? null,
        levelName: level.levelName,
        levelCode: level.levelCode ?? null,
        levelOrder: level.levelOrder,
        finalGrade: level.finalGrade ?? null,
        status: level.status,
        completedAt: level.completedAt ?? null,
        startedAt: level.startedAt ?? null,
        earnedCredits: level.earnedCredits ?? null,
        workloadHours: level.workloadHours ?? null,
      },
      select: levelSelect,
    });
    out.push(toLevelRecord(row));
  }
  return out;
}

export interface CreateSubjectSnapshotsParams {
  organizationId: string;
  transcriptVersionId: string;
  subjects: SubjectSnapshotInput[];
}

export async function createSubjectSnapshots(
  params: CreateSubjectSnapshotsParams,
  client?: PrismaClientOrTx
): Promise<TranscriptSubjectSnapshotRecord[]> {
  const db = client ?? (await getDb());
  const out: TranscriptSubjectSnapshotRecord[] = [];
  for (const subject of params.subjects) {
    const row = await db.academicTranscriptSubject.create({
      data: {
        organizationId: params.organizationId,
        transcriptVersionId: params.transcriptVersionId,
        transcriptLevelId: subject.transcriptLevelId,
        levelSubjectId: subject.levelSubjectId ?? null,
        subjectId: subject.subjectId ?? null,
        subjectName: subject.subjectName,
        subjectCode: subject.subjectCode ?? null,
        subjectOrder: subject.subjectOrder,
        finalGrade: subject.finalGrade ?? null,
        status: subject.status,
        minimumPassingGrade: subject.minimumPassingGrade ?? null,
        attendancePercentage: subject.attendancePercentage ?? null,
        minimumAttendancePercentage: subject.minimumAttendancePercentage ?? null,
        completedAt: subject.completedAt ?? null,
        credits: subject.credits ?? null,
        workloadHours: subject.workloadHours ?? null,
        isRequired: subject.isRequired,
        recoveryStatus: subject.recoveryStatus ?? null,
      },
      select: subjectSelect,
    });
    out.push(toSubjectRecord(row));
  }
  return out;
}

export interface CreateAssessmentSnapshotsParams {
  organizationId: string;
  assessments: AssessmentSnapshotInput[];
}

export async function createAssessmentSnapshots(
  params: CreateAssessmentSnapshotsParams,
  client?: PrismaClientOrTx
): Promise<TranscriptAssessmentSnapshotRecord[]> {
  const db = client ?? (await getDb());
  const out: TranscriptAssessmentSnapshotRecord[] = [];
  for (const a of params.assessments) {
    const row = await db.academicTranscriptAssessment.create({
      data: {
        organizationId: params.organizationId,
        transcriptSubjectId: a.transcriptSubjectId,
        studentAssessmentResultId: a.studentAssessmentResultId ?? null,
        assessmentComponentId: a.assessmentComponentId ?? null,
        assessmentEventId: a.assessmentEventId ?? null,
        title: a.title ?? null,
        componentName: a.componentName,
        componentType: a.componentType ?? null,
        sourceType: a.sourceType,
        grade: a.grade,
        maxGrade: a.maxGrade,
        normalizedGrade: a.normalizedGrade,
        status: a.status,
        gradedAt: a.gradedAt ?? null,
        isRecovery: a.isRecovery,
        recoveryAttemptNumber: a.recoveryAttemptNumber ?? null,
      },
      select: assessmentSelect,
    });
    out.push(toAssessmentRecord(row));
  }
  return out;
}

export interface CreateAttendanceSnapshotsParams {
  organizationId: string;
  transcriptVersionId: string;
  attendances: AttendanceSnapshotInput[];
}

export async function createAttendanceSnapshots(
  params: CreateAttendanceSnapshotsParams,
  client?: PrismaClientOrTx
): Promise<TranscriptAttendanceSnapshotRecord[]> {
  const db = client ?? (await getDb());
  const out: TranscriptAttendanceSnapshotRecord[] = [];
  for (const at of params.attendances) {
    const row = await db.academicTranscriptAttendance.create({
      data: {
        organizationId: params.organizationId,
        transcriptVersionId: params.transcriptVersionId,
        transcriptSubjectId: at.transcriptSubjectId ?? null,
        levelSubjectId: at.levelSubjectId ?? null,
        academicYearId: at.academicYearId ?? null,
        academicTermId: at.academicTermId ?? null,
        attendancePercentage: at.attendancePercentage ?? null,
        totalSessions: at.totalSessions,
        totalPresentMinutes: at.totalPresentMinutes,
        totalScheduledMinutes: at.totalScheduledMinutes,
        status: at.status,
        policyId: at.policyId ?? null,
        policyName: at.policyName ?? null,
        minimumAttendancePercentage: at.minimumAttendancePercentage ?? null,
        calculatedAt: at.calculatedAt ?? null,
      },
      select: attendanceSelect,
    });
    out.push(toAttendanceRecord(row));
  }
  return out;
}

// ─── Reads (org-scoped, deterministic order) ─────────────────────────────────

export interface SnapshotByVersionParams {
  organizationId: string;
  transcriptVersionId: string;
}

export async function findLevelSnapshotsByVersionId(
  params: SnapshotByVersionParams,
  client?: PrismaClientOrTx
): Promise<TranscriptLevelSnapshotRecord[]> {
  const db = client ?? (await getDb());
  const rows = await db.academicTranscriptLevel.findMany({
    where: {
      transcriptVersionId: params.transcriptVersionId,
      organizationId: params.organizationId,
    },
    select: levelSelect,
    orderBy: [{ levelOrder: "asc" }, { id: "asc" }],
  });
  return rows.map(toLevelRecord);
}

export async function findSubjectSnapshotsByVersionId(
  params: SnapshotByVersionParams,
  client?: PrismaClientOrTx
): Promise<TranscriptSubjectSnapshotRecord[]> {
  const db = client ?? (await getDb());
  const rows = await db.academicTranscriptSubject.findMany({
    where: {
      transcriptVersionId: params.transcriptVersionId,
      organizationId: params.organizationId,
    },
    select: subjectSelect,
    orderBy: [{ subjectOrder: "asc" }, { id: "asc" }],
  });
  return rows.map(toSubjectRecord);
}

export interface AssessmentsBySubjectParams {
  organizationId: string;
  transcriptSubjectId: string;
}

export async function findAssessmentSnapshotsBySubjectId(
  params: AssessmentsBySubjectParams,
  client?: PrismaClientOrTx
): Promise<TranscriptAssessmentSnapshotRecord[]> {
  const db = client ?? (await getDb());
  const rows = await db.academicTranscriptAssessment.findMany({
    where: {
      transcriptSubjectId: params.transcriptSubjectId,
      organizationId: params.organizationId,
    },
    select: assessmentSelect,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  return rows.map(toAssessmentRecord);
}

export async function findAttendanceSnapshotsByVersionId(
  params: SnapshotByVersionParams,
  client?: PrismaClientOrTx
): Promise<TranscriptAttendanceSnapshotRecord[]> {
  const db = client ?? (await getDb());
  const rows = await db.academicTranscriptAttendance.findMany({
    where: {
      transcriptVersionId: params.transcriptVersionId,
      organizationId: params.organizationId,
    },
    select: attendanceSelect,
    orderBy: [{ transcriptSubjectId: "asc" }, { id: "asc" }],
  });
  return rows.map(toAttendanceRecord);
}

/** Full snapshot tree for one version, assembled in deterministic order
 *  (levels by levelOrder, subjects by subjectOrder, assessments by createdAt).
 *  Subject-grain attendance nests under its subject; version/period-grain
 *  attendance (transcriptSubjectId === null) is returned at the top level. */
export async function findSnapshotTreeByVersionId(
  params: SnapshotByVersionParams,
  client?: PrismaClientOrTx
): Promise<TranscriptSnapshotTree> {
  const [levels, subjects, attendances] = await Promise.all([
    findLevelSnapshotsByVersionId(params, client),
    findSubjectSnapshotsByVersionId(params, client),
    findAttendanceSnapshotsByVersionId(params, client),
  ]);

  const db = client ?? (await getDb());
  const subjectIds = subjects.map((s) => s.id);
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
  const assessments = assessmentRows.map(toAssessmentRecord);

  // Bucket children by their parent id.
  const assessmentsBySubject = new Map<string, TranscriptAssessmentSnapshotRecord[]>();
  for (const a of assessments) {
    const list = assessmentsBySubject.get(a.transcriptSubjectId) ?? [];
    list.push(a);
    assessmentsBySubject.set(a.transcriptSubjectId, list);
  }

  const subjectAttendanceBySubject = new Map<string, TranscriptAttendanceSnapshotRecord[]>();
  const versionAttendance: TranscriptAttendanceSnapshotRecord[] = [];
  for (const at of attendances) {
    if (at.transcriptSubjectId == null) {
      versionAttendance.push(at);
      continue;
    }
    const list = subjectAttendanceBySubject.get(at.transcriptSubjectId) ?? [];
    list.push(at);
    subjectAttendanceBySubject.set(at.transcriptSubjectId, list);
  }

  const subjectsByLevel = new Map<string, TranscriptSnapshotSubjectNode[]>();
  for (const s of subjects) {
    const node: TranscriptSnapshotSubjectNode = {
      ...s,
      assessments: assessmentsBySubject.get(s.id) ?? [],
      attendances: subjectAttendanceBySubject.get(s.id) ?? [],
    };
    const list = subjectsByLevel.get(s.transcriptLevelId) ?? [];
    list.push(node);
    subjectsByLevel.set(s.transcriptLevelId, list);
  }

  const levelNodes: TranscriptSnapshotLevelNode[] = levels.map((level) => ({
    ...level,
    subjects: subjectsByLevel.get(level.id) ?? [],
  }));

  return { levels: levelNodes, attendances: versionAttendance };
}
