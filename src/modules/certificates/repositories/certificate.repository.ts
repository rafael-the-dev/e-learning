import { getDb } from "@/server/db";
import type { PrismaClientOrTx } from "@/server/db";
import type {
  CertificateDetailRecord,
  CertificateListFilters,
  CertificateRecord,
} from "@/modules/certificates/types/repository";
import { listCertificateEvents } from "./certificate-event.repository";
import { listCertificateExports } from "./certificate-export.repository";
import { findCertificateVerificationByCertificateId } from "./certificate-verification.repository";

// =============================================================================
// CERTIFICATE REPOSITORY (Phase 2B) — persistence only
// -----------------------------------------------------------------------------
// Tenant-safe access for the `Certificate` root. Writes set columns ONLY; the
// repository makes no lifecycle-transition decision, computes no checksum, and
// allocates no number — a command supplies those values and this layer stores
// them. No transcript reads (that is the ACL's job). Every query is org-scoped
// (findFirst / findMany / count / updateMany); soft delete only sets `deletedAt`
// and is guarded to DRAFT rows. No hard delete.
// =============================================================================

const certificateSelect = {
  id: true,
  organizationId: true,
  studentId: true,
  enrollmentId: true,
  courseId: true,
  transcriptVersionId: true,
  transcriptNumber: true,
  transcriptChecksum: true,
  certificatePolicyId: true,
  certificateTemplateId: true,
  certificateNumber: true,
  certificateType: true,
  status: true,
  studentSnapshot: true,
  courseSnapshot: true,
  issueBasisSnapshot: true,
  financialClearanceStatus: true,
  financialClearanceCheckedAt: true,
  financialClearanceReference: true,
  verificationCode: true,
  verificationUrl: true,
  checksum: true,
  issuedAt: true,
  issuedBy: true,
  revokedAt: true,
  revokedBy: true,
  revokeReason: true,
  suspendedAt: true,
  suspendedBy: true,
  suspendReason: true,
  staleDetectedAt: true,
  staleReason: true,
  expiresAt: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} as const;

type Row = Record<string, unknown>;

function toRecord(row: Row): CertificateRecord {
  return {
    id: row.id as string,
    organizationId: row.organizationId as string,
    studentId: row.studentId as string,
    enrollmentId: (row.enrollmentId as string | null) ?? null,
    courseId: (row.courseId as string | null) ?? null,
    transcriptVersionId: row.transcriptVersionId as string,
    transcriptNumber: row.transcriptNumber as string,
    transcriptChecksum: row.transcriptChecksum as string,
    certificatePolicyId: (row.certificatePolicyId as string | null) ?? null,
    certificateTemplateId: (row.certificateTemplateId as string | null) ?? null,
    certificateNumber: (row.certificateNumber as string | null) ?? null,
    certificateType: row.certificateType as string,
    status: row.status as string,
    studentSnapshot: row.studentSnapshot as string,
    courseSnapshot: (row.courseSnapshot as string | null) ?? null,
    issueBasisSnapshot: row.issueBasisSnapshot as string,
    financialClearanceStatus: row.financialClearanceStatus as string,
    financialClearanceCheckedAt: (row.financialClearanceCheckedAt as Date | null) ?? null,
    financialClearanceReference: (row.financialClearanceReference as string | null) ?? null,
    verificationCode: (row.verificationCode as string | null) ?? null,
    verificationUrl: (row.verificationUrl as string | null) ?? null,
    checksum: (row.checksum as string | null) ?? null,
    issuedAt: (row.issuedAt as Date | null) ?? null,
    issuedBy: (row.issuedBy as string | null) ?? null,
    revokedAt: (row.revokedAt as Date | null) ?? null,
    revokedBy: (row.revokedBy as string | null) ?? null,
    revokeReason: (row.revokeReason as string | null) ?? null,
    suspendedAt: (row.suspendedAt as Date | null) ?? null,
    suspendedBy: (row.suspendedBy as string | null) ?? null,
    suspendReason: (row.suspendReason as string | null) ?? null,
    staleDetectedAt: (row.staleDetectedAt as Date | null) ?? null,
    staleReason: (row.staleReason as string | null) ?? null,
    expiresAt: (row.expiresAt as Date | null) ?? null,
    createdAt: row.createdAt as Date,
    updatedAt: row.updatedAt as Date,
    deletedAt: (row.deletedAt as Date | null) ?? null,
  };
}

