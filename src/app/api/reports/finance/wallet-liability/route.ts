import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { listWalletLiabilityRows } from "@/modules/reports/finance/repositories/wallet-liability.repository";
import type { WalletLiabilityFilters, WalletLiabilitySortBy } from "@/modules/reports/finance/types";

// Serves the paginated Wallet Liability table directly from the repository —
// the KPI/watchlist/chart summary is fetched once per page load by the server
// component, not recomputed on every pagination click.

export async function GET(req: NextRequest) {
  try {
    const context = await requirePermission(PERMISSIONS.FINANCIAL_REPORTS_VIEW);
    const { searchParams } = req.nextUrl;

    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") ?? "20", 10)));

    const filters: WalletLiabilityFilters = {
      organizationId: context.organizationId,
      page,
      pageSize,
      branchId: searchParams.get("branchId") ?? undefined,
      courseId: searchParams.get("courseId") ?? undefined,
      studentId: searchParams.get("studentId") ?? undefined,
      dateFrom: searchParams.get("dateFrom") ?? undefined,
      dateTo: searchParams.get("dateTo") ?? undefined,
      minBalance: searchParams.get("minBalance") ? parseFloat(searchParams.get("minBalance")!) : undefined,
      dormantDays: searchParams.get("dormantDays") ? parseInt(searchParams.get("dormantDays")!, 10) : undefined,
      includeZeroBalances: searchParams.get("includeZeroBalances") === "true",
      includeNegativeBalances: searchParams.get("includeNegativeBalances") === "true",
      sortBy: (searchParams.get("sortBy") as WalletLiabilitySortBy) ?? undefined,
      sortDir: (searchParams.get("sortDir") as "asc" | "desc") ?? undefined,
    };

    const { rows, total } = await listWalletLiabilityRows(filters);

    await auditService.log(context, {
      entity: "FinancialReport",
      entityId: "wallet-liability",
      action: "financial_report.viewed",
      newValues: {
        reportType: "wallet-liability",
        filters: { branchId: filters.branchId, courseId: filters.courseId, studentId: filters.studentId, page, pageSize },
      },
    });

    return NextResponse.json({ rows, total, page, pageSize });
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
}
