import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { listTaxRows } from "@/modules/reports/finance/repositories/tax.repository";
import type { TaxReportFilters, TaxSortBy } from "@/modules/reports/finance/types";

// Serves the paginated Tax Report table directly from the repository — the
// KPI/chart summary is fetched once per page load by the server component,
// not recomputed on every pagination click.

export async function GET(req: NextRequest) {
  try {
    const context = await requirePermission(PERMISSIONS.FINANCIAL_REPORTS_VIEW);
    const { searchParams } = req.nextUrl;

    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") ?? "20", 10)));

    const filters: TaxReportFilters = {
      organizationId: context.organizationId,
      page,
      pageSize,
      branchId: searchParams.get("branchId") ?? undefined,
      courseId: searchParams.get("courseId") ?? undefined,
      academicYearId: searchParams.get("academicYearId") ?? undefined,
      academicTermId: searchParams.get("academicTermId") ?? undefined,
      dateFrom: searchParams.get("dateFrom") ?? undefined,
      dateTo: searchParams.get("dateTo") ?? undefined,
      taxRuleId: searchParams.get("taxRuleId") ?? undefined,
      invoiceStatus: searchParams.get("invoiceStatus") ?? undefined,
      sortBy: (searchParams.get("sortBy") as TaxSortBy) ?? undefined,
      sortDir: (searchParams.get("sortDir") as "asc" | "desc") ?? undefined,
    };

    const { rows, total } = await listTaxRows(filters);

    await auditService.log(context, {
      entity: "FinancialReport",
      entityId: "taxes",
      action: "financial_report.viewed",
      newValues: {
        reportType: "taxes",
        filters: { branchId: filters.branchId, courseId: filters.courseId, taxRuleId: filters.taxRuleId, page, pageSize },
      },
    });

    return NextResponse.json({ rows, total, page, pageSize });
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
}