// ─── Create ──────────────────────────────────────────────────────────────────

export interface CreateCertificateParams {
  organizationId: string;
  studentId: string;
  transcriptVersionId: string;
  transcriptNumber: string;
  transcriptChecksum: string;
  certificateType: string;
  studentSnapshot: string;
  issueBasisSnapshot: string;
  enrollmentId?: string | null;
  courseId?: string | null;
  certificatePolicyId?: string | null;
  certificateTemplateId?: string | null;
  certificateNumber?: string | null;
  status?: string;
  courseSnapshot?: string | null;
  financialClearanceStatus?: string;
  financialClearanceCheckedAt?: Date | null;
  financialClearanceReference?: string | null;
  verificationCode?: string | null;
  verificationUrl?: string | null;
  expiresAt?: Date | null;
}

export async function createCertificate(
  params: CreateCertificateParams,
  client?: PrismaClientOrTx
): Promise<CertificateRecord> {
  const db = client ?? (await getDb());
  const row = await db.certificate.create({
    data: {
      organizationId: params.organizationId,
      studentId: params.studentId,
      transcriptVersionId: params.transcriptVersionId,
      transcriptNumber: params.transcriptNumber,
      transcriptChecksum: params.transcriptChecksum,
      certificateType: params.certificateType,
      studentSnapshot: params.studentSnapshot,
      issueBasisSnapshot: params.issueBasisSnapshot,
      enrollmentId: params.enrollmentId ?? null,
      courseId: params.courseId ?? null,
      certificatePolicyId: params.certificatePolicyId ?? null,
      certificateTemplateId: params.certificateTemplateId ?? null,
      certificateNumber: params.certificateNumber ?? null,
      status: params.status,
      courseSnapshot: params.courseSnapshot ?? null,
      financialClearanceStatus: params.financialClearanceStatus,
      financialClearanceCheckedAt: params.financialClearanceCheckedAt ?? null,
      financialClearanceReference: params.financialClearanceReference ?? null,
      verificationCode: params.verificationCode ?? null,
      verificationUrl: params.verificationUrl ?? null,
      expiresAt: params.expiresAt ?? null,
    },
    select: certificateSelect,
  });
  return toRecord(row);
}

// ─── Reads (org-scoped) ────────────────────────────────────────────────────

export interface FindCertificateByIdParams {
  id: string;
  organizationId: string;
}

export async function findCertificateById(
  params: FindCertificateByIdParams,
  client?: PrismaClientOrTx
): Promise<CertificateRecord | null> {
  const db = client ?? (await getDb());
  const row = await db.certificate.findFirst({
    where: { id: params.id, organizationId: params.organizationId },
    select: certificateSelect,
  });
  return row ? toRecord(row) : null;
}

/** The certificate plus its append-only children and 1:1 verification. Assembled
 *  with separate org-scoped reads (no Prisma relation include) so the shape is
 *  explicit and every child stays tenant-scoped. */
export async function findCertificateDetailById(
  params: FindCertificateByIdParams,
  client?: PrismaClientOrTx
): Promise<CertificateDetailRecord | null> {
  const base = await findCertificateById(params, client);
  if (!base) return null;

  const [events, exports, verification] = await Promise.all([
    listCertificateEvents({ organizationId: params.organizationId, certificateId: base.id }, client),
    listCertificateExports({ organizationId: params.organizationId, certificateId: base.id }, client),
    findCertificateVerificationByCertificateId(
      { organizationId: params.organizationId, certificateId: base.id },
      client
    ),
  ]);

  return { ...base, events, exports, verification };
}

export interface FindByNumberParams {
  organizationId: string;
  certificateNumber: string;
}

