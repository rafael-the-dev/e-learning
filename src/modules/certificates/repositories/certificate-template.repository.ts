import { getDb } from "@/server/db";
import type { PrismaClientOrTx } from "@/server/db";
import type {
  CertificateTemplateListFilters,
  CertificateTemplateRecord,
} from "@/modules/certificates/types/repository";

// =============================================================================
// CERTIFICATE TEMPLATE REPOSITORY (Phase 2B) — persistence only
// -----------------------------------------------------------------------------
// Tenant-safe access for `CertificateTemplate`. `layoutJson` / `templateHtml` are
// stored as opaque strings — NO rendering, NO PDF, NO HTML processing here. Every
// query is org-scoped (findFirst / findMany / count / updateMany). Soft delete
// only sets `deletedAt`; no hard delete.
// =============================================================================

const templateSelect = {
  id: true,
  organizationId: true,
  name: true,
  certificateType: true,
  courseId: true,
  language: true,
  layoutJson: true,
  templateHtml: true,
  backgroundImageUrl: true,
  signatureImageUrl: true,
  sealImageUrl: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} as const;

type Row = Record<string, unknown>;

function toRecord(row: Row): CertificateTemplateRecord {
  return {
    id: row.id as string,
    organizationId: row.organizationId as string,
    name: row.name as string,
    certificateType: row.certificateType as string,
    courseId: (row.courseId as string | null) ?? null,
    language: row.language as string,
    layoutJson: row.layoutJson as string,
    templateHtml: (row.templateHtml as string | null) ?? null,
    backgroundImageUrl: (row.backgroundImageUrl as string | null) ?? null,
    signatureImageUrl: (row.signatureImageUrl as string | null) ?? null,
    sealImageUrl: (row.sealImageUrl as string | null) ?? null,
    status: row.status as string,
    createdAt: row.createdAt as Date,
    updatedAt: row.updatedAt as Date,
    deletedAt: (row.deletedAt as Date | null) ?? null,
  };
}

// ─── Create ──────────────────────────────────────────────────────────────────

export interface CreateCertificateTemplateParams {
  organizationId: string;
  name: string;
  certificateType: string;
  layoutJson: string;
  courseId?: string | null;
  language?: string;
  templateHtml?: string | null;
  backgroundImageUrl?: string | null;
  signatureImageUrl?: string | null;
  sealImageUrl?: string | null;
  status?: string;
}

export async function createCertificateTemplate(
  params: CreateCertificateTemplateParams,
  client?: PrismaClientOrTx
): Promise<CertificateTemplateRecord> {
  const db = client ?? (await getDb());
  const row = await db.certificateTemplate.create({
    data: {
      organizationId: params.organizationId,
      name: params.name,
      certificateType: params.certificateType,
      layoutJson: params.layoutJson,
      courseId: params.courseId ?? null,
      language: params.language,
      templateHtml: params.templateHtml ?? null,
      backgroundImageUrl: params.backgroundImageUrl ?? null,
      signatureImageUrl: params.signatureImageUrl ?? null,
      sealImageUrl: params.sealImageUrl ?? null,
      status: params.status,
    },
    select: templateSelect,
  });
  return toRecord(row);
}

// ─── Reads (org-scoped) ────────────────────────────────────────────────────

export interface FindCertificateTemplateByIdParams {
  id: string;
  organizationId: string;
}

export async function findCertificateTemplateById(
  params: FindCertificateTemplateByIdParams,
  client?: PrismaClientOrTx
): Promise<CertificateTemplateRecord | null> {
  const db = client ?? (await getDb());
  const row = await db.certificateTemplate.findFirst({
    where: { id: params.id, organizationId: params.organizationId },
    select: templateSelect,
  });
  return row ? toRecord(row) : null;
}

export interface FindDefaultActiveTemplateParams {
  organizationId: string;
  certificateType: string;
  language: string;
}

/** The single ACTIVE org-default (`courseId = null`) template for a type+language,
 *  or null. Mirrors the `certificate_templates_org_default_active_key` filtered
 *  index — a simple lookup, no resolution logic. */
