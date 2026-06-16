import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { getWalletActivityReport } from "@/modules/reports/finance/services/financial-reports.service";
import type { WalletActivityFilters } from "@/modules/reports/finance/types";

export async function GET(req: NextRequest) {
  try {
    const context = await requirePermission(PERMISSIONS.FINANCIAL_REPORTS_VIEW);
    const { searchParams } = req.nextUrl;

    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") ?? "20", 10)));
    const minBalanceRaw = searchParams.get("minBalance");

    const filters: WalletActivityFilters = {
      organizationId: context.organizationId,
      studentId: searchParams.get("studentId") ?? undefined,
      branchId: searchParams.get("branchId") ?? undefined,
      transactionType: searchParams.get("transactionType") ?? undefined,
      dateFrom: searchParams.get("dateFrom") ?? undefined,
      dateTo: searchParams.get("dateTo") ?? undefined,
      minBalance: minBalanceRaw ? parseFloat(minBalanceRaw) : undefined,
      search: searchParams.get("search") ?? undefined,
      page,
      pageSize,
    };

    const report = await getWalletActivityReport(filters);

    await auditService.log(context, {
      entity: "FinancialReport",
      entityId: "wallets",
      action: "financial_report.viewed",
      newValues: { reportType: "wallets" },
    });

    return NextResponse.json(report);
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
}
