import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { listDiscountRows } from "@/modules/reports/finance/repositories/discount.repository";
import type { DiscountReportFilters, DiscountSortBy } from "@/modules/reports/finance/types";

// Serves the paginated Discount Report table directly from the repository —
// the KPI/chart/watchlist summary is fetched once per page load by the
// server component, not recomputed on every pagination click.

export async function GET(req: NextRequest) {
  try {
    const context = await requirePermission(PERMISSIONS.FINANCIAL_REPORTS_VIEW);
    const { searchParams } = req.nextUrl;

    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") ?? "20", 10)));

    const filters: DiscountReportFilters = {
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
      discountRuleId: searchParams.get("discountRuleId") ?? undefined,
      discountType: searchParams.get("discountType") ?? undefined,
      invoiceStatus: searchParams.get("invoiceStatus") ?? undefined,
      appliedBy: searchParams.get("appliedBy") ?? undefined,
      minDiscountAmount: searchParams.get("minDiscountAmount") ? parseFloat(searchParams.get("minDiscountAmount")!) : undefined,
      sortBy: (searchParams.get("sortBy") as DiscountSortBy) ?? undefined,
      sortDir: (searchParams.get("sortDir") as "asc" | "desc") ?? undefined,
    };

    const { rows, total } = await listDiscountRows(filters);

    await auditService.log(context, {
      entity: "FinancialReport",
      entityId: "discounts",
      action: "financial_report.viewed",
      newValues: {
        reportType: "discounts",
        filters: { branchId: filters.branchId, courseId: filters.courseId, discountRuleId: filters.discountRuleId, page, pageSize },
      },
    });

    return NextResponse.json({ rows, total, page, pageSize });
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
}