export async function findDefaultActiveTemplate(
  params: FindDefaultActiveTemplateParams,
  client?: PrismaClientOrTx
): Promise<CertificateTemplateRecord | null> {
  const db = client ?? (await getDb());
  const row = await db.certificateTemplate.findFirst({
    where: {
      organizationId: params.organizationId,
      certificateType: params.certificateType,
      language: params.language,
      courseId: null,
      status: "ACTIVE",
      deletedAt: null,
    },
    select: templateSelect,
  });
  return row ? toRecord(row) : null;
}

export interface FindCourseOverrideTemplateParams {
  organizationId: string;
  certificateType: string;
  courseId: string;
  language: string;
}

/** The single ACTIVE per-course-override template for a type+course+language, or
 *  null. Mirrors the `certificate_templates_org_course_override_active_key` index. */
export async function findCourseOverrideTemplate(
  params: FindCourseOverrideTemplateParams,
  client?: PrismaClientOrTx
): Promise<CertificateTemplateRecord | null> {
  const db = client ?? (await getDb());
  const row = await db.certificateTemplate.findFirst({
    where: {
      organizationId: params.organizationId,
      certificateType: params.certificateType,
      courseId: params.courseId,
      language: params.language,
      status: "ACTIVE",
      deletedAt: null,
    },
    select: templateSelect,
  });
  return row ? toRecord(row) : null;
}

export async function listCertificateTemplates(
  filters: CertificateTemplateListFilters,
  client?: PrismaClientOrTx
): Promise<CertificateTemplateRecord[]> {
  const db = client ?? (await getDb());
  const where: Record<string, unknown> = { organizationId: filters.organizationId };
  if (filters.certificateType !== undefined) where.certificateType = filters.certificateType;
  if (filters.courseId !== undefined) where.courseId = filters.courseId;
  if (filters.language !== undefined) where.language = filters.language;
  if (filters.status !== undefined) where.status = filters.status;
  if (!filters.includeDeleted) where.deletedAt = null;

  const rows = await db.certificateTemplate.findMany({
    where,
    select: templateSelect,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    skip: filters.skip,
    take: filters.take,
  });
  return rows.map(toRecord);
}

// ─── Writes (metadata only; soft delete) ─────────────────────────────────────

export interface UpdateCertificateTemplateMetadataParams {
  id: string;
  organizationId: string;
  name?: string;
  courseId?: string | null;
  language?: string;
  layoutJson?: string;
  templateHtml?: string | null;
  backgroundImageUrl?: string | null;
  signatureImageUrl?: string | null;
  sealImageUrl?: string | null;
  status?: string;
}

export async function updateCertificateTemplateMetadata(
  params: UpdateCertificateTemplateMetadataParams,
  client?: PrismaClientOrTx
): Promise<{ count: number }> {
  const db = client ?? (await getDb());
  const data: Record<string, unknown> = {};
  if ("name" in params) data.name = params.name;
  if ("courseId" in params) data.courseId = params.courseId ?? null;
  if ("language" in params) data.language = params.language;
  if ("layoutJson" in params) data.layoutJson = params.layoutJson;
  if ("templateHtml" in params) data.templateHtml = params.templateHtml ?? null;
  if ("backgroundImageUrl" in params) data.backgroundImageUrl = params.backgroundImageUrl ?? null;
  if ("signatureImageUrl" in params) data.signatureImageUrl = params.signatureImageUrl ?? null;
  if ("sealImageUrl" in params) data.sealImageUrl = params.sealImageUrl ?? null;
  if ("status" in params) data.status = params.status;

  const res = await db.certificateTemplate.updateMany({
    where: { id: params.id, organizationId: params.organizationId },
    data,
  });
  return { count: res.count };
}

export async function softDeleteCertificateTemplate(
  params: FindCertificateTemplateByIdParams,
  client?: PrismaClientOrTx
): Promise<{ count: number }> {
  const db = client ?? (await getDb());
  const res = await db.certificateTemplate.updateMany({
    where: { id: params.id, organizationId: params.organizationId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  return { count: res.count };
}
