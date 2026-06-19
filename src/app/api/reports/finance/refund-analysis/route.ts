import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { listRefundAnalysisRows } from "@/modules/reports/finance/repositories/refund-analysis.repository";
import type { RefundAnalysisFilters, RefundAnalysisSortBy } from "@/modules/reports/finance/types";

// Serves the paginated Refund Analysis table directly from the repository —
// the KPI/chart/watchlist summary is fetched once per page load by the
// server component, not recomputed on every pagination click.

export async function GET(req: NextRequest) {
  try {
    const context = await requirePermission(PERMISSIONS.FINANCIAL_REPORTS_VIEW);
    const { searchParams } = req.nextUrl;

    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") ?? "20", 10)));

    const filters: RefundAnalysisFilters = {
      organizationId: context.organizationId,
      page,
      pageSize,
      branchId: searchParams.get("branchId") ?? undefined,
      courseId: searchParams.get("courseId") ?? undefined,
      studentId: searchParams.get("studentId") ?? undefined,
      academicYearId: searchParams.get("academicYearId") ?? undefined,
      academicTermId: searchParams.get("academicTermId") ?? undefined,
      dateFrom: searchParams.get("dateFrom") ?? undefined,
      dateTo: searchParams.get("dateTo") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      minAmount: searchParams.get("minAmount") ? parseFloat(searchParams.get("minAmount")!) : undefined,
      sortBy: (searchParams.get("sortBy") as RefundAnalysisSortBy) ?? undefined,
      sortDir: (searchParams.get("sortDir") as "asc" | "desc") ?? undefined,
    };

    const { rows, total } = await listRefundAnalysisRows(filters);

    await auditService.log(context, {
      entity: "FinancialReport",
      entityId: "refund-analysis",
      action: "financial_report.viewed",
      newValues: {
        reportType: "refund-analysis",
        filters: { branchId: filters.branchId, courseId: filters.courseId, status: filters.status, page, pageSize },
      },
    });

    return NextResponse.json({ rows, total, page, pageSize });
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
}
