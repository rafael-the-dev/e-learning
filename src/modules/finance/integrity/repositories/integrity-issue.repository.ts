import { getDb } from "@/server/db";
import type { DetectedIssue, FinancialIntegrityIssue, ListIntegrityIssuesParams } from "../types";
import type {
  IntegrityIssueStatus,
  IntegrityIssueSeverity,
  IntegrityIssueCategory,
} from "@/shared/types/common";
import { randomUUID } from "crypto";

// =============================================================================
// MAPPING HELPER
// =============================================================================

function mapRow(row: {
  id: string;
  organizationId: string;
  severity: string;
  category: string;
  checkName: string;
  entityType: string;
  entityId: string;
  description: string;
  expectedValue: string | null;
  actualValue: string | null;
  detectedAt: Date;
  jobRunId: string | null;
  status: string;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  resolutionNotes: string | null;
  createdAt: Date;
  updatedAt: Date;
}): FinancialIntegrityIssue {
  return {
    id: row.id,
    organizationId: row.organizationId,
    severity: row.severity as IntegrityIssueSeverity,
    category: row.category as IntegrityIssueCategory,
    checkName: row.checkName,
    entityType: row.entityType,
    entityId: row.entityId,
    description: row.description,
    expectedValue: row.expectedValue,
    actualValue: row.actualValue,
    detectedAt: row.detectedAt,
    jobRunId: row.jobRunId,
    status: row.status as IntegrityIssueStatus,
    resolvedAt: row.resolvedAt,
    resolvedBy: row.resolvedBy,
    resolutionNotes: row.resolutionNotes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// =============================================================================
// WRITE — upsert an OPEN issue
// =============================================================================

/**
 * Persists a detected issue using upsert semantics:
 * - If an OPEN issue already exists for (org, entityType, entityId, checkName),
 *   update detectedAt, description, and jobRunId to confirm the issue persists.
 * - Otherwise create a new OPEN issue.
 *
 * Returns { isNew: true } for first detection, { isNew: false } for re-confirmation.
 *
 * NOTE: The filtered unique index in the migration enforces the single-OPEN
 * constraint at the database level. This function mirrors that logic in code
 * so callers get a typed result without relying solely on DB errors.
 */
export async function upsertOpenIssue(
  organizationId: string,
  issue: DetectedIssue,
  jobRunId: string | null
): Promise<{ isNew: boolean; issueId: string }> {
  const db = await getDb();

  const existing = await db.financialIntegrityIssue.findFirst({
    where: {
      organizationId,
      entityType: issue.entityType,
      entityId: issue.entityId,
      checkName: issue.checkName,
      status: "OPEN",
    },
    select: { id: true },
  });

  if (existing) {
    await db.financialIntegrityIssue.update({
      where: { id: existing.id },
      data: {
        detectedAt: new Date(),
        description: issue.description,
        expectedValue: issue.expectedValue ?? null,
        actualValue: issue.actualValue ?? null,
        jobRunId,
        updatedAt: new Date(),
      },
    });
    return { isNew: false, issueId: existing.id };
  }

  const created = await db.financialIntegrityIssue.create({
    data: {
      id: randomUUID(),
      organizationId,
      severity: issue.severity,
      category: issue.category,
      checkName: issue.checkName,
      entityType: issue.entityType,
      entityId: issue.entityId,
      description: issue.description,
      expectedValue: issue.expectedValue ?? null,
      actualValue: issue.actualValue ?? null,
      detectedAt: new Date(),
      jobRunId,
      status: "OPEN",
    },
    select: { id: true },
  });
  return { isNew: true, issueId: created.id };
}

// =============================================================================
// WRITE — resolve / acknowledge an issue
// =============================================================================

export async function updateIssueStatus(
  issueId: string,
  organizationId: string,
  newStatus: "RESOLVED" | "ACKNOWLEDGED" | "SUPPRESSED",
  resolvedBy: string,
  resolutionNotes?: string
): Promise<FinancialIntegrityIssue | null> {
  const db = await getDb();

  const now = new Date();
  const updated = await db.financialIntegrityIssue.update({
    where: { id: issueId, organizationId },
    data: {
      status: newStatus,
      resolvedAt: newStatus === "RESOLVED" ? now : undefined,
      resolvedBy,
      resolutionNotes: resolutionNotes ?? null,
      updatedAt: now,
    },
  });

  return mapRow(updated);
}

// =============================================================================
// READ
// =============================================================================

export async function findIntegrityIssueById(
  id: string,
  organizationId: string
): Promise<FinancialIntegrityIssue | null> {
  const db = await getDb();
  const row = await db.financialIntegrityIssue.findFirst({
    where: { id, organizationId },
  });
  return row ? mapRow(row) : null;
}

export async function listIntegrityIssues(
  params: ListIntegrityIssuesParams
): Promise<{ data: FinancialIntegrityIssue[]; total: number }> {
  const db = await getDb();
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 50;

  const statusFilter = params.status
    ? Array.isArray(params.status)
      ? { in: params.status }
      : { equals: params.status }
    : undefined;

  const severityFilter = params.severity
    ? Array.isArray(params.severity)
      ? { in: params.severity }
      : { equals: params.severity }
    : undefined;

  const where = {
    organizationId: params.organizationId,
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(severityFilter ? { severity: severityFilter } : {}),
    ...(params.category ? { category: params.category } : {}),
    ...(params.entityType ? { entityType: params.entityType } : {}),
    ...(params.jobRunId ? { jobRunId: params.jobRunId } : {}),
  };

  const [rows, total] = await Promise.all([
    db.financialIntegrityIssue.findMany({
      where,
      orderBy: [{ severity: "asc" }, { detectedAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.financialIntegrityIssue.count({ where }),
  ]);

  return { data: rows.map(mapRow), total };
}

export async function countOpenIssuesBySeverity(
  organizationId: string
): Promise<Record<string, number>> {
  const db = await getDb();
  const rows = await db.financialIntegrityIssue.groupBy({
    by: ["severity"],
    where: { organizationId, status: "OPEN" },
    _count: { id: true },
  });

  const result: Record<string, number> = {
    CRITICAL: 0,
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
  };
  for (const row of rows) {
    result[row.severity] = row._count.id;
  }
  return result;
}