export async function findCertificateByNumber(
  params: FindByNumberParams,
  client?: PrismaClientOrTx
): Promise<CertificateRecord | null> {
  const db = client ?? (await getDb());
  const row = await db.certificate.findFirst({
    where: {
      organizationId: params.organizationId,
      certificateNumber: params.certificateNumber,
      deletedAt: null,
    },
    select: certificateSelect,
  });
  return row ? toRecord(row) : null;
}

export interface FindByVerificationCodeParams {
  organizationId: string;
  verificationCode: string;
}

export async function findCertificateByVerificationCode(
  params: FindByVerificationCodeParams,
  client?: PrismaClientOrTx
): Promise<CertificateRecord | null> {
  const db = client ?? (await getDb());
  const row = await db.certificate.findFirst({
    where: {
      organizationId: params.organizationId,
      verificationCode: params.verificationCode,
      deletedAt: null,
    },
    select: certificateSelect,
  });
  return row ? toRecord(row) : null;
}

export interface FindExistingActiveCertificateParams {
  organizationId: string;
  transcriptVersionId: string;
  certificateType: string;
}

/** The active certificate (if any) for a `(transcriptVersionId, certificateType)`,
 *  matching the `certificates_active_per_transcript_type_key` predicate: active
 *  excludes REVOKED and STALE, among live (`deletedAt = null`) rows. A duplicate
 *  check for the caller; this layer decides nothing. */
export async function findExistingActiveCertificate(
  params: FindExistingActiveCertificateParams,
  client?: PrismaClientOrTx
): Promise<CertificateRecord | null> {
  const db = client ?? (await getDb());
  const row = await db.certificate.findFirst({
    where: {
      organizationId: params.organizationId,
      transcriptVersionId: params.transcriptVersionId,
      certificateType: params.certificateType,
      deletedAt: null,
      status: { notIn: ["REVOKED", "STALE"] },
    },
    select: certificateSelect,
  });
  return row ? toRecord(row) : null;
}

export interface FindCertificatesByTranscriptVersionParams {
  organizationId: string;
  transcriptVersionId: string;
  /** Optional status filter (e.g. `[ISSUED, SUSPENDED, STALE]`); omitted → all live rows. */
  statuses?: string[];
}

/** Org-scoped list of the LIVE certificates linked to a transcript version (Phase 9).
 *  Backs the transcript-staleness reaction: a transcript-lifecycle fact names a
 *  `transcriptVersionId`, and every certificate that certified it may need to be
 *  marked STALE. Reads the Certificate table ONLY — no transcript/academic read.
 *  `deletedAt = null`; optional `{ status IN statuses }`; deterministic order. */
