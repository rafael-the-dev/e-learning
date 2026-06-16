import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { getCashFlowReport } from "@/modules/reports/finance/services/financial-reports.service";
import type { CashFlowFilters } from "@/modules/reports/finance/types";

export async function GET(req: NextRequest) {
  try {
    const context = await requirePermission(PERMISSIONS.FINANCIAL_REPORTS_VIEW);
    const { searchParams } = req.nextUrl;

    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") ?? "20", 10)));

    const filters: CashFlowFilters & { page: number; pageSize: number } = {
      organizationId: context.organizationId,
      page,
      pageSize,
      branchId: searchParams.get("branchId") ?? undefined,
      studentId: searchParams.get("studentId") ?? undefined,
      dateFrom: searchParams.get("dateFrom") ?? undefined,
      dateTo: searchParams.get("dateTo") ?? undefined,
    };

    const report = await getCashFlowReport(filters);

    await auditService.log(context, {
      entity: "FinancialReport",
      entityId: "cash-flow",
      action: "financial_report.viewed",
      newValues: { reportType: "cash-flow", filters: { dateFrom: filters.dateFrom, dateTo: filters.dateTo, page, pageSize } },
    });

    return NextResponse.json(report);
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
}
