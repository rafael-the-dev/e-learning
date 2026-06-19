import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { listReconciliationIssues } from "@/modules/reports/finance/repositories/reconciliation.repository";
import type { ReconciliationFilters, ReconciliationIssueType, ReconciliationSeverity } from "@/modules/reports/finance/types";

// Serves the paginated drill-down tables (Ledger vs Source / Missing / Duplicate /
// Orphan sections) directly from the repository — the KPI + Watchlist summary is
// fetched once per page load by the server component, not on every pagination click.

export async function GET(req: NextRequest) {
  try {
    const context = await requirePermission(PERMISSIONS.FINANCIAL_REPORTS_RECONCILIATION);
    const { searchParams } = req.nextUrl;

    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") ?? "20", 10)));
    const issueTypes = searchParams.getAll("issueTypes") as ReconciliationIssueType[];

    const filters: ReconciliationFilters = {
      organizationId: context.organizationId,
      page,
      pageSize,
      branchId: searchParams.get("branchId") ?? undefined,
      studentId: searchParams.get("studentId") ?? undefined,
      dateFrom: searchParams.get("dateFrom") ?? undefined,
      dateTo: searchParams.get("dateTo") ?? undefined,
      entityType: searchParams.get("entityType") ?? undefined,
      issueType: (searchParams.get("issueType") as ReconciliationIssueType) ?? undefined,
      issueTypes: issueTypes.length > 0 ? issueTypes : undefined,
      severity: (searchParams.get("severity") as ReconciliationSeverity) ?? undefined,
    };

    const { rows, total } = await listReconciliationIssues(filters);

    await auditService.log(context, {
      entity: "FinancialReport",
      entityId: "reconciliation",
      action: "financial_report.viewed",
      newValues: {
        reportType: "reconciliation",
        filters: { entityType: filters.entityType, issueType: filters.issueType, severity: filters.severity, page, pageSize },
      },
    });

    return NextResponse.json({ rows, total, page, pageSize });
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
}