export async function findCertificatesByTranscriptVersion(
  params: FindCertificatesByTranscriptVersionParams,
  client?: PrismaClientOrTx
): Promise<CertificateRecord[]> {
  const db = client ?? (await getDb());
  const where: Record<string, unknown> = {
    organizationId: params.organizationId,
    transcriptVersionId: params.transcriptVersionId,
    deletedAt: null,
  };
  if (params.statuses && params.statuses.length > 0) {
    where.status = { in: params.statuses };
  }
  const rows = await db.certificate.findMany({
    where,
    select: certificateSelect,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  return rows.map(toRecord);
}

/** Build the org-scoped `where` shared by {@link listCertificates} + {@link countCertificates}. */
function buildCertificateListWhere(filters: CertificateListFilters): Record<string, unknown> {
  const where: Record<string, unknown> = { organizationId: filters.organizationId };
  if (filters.studentId !== undefined) where.studentId = filters.studentId;
  if (filters.enrollmentId !== undefined) where.enrollmentId = filters.enrollmentId;
  if (filters.courseId !== undefined) where.courseId = filters.courseId;
  if (filters.transcriptVersionId !== undefined) where.transcriptVersionId = filters.transcriptVersionId;
  if (filters.certificateType !== undefined) where.certificateType = filters.certificateType;
  if (filters.status !== undefined) where.status = filters.status;
  if (filters.issuedFrom !== undefined || filters.issuedTo !== undefined) {
    const issuedAt: Record<string, Date> = {};
    if (filters.issuedFrom !== undefined) issuedAt.gte = filters.issuedFrom;
    if (filters.issuedTo !== undefined) issuedAt.lte = filters.issuedTo;
    where.issuedAt = issuedAt;
  }
  if (filters.search) where.certificateNumber = { contains: filters.search };
  if (!filters.includeDeleted) where.deletedAt = null;
  return where;
}

export interface FindCertificatesByIdsParams {
  organizationId: string;
  ids: string[];
}

/** Batch org-scoped fetch by id set (Phase 13 bulk preview) — one query, no N+1.
 *  Returns `[]` for an empty id list; live rows only. */
export async function findCertificatesByIds(
  params: FindCertificatesByIdsParams,
  client?: PrismaClientOrTx
): Promise<CertificateRecord[]> {
  if (params.ids.length === 0) return [];
  const db = client ?? (await getDb());
  const rows = await db.certificate.findMany({
    where: { organizationId: params.organizationId, id: { in: params.ids }, deletedAt: null },
    select: certificateSelect,
  });
  return rows.map(toRecord);
}

export async function listCertificates(
  filters: CertificateListFilters,
  client?: PrismaClientOrTx
): Promise<CertificateRecord[]> {
  const db = client ?? (await getDb());
  const rows = await db.certificate.findMany({
    where: buildCertificateListWhere(filters),
    select: certificateSelect,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    skip: filters.skip,
    take: filters.take,
  });
  return rows.map(toRecord);
}

/** Org-scoped total matching the same filters (Phase 10 pagination). */
export async function countCertificates(
  filters: CertificateListFilters,
  client?: PrismaClientOrTx
): Promise<number> {
  const db = client ?? (await getDb());
  return db.certificate.count({ where: buildCertificateListWhere(filters) });
}

// ─── Writes (columns only; no lifecycle decision) ─────────────────────────────

export interface UpdateCertificateMetadataParams {
  id: string;
  organizationId: string;
  status?: string;
  certificatePolicyId?: string | null;
  certificateTemplateId?: string | null;
  certificateNumber?: string | null;
  studentSnapshot?: string;
  courseSnapshot?: string | null;
  issueBasisSnapshot?: string;
  financialClearanceStatus?: string;
  financialClearanceCheckedAt?: Date | null;
  financialClearanceReference?: string | null;
  verificationCode?: string | null;
  verificationUrl?: string | null;
  checksum?: string | null;
  issuedAt?: Date | null;
  issuedBy?: string | null;
  revokedAt?: Date | null;
  revokedBy?: string | null;
  revokeReason?: string | null;
  suspendedAt?: Date | null;
  suspendedBy?: string | null;
  suspendReason?: string | null;
  staleDetectedAt?: Date | null;
  staleReason?: string | null;
  expiresAt?: Date | null;
}

export async function updateCertificateMetadata(
  params: UpdateCertificateMetadataParams,
  client?: PrismaClientOrTx
): Promise<{ count: number }> {
  const db = client ?? (await getDb());
  const data: Record<string, unknown> = {};
  const nullableStrings: (keyof UpdateCertificateMetadataParams)[] = [
    "certificatePolicyId",
    "certificateTemplateId",
    "certificateNumber",
    "courseSnapshot",
    "financialClearanceReference",
    "verificationCode",
    "verificationUrl",
    "checksum",
    "issuedBy",
    "revokedBy",
    "revokeReason",
    "suspendedBy",
    "suspendReason",
    "staleReason",
  ];
  const nullableDates: (keyof UpdateCertificateMetadataParams)[] = [
    "financialClearanceCheckedAt",
    "issuedAt",
    "revokedAt",
    "suspendedAt",
    "staleDetectedAt",
    "expiresAt",
  ];
  const plainStrings: (keyof UpdateCertificateMetadataParams)[] = [
    "status",
    "studentSnapshot",
    "issueBasisSnapshot",
    "financialClearanceStatus",
  ];
  for (const key of plainStrings) if (key in params) data[key] = params[key];
  for (const key of nullableStrings) if (key in params) data[key] = params[key] ?? null;
  for (const key of nullableDates) if (key in params) data[key] = params[key] ?? null;

  const res = await db.certificate.updateMany({
    where: { id: params.id, organizationId: params.organizationId },
    data,
  });
  return { count: res.count };
}

export interface MarkCertificateIssuedParams {
  id: string;
  organizationId: string;
  certificateNumber: string;
  checksum: string;
  issuedAt: Date;
  issuedBy: string;
  verificationCode: string;
  verificationUrl?: string | null;
  expiresAt?: Date | null;
}

/** Conditional issue transition: DRAFT | PENDING_APPROVAL → ISSUED, setting the
 *  lifecycle metadata a command supplies (number, checksum, issue stamp,
 *  verification code/url, expiry). The `status IN (DRAFT, PENDING_APPROVAL)` guard
 *  makes a double-issue / issue-after-revoke race a no-op (`count: 0`) — the caller
 *  asserts `count === 1`. It never touches the frozen content columns
 *  (student/course/issueBasis snapshots, transcript pointer, finance snapshot). */
export async function markCertificateIssued(
  params: MarkCertificateIssuedParams,
  client?: PrismaClientOrTx
): Promise<{ count: number }> {
  const db = client ?? (await getDb());
  const res = await db.certificate.updateMany({
    where: {
      id: params.id,
      organizationId: params.organizationId,
      deletedAt: null,
      status: { in: ["DRAFT", "PENDING_APPROVAL"] },
    },
    data: {
      status: "ISSUED",
      certificateNumber: params.certificateNumber,
      checksum: params.checksum,
      issuedAt: params.issuedAt,
      issuedBy: params.issuedBy,
      verificationCode: params.verificationCode,
      verificationUrl: params.verificationUrl ?? null,
      expiresAt: params.expiresAt ?? null,
    },
  });
  return { count: res.count };
}

export interface MarkCertificateRevokedParams {
  id: string;
  organizationId: string;
  revokedAt: Date;
  revokedBy: string;
  revokeReason: string;
}

/** Conditional revoke: ISSUED | SUSPENDED → REVOKED (terminal). The
 *  `status IN (ISSUED, SUSPENDED)` guard makes a double-revoke / revoke-after-terminal
 *  race a no-op (`count: 0`) — the caller asserts `count === 1`. Never touches the
 *  frozen content columns, the number, the checksum, or the transcript pointer. */
export async function markCertificateRevoked(
  params: MarkCertificateRevokedParams,
  client?: PrismaClientOrTx
): Promise<{ count: number }> {
  const db = client ?? (await getDb());
  const res = await db.certificate.updateMany({
    where: {
      id: params.id,
      organizationId: params.organizationId,
      deletedAt: null,
      status: { in: ["ISSUED", "SUSPENDED"] },
    },
    data: {
      status: "REVOKED",
      revokedAt: params.revokedAt,
      revokedBy: params.revokedBy,
      revokeReason: params.revokeReason,
    },
  });
  return { count: res.count };
}

export interface MarkCertificateSuspendedParams {
  id: string;
  organizationId: string;
  suspendedAt: Date;
  suspendedBy: string;
  suspendReason: string;
}

/** Conditional suspend: ISSUED → SUSPENDED. The `status = ISSUED` guard makes a
 *  double-suspend / suspend-after-terminal race a no-op (`count: 0`). Content columns
 *  untouched. */
export async function markCertificateSuspended(
  params: MarkCertificateSuspendedParams,
  client?: PrismaClientOrTx
): Promise<{ count: number }> {
  const db = client ?? (await getDb());
  const res = await db.certificate.updateMany({
    where: {
      id: params.id,
      organizationId: params.organizationId,
      deletedAt: null,
      status: "ISSUED",
    },
    data: {
      status: "SUSPENDED",
      suspendedAt: params.suspendedAt,
      suspendedBy: params.suspendedBy,
      suspendReason: params.suspendReason,
    },
  });
  return { count: res.count };
}

export interface MarkCertificateRestoredParams {
  id: string;
  organizationId: string;
}

/** Conditional restore: SUSPENDED → ISSUED, clearing the current suspension fields
 *  (history stays in `CertificateEvent`/audit). The `status = SUSPENDED` guard makes a
 *  double-restore / restore-after-terminal race a no-op (`count: 0`). Content columns,
 *  number, checksum, issue stamp, and transcript pointer untouched. */
export async function markCertificateRestored(
  params: MarkCertificateRestoredParams,
  client?: PrismaClientOrTx
): Promise<{ count: number }> {
  const db = client ?? (await getDb());
  const res = await db.certificate.updateMany({
    where: {
      id: params.id,
      organizationId: params.organizationId,
      deletedAt: null,
      status: "SUSPENDED",
    },
    data: {
      status: "ISSUED",
      suspendedAt: null,
      suspendedBy: null,
      suspendReason: null,
    },
  });
  return { count: res.count };
}

export interface MarkCertificateStaleParams {
  id: string;
  organizationId: string;
  staleReason: string;
  staleDetectedAt?: Date;
}

/** Conditional stale transition: ISSUED → STALE, setting `staleReason`/
 *  `staleDetectedAt` (Phase 9). The `status = ISSUED` guard makes a double-mark /
 *  mark-after-terminal race a no-op (`count: 0`) — the caller asserts `count === 1`.
 *  Only an ISSUED certificate flips status here; a SUSPENDED/STALE certificate keeps
 *  its status and records the stale metadata via {@link setCertificateStaleMetadata}
 *  instead. Never touches the frozen content columns, number, checksum, or transcript
 *  pointer. */
export async function markCertificateStale(
  params: MarkCertificateStaleParams,
  client?: PrismaClientOrTx
): Promise<{ count: number }> {
  const db = client ?? (await getDb());
  const res = await db.certificate.updateMany({
    where: { id: params.id, organizationId: params.organizationId, deletedAt: null, status: "ISSUED" },
    data: {
      status: "STALE",
      staleReason: params.staleReason,
      staleDetectedAt: params.staleDetectedAt ?? new Date(),
    },
  });
  return { count: res.count };
}

export interface SetCertificateStaleMetadataParams {
  id: string;
  organizationId: string;
  staleReason: string;
  staleDetectedAt?: Date;
}

/** Records the stale metadata (`staleReason`/`staleDetectedAt`) WITHOUT changing the
 *  lifecycle status (Phase 9). Used when a SUSPENDED or already-STALE certificate's
 *  linked transcript is invalidated: the public suspension / stale state stays, but
 *  the reason is captured (we must not hide an active suspension behind STALE, nor
 *  overwrite a REVOKED/DRAFT/PENDING row). The `status IN (ISSUED, SUSPENDED, STALE)`
 *  guard keeps a REVOKED/DRAFT/PENDING race a no-op (`count: 0`). Never touches the
 *  status column, the number, the checksum, or the transcript pointer. */
export async function setCertificateStaleMetadata(
  params: SetCertificateStaleMetadataParams,
  client?: PrismaClientOrTx
): Promise<{ count: number }> {
  const db = client ?? (await getDb());
  const res = await db.certificate.updateMany({
    where: {
      id: params.id,
      organizationId: params.organizationId,
      deletedAt: null,
      status: { in: ["ISSUED", "SUSPENDED", "STALE"] },
    },
    data: {
      staleReason: params.staleReason,
      staleDetectedAt: params.staleDetectedAt ?? new Date(),
    },
  });
  return { count: res.count };
}

/** Soft delete restricted to DRAFT certificates. An issued/revoked/etc. row is
 *  never removed (count 0); an issued certificate is a permanent record. */
export async function softDeleteDraftCertificate(
  params: FindCertificateByIdParams,
  client?: PrismaClientOrTx
): Promise<{ count: number }> {
  const db = client ?? (await getDb());
  const res = await db.certificate.updateMany({
    where: {
      id: params.id,
      organizationId: params.organizationId,
      status: "DRAFT",
      deletedAt: null,
    },
    data: { deletedAt: new Date() },
  });
  return { count: res.count };
}
