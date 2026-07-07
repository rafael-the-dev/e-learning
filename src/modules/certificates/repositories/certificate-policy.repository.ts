import { getDb } from "@/server/db";
import type { PrismaClientOrTx } from "@/server/db";
import type {
  CertificatePolicyListFilters,
  CertificatePolicyRecord,
} from "@/modules/certificates/types/repository";

// =============================================================================
// CERTIFICATE POLICY REPOSITORY (Phase 2B) — persistence only
// -----------------------------------------------------------------------------
// Tenant-safe CRUD-ish access for `CertificatePolicy`. Every query is scoped by
// `organizationId` and uses findFirst / findMany / count / updateMany — never
// findUnique(id) / update(id) / delete(id). No eligibility, no policy-resolution
// order, no lifecycle rules: `findDefaultActivePolicy` and `findCourseOverridePolicy`
// are SIMPLE lookups; the future eligibility engine composes them. Soft delete
// only sets `deletedAt`; there is no hard delete.
// =============================================================================

const policySelect = {
  id: true,
  organizationId: true,
  name: true,
  certificateType: true,
  courseId: true,
  requiresIssuedTranscript: true,
  requiresCourseCompleted: true,
  requiresNoPendingSubjects: true,
  requiresFinancialClearance: true,
  requiresManualApproval: true,
  autoIssueOnTranscriptIssued: true,
  staleAction: true,
  validityMonths: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} as const;

type Row = Record<string, unknown>;

function toRecord(row: Row): CertificatePolicyRecord {
  return {
    id: row.id as string,
    organizationId: row.organizationId as string,
    name: row.name as string,
    certificateType: row.certificateType as string,
    courseId: (row.courseId as string | null) ?? null,
    requiresIssuedTranscript: row.requiresIssuedTranscript as boolean,
    requiresCourseCompleted: row.requiresCourseCompleted as boolean,
    requiresNoPendingSubjects: row.requiresNoPendingSubjects as boolean,
    requiresFinancialClearance: row.requiresFinancialClearance as boolean,
    requiresManualApproval: row.requiresManualApproval as boolean,
    autoIssueOnTranscriptIssued: row.autoIssueOnTranscriptIssued as boolean,
    staleAction: row.staleAction as string,
    validityMonths: (row.validityMonths as number | null) ?? null,
    status: row.status as string,
    createdAt: row.createdAt as Date,
    updatedAt: row.updatedAt as Date,
    deletedAt: (row.deletedAt as Date | null) ?? null,
  };
}

// ─── Create ──────────────────────────────────────────────────────────────────

export interface CreateCertificatePolicyParams {
  organizationId: string;
  name: string;
  certificateType: string;
  courseId?: string | null;
  requiresIssuedTranscript?: boolean;
  requiresCourseCompleted?: boolean;
  requiresNoPendingSubjects?: boolean;
  requiresFinancialClearance?: boolean;
  requiresManualApproval?: boolean;
  autoIssueOnTranscriptIssued?: boolean;
  staleAction?: string;
  validityMonths?: number | null;
  status?: string;
}

export async function createCertificatePolicy(
  params: CreateCertificatePolicyParams,
  client?: PrismaClientOrTx
): Promise<CertificatePolicyRecord> {
  const db = client ?? (await getDb());
  const row = await db.certificatePolicy.create({
    data: {
      organizationId: params.organizationId,
      name: params.name,
      certificateType: params.certificateType,
      courseId: params.courseId ?? null,
      requiresIssuedTranscript: params.requiresIssuedTranscript,
      requiresCourseCompleted: params.requiresCourseCompleted,
      requiresNoPendingSubjects: params.requiresNoPendingSubjects,
      requiresFinancialClearance: params.requiresFinancialClearance,
      requiresManualApproval: params.requiresManualApproval,
      autoIssueOnTranscriptIssued: params.autoIssueOnTranscriptIssued,
      staleAction: params.staleAction,
      validityMonths: params.validityMonths ?? null,
      status: params.status,
    },
    select: policySelect,
  });
  return toRecord(row);
}

// ─── Reads (org-scoped) ────────────────────────────────────────────────────

export interface FindCertificatePolicyByIdParams {
  id: string;
  organizationId: string;
}

export async function findCertificatePolicyById(
  params: FindCertificatePolicyByIdParams,
  client?: PrismaClientOrTx
): Promise<CertificatePolicyRecord | null> {
  const db = client ?? (await getDb());
  const row = await db.certificatePolicy.findFirst({
    where: { id: params.id, organizationId: params.organizationId },
    select: policySelect,
  });
  return row ? toRecord(row) : null;
}

export interface FindDefaultActivePolicyParams {
  organizationId: string;
  certificateType: string;
}

