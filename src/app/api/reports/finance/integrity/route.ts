import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { getIntegrityReport } from "@/modules/reports/finance/services/financial-reports.service";
import type { IntegrityReportFilters } from "@/modules/reports/finance/types";

export async function GET(req: NextRequest) {
  try {
    const context = await requirePermission(PERMISSIONS.FINANCIAL_REPORTS_INTEGRITY);
    const { searchParams } = req.nextUrl;

    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") ?? "20", 10)));

    const filters: IntegrityReportFilters = {
      organizationId: context.organizationId,
      page,
      pageSize,
      severity: searchParams.get("severity") ?? undefined,
      category: searchParams.get("category") ?? undefined,
      entityType: searchParams.get("entityType") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      dateFrom: searchParams.get("dateFrom") ?? undefined,
      dateTo: searchParams.get("dateTo") ?? undefined,
    };

    const report = await getIntegrityReport(filters);

    await auditService.log(context, {
      entity: "FinancialReport",
      entityId: "integrity",
      action: "financial_report.viewed",
      newValues: { reportType: "integrity", filters: { severity: filters.severity, category: filters.category, page, pageSize } },
    });

    return NextResponse.json(report);
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
}
