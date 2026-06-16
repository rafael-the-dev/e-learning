import { getDb } from "@/server/db";
import type { IntegrityReportFilters, IntegrityReportKPIs, IntegrityReportRow } from "../types";

export async function getIntegrityReportKPIs(
  organizationId: string
): Promise<IntegrityReportKPIs> {
  const db = await getDb();

  const [bySeverity, totalResolved] = await Promise.all([
    db.financialIntegrityIssue.groupBy({
      by: ["severity"],
      where: { organizationId, status: "OPEN" },
      _count: { id: true },
    }),
    db.financialIntegrityIssue.count({
      where: { organizationId, status: "RESOLVED" },
    }),
  ]);

  const counts: Record<string, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const row of bySeverity) counts[row.severity] = row._count.id;

  return {
    openCritical: counts.CRITICAL,
    openHigh: counts.HIGH,
    openMedium: counts.MEDIUM,
    openLow: counts.LOW,
    totalOpen: counts.CRITICAL + counts.HIGH + counts.MEDIUM + counts.LOW,
    totalResolved,
  };
}

function buildIntegrityWhere(filters: IntegrityReportFilters) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { organizationId: filters.organizationId };

  if (filters.severity) where.severity = filters.severity;
  if (filters.category) where.category = filters.category;
  if (filters.entityType) where.entityType = filters.entityType;

  if (filters.status) {
    where.status = filters.status;
  } else {
    // Default: show open and acknowledged (not resolved/suppressed noise)
    where.status = { in: ["OPEN", "ACKNOWLEDGED"] };
  }

  if (filters.dateFrom || filters.dateTo) {
    where.detectedAt = {};
    if (filters.dateFrom) where.detectedAt.gte = new Date(filters.dateFrom);
    if (filters.dateTo) {
      const end = new Date(filters.dateTo);
      end.setHours(23, 59, 59, 999);
      where.detectedAt.lte = end;
    }
  }

  return where;
}

export async function listIntegrityIssuesForReport(
  filters: IntegrityReportFilters
): Promise<{ rows: IntegrityReportRow[]; total: number }> {
  const db = await getDb();
  const where = buildIntegrityWhere(filters);
  const skip = (filters.page - 1) * filters.pageSize;

  const [rawRows, total] = await Promise.all([
    db.financialIntegrityIssue.findMany({
      where,
      orderBy: [{ severity: "asc" }, { detectedAt: "desc" }],
      skip,
      take: filters.pageSize,
      select: {
        id: true,
        severity: true,
        category: true,
        checkName: true,
        entityType: true,
        entityId: true,
        description: true,
        expectedValue: true,
        actualValue: true,
        detectedAt: true,
        status: true,
        resolvedAt: true,
        resolvedBy: true,
        resolutionNotes: true,
      },
    }),
    db.financialIntegrityIssue.count({ where }),
  ]);

  return { rows: rawRows, total };
}