/** The single ACTIVE org-default (`courseId = null`) policy for a type, or null.
 *  Mirrors the `certificate_policies_org_default_active_key` filtered index —
 *  a simple lookup, no resolution logic. */
export async function findDefaultActivePolicy(
  params: FindDefaultActivePolicyParams,
  client?: PrismaClientOrTx
): Promise<CertificatePolicyRecord | null> {
  const db = client ?? (await getDb());
  const row = await db.certificatePolicy.findFirst({
    where: {
      organizationId: params.organizationId,
      certificateType: params.certificateType,
      courseId: null,
      status: "ACTIVE",
      deletedAt: null,
    },
    select: policySelect,
  });
  return row ? toRecord(row) : null;
}

export interface FindCourseOverridePolicyParams {
  organizationId: string;
  certificateType: string;
  courseId: string;
}

/** The single ACTIVE per-course-override policy for a type, or null. Mirrors the
 *  `certificate_policies_org_course_override_active_key` filtered index. */
export async function findCourseOverridePolicy(
  params: FindCourseOverridePolicyParams,
  client?: PrismaClientOrTx
): Promise<CertificatePolicyRecord | null> {
  const db = client ?? (await getDb());
  const row = await db.certificatePolicy.findFirst({
    where: {
      organizationId: params.organizationId,
      certificateType: params.certificateType,
      courseId: params.courseId,
      status: "ACTIVE",
      deletedAt: null,
    },
    select: policySelect,
  });
  return row ? toRecord(row) : null;
}

export async function listCertificatePolicies(
  filters: CertificatePolicyListFilters,
  client?: PrismaClientOrTx
): Promise<CertificatePolicyRecord[]> {
  const db = client ?? (await getDb());
  const where: Record<string, unknown> = { organizationId: filters.organizationId };
  if (filters.certificateType !== undefined) where.certificateType = filters.certificateType;
  if (filters.courseId !== undefined) where.courseId = filters.courseId;
  if (filters.status !== undefined) where.status = filters.status;
  if (!filters.includeDeleted) where.deletedAt = null;

  const rows = await db.certificatePolicy.findMany({
    where,
    select: policySelect,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    skip: filters.skip,
    take: filters.take,
  });
  return rows.map(toRecord);
}

// ─── Writes (metadata only; soft delete) ─────────────────────────────────────

export interface UpdateCertificatePolicyMetadataParams {
  id: string;
  organizationId: string;
  name?: string;
  courseId?: string | null;
  requiresIssuedTranscript?: boolean;
  requiresCourseCompleted?: boolean;
  requiresNoPendingSubjects?: boolean;
  requiresFinancialClearance?: boolean;
  requiresManualApproval?: boolean;
  autoIssueOnTranscriptIssued?: boolean;
  staleAction?: string;
  validityMonths?: number | null;
  status?: string;
}

export async function updateCertificatePolicyMetadata(
  params: UpdateCertificatePolicyMetadataParams,
  client?: PrismaClientOrTx
): Promise<{ count: number }> {
  const db = client ?? (await getDb());
  const data: Record<string, unknown> = {};
  if ("name" in params) data.name = params.name;
  if ("courseId" in params) data.courseId = params.courseId ?? null;
  if ("requiresIssuedTranscript" in params) data.requiresIssuedTranscript = params.requiresIssuedTranscript;
  if ("requiresCourseCompleted" in params) data.requiresCourseCompleted = params.requiresCourseCompleted;
  if ("requiresNoPendingSubjects" in params) data.requiresNoPendingSubjects = params.requiresNoPendingSubjects;
  if ("requiresFinancialClearance" in params) data.requiresFinancialClearance = params.requiresFinancialClearance;
  if ("requiresManualApproval" in params) data.requiresManualApproval = params.requiresManualApproval;
  if ("autoIssueOnTranscriptIssued" in params) data.autoIssueOnTranscriptIssued = params.autoIssueOnTranscriptIssued;
  if ("staleAction" in params) data.staleAction = params.staleAction;
  if ("validityMonths" in params) data.validityMonths = params.validityMonths ?? null;
  if ("status" in params) data.status = params.status;

  const res = await db.certificatePolicy.updateMany({
    where: { id: params.id, organizationId: params.organizationId },
    data,
  });
  return { count: res.count };
}

export async function softDeleteCertificatePolicy(
  params: FindCertificatePolicyByIdParams,
  client?: PrismaClientOrTx
): Promise<{ count: number }> {
  const db = client ?? (await getDb());
  const res = await db.certificatePolicy.updateMany({
    where: { id: params.id, organizationId: params.organizationId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  return { count: res.count };
}
