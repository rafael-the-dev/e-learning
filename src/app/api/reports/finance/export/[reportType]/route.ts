import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { listAccountsReceivable } from "@/modules/reports/finance/repositories/accounts-receivable.repository";
import { listAgingRows } from "@/modules/reports/finance/repositories/aging.repository";
import { listPaymentsReport } from "@/modules/reports/finance/repositories/payments-report.repository";
import { listRefundsReport } from "@/modules/reports/finance/repositories/refunds-report.repository";
import { listStudentDebtRows } from "@/modules/reports/finance/repositories/student-debt.repository";
import { listCollectionsRows } from "@/modules/reports/finance/repositories/collections.repository";
import { getBranchRevenueReport } from "@/modules/reports/finance/repositories/branch-revenue.repository";
import { listWalletActivityRows } from "@/modules/reports/finance/repositories/wallet-activity.repository";
import { getCourseRevenueReport } from "@/modules/reports/finance/repositories/course-revenue.repository";
import { getStudentLedger } from "@/modules/reports/finance/repositories/student-statement.repository";
import { listIntegrityIssuesForReport } from "@/modules/reports/finance/repositories/integrity-report.repository";
import { listReconciliationIssues } from "@/modules/reports/finance/repositories/reconciliation.repository";
import {
  listWalletLiabilityRows,
  getWalletLiabilityKPIs,
  getWalletLiabilityWatchlist,
} from "@/modules/reports/finance/repositories/wallet-liability.repository";
import { listTaxRows } from "@/modules/reports/finance/repositories/tax.repository";
import {
  listDiscountRows,
  getDiscountKPIs,
  getDiscountWatchlist,
} from "@/modules/reports/finance/repositories/discount.repository";
import {
  listRefundAnalysisRows,
  getRefundAnalysisKPIs,
  getRefundWatchlist,
} from "@/modules/reports/finance/repositories/refund-analysis.repository";
import {
  getFinancialClosingReport,
  getRevenueTrendReport,
  getPaymentMethodMixReport,
} from "@/modules/reports/finance/services/financial-reports.service";
import { buildCsvRow, formatCsvDate, formatCsvAmount } from "@/modules/reports/finance/utils/csv-export";
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  REFUND_METHOD_LABELS,
  REFUND_STATUS_LABELS,
  INVOICE_STATUS_LABELS,
  INSTALLMENT_STATUS_LABELS,
  WALLET_TRANSACTION_TYPE_LABELS,
  INTEGRITY_SEVERITY_LABELS,
} from "@/modules/finance/types";
import { DISCOUNT_TYPE_LABELS } from "@/modules/billing/types";
import {
  AGING_BUCKET_LABELS,
  RECONCILIATION_ISSUE_LABELS,
  TRUST_SCORE_RATING_LABELS,
  TRUST_SCORE_DEDUCTION_LABELS,
  CLOSING_WATCHLIST_CATEGORY_LABELS,
  DISCOUNT_WATCHLIST_ACTION_LABELS,
  REFUND_WATCHLIST_ACTION_LABELS,
} from "@/modules/reports/finance/types";
import type {
  AccountsReceivableFilters,
  AgingFilters,
  PaymentsReportFilters,
  RefundsReportFilters,
  StudentDebtFilters,
  CollectionsFilters,
  BranchRevenueFilters,
  WalletActivityFilters,
  CourseRevenueFilters,
  IntegrityReportFilters,
  StudentStatementFilters,
  ReconciliationFilters,
  ReconciliationIssueType,
  ReconciliationSeverity,
  ClosingFilters,
  RevenueTrendFilters,
  WalletLiabilityFilters,
  WalletLiabilitySortBy,
  TaxReportFilters,
  TaxSortBy,
  DiscountReportFilters,
  DiscountSortBy,
  PaymentMethodMixFilters,
  RefundAnalysisFilters,
  RefundAnalysisSortBy,
} from "@/modules/reports/finance/types";

const BATCH_SIZE = 500;
const MAX_EXPORT_ROWS = 5000;

const enc = new TextEncoder();

function csvLine(values: unknown[]): Uint8Array {
  return enc.encode(buildCsvRow(values) + "\r\n");
}

type CsvRow = unknown[];
type PageResult = { csvRows: CsvRow[]; total: number; auditMeta?: Record<string, unknown> };
type BatchFn = (page: number, pageSize: number) => Promise<PageResult>;

type ExportConfig = {
  headers: string[];
  filename: string;
  fetchBatch: BatchFn;
};

function buildStream(
  config: ExportConfig,
  firstResult: PageResult,
): ReadableStream<Uint8Array> {
  const { headers, fetchBatch } = config;
  const firstRows = firstResult.csvRows;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(csvLine(headers));

        let rowsEmitted = 0;
        let lastBatchLen = firstRows.length;

        for (const row of firstRows) {
          if (rowsEmitted >= MAX_EXPORT_ROWS) break;
          controller.enqueue(csvLine(row));
          rowsEmitted++;
        }

        let page = 2;
        while (rowsEmitted < MAX_EXPORT_ROWS && lastBatchLen >= BATCH_SIZE) {
          const { csvRows } = await fetchBatch(page, BATCH_SIZE);
          lastBatchLen = csvRows.length;
          for (const row of csvRows) {
            if (rowsEmitted >= MAX_EXPORT_ROWS) break;
            controller.enqueue(csvLine(row));
            rowsEmitted++;
          }
          page++;
        }

        controller.close();
      } catch (err) {
        console.error("[export] stream error:", err);
        controller.error(err);
      }
    },
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ reportType: string }> }
) {
  let context: Awaited<ReturnType<typeof requirePermission>>;
  try {
    context = await requirePermission(PERMISSIONS.FINANCIAL_REPORTS_EXPORT);
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const { reportType } = await params;
  const orgId = context.organizationId;

  // ── Per-report config ───────────────────────────────────────────────────────

  let exportConfig: ExportConfig | null = null;

  if (reportType === "accounts-receivable") {
    const filters: AccountsReceivableFilters = {
      organizationId: orgId,
      branchId: searchParams.get("branchId") ?? undefined,
      courseId: searchParams.get("courseId") ?? undefined,
      studentId: searchParams.get("studentId") ?? undefined,
      academicYearId: searchParams.get("academicYearId") ?? undefined,
      academicTermId: searchParams.get("academicTermId") ?? undefined,
      classGroupId: searchParams.get("classGroupId") ?? undefined,
      dateFrom: searchParams.get("dateFrom") ?? undefined,
      dateTo: searchParams.get("dateTo") ?? undefined,
      dueDateFrom: searchParams.get("dueDateFrom") ?? undefined,
      dueDateTo: searchParams.get("dueDateTo") ?? undefined,
      invoiceStatus: searchParams.get("invoiceStatus") ?? undefined,
      agingBucket: (searchParams.get("agingBucket") as AccountsReceivableFilters["agingBucket"]) ?? undefined,
      search: searchParams.get("search") ?? undefined,
      page: 1,
      pageSize: BATCH_SIZE,
    };
    exportConfig = {
      headers: [
        "Nº Fatura", "Aluno", "Matrícula", "Curso", "Filial",
        "Data de Emissão", "Data de Vencimento", "Total", "Pago", "Saldo",
        "Estado", "Dias em Atraso", "Escalão de Atraso",
      ],
      filename: "contas-a-receber.csv",
      fetchBatch: async (page, pageSize) => {
        const { rows, total } = await listAccountsReceivable({ ...filters, page, pageSize });
        return {
          csvRows: rows.map((r) => [
            r.invoiceNumber,
            r.studentName ?? "",
            r.enrollmentNumber ?? "",
            r.courseName ?? "",
            r.branchName ?? "",
            formatCsvDate(r.issueDate),
            formatCsvDate(r.dueDate),
            formatCsvAmount(r.totalAmount),
            formatCsvAmount(r.paidAmount),
            formatCsvAmount(r.balanceAmount),
            INVOICE_STATUS_LABELS[r.status] ?? r.status,
            r.daysOverdue,
            AGING_BUCKET_LABELS[r.agingBucket] ?? r.agingBucket,
          ]),
          total,
        };
      },
    };

  } else if (reportType === "aging") {
    const filters: AgingFilters = {
      organizationId: orgId,
      branchId: searchParams.get("branchId") ?? undefined,
      courseId: searchParams.get("courseId") ?? undefined,
      studentId: searchParams.get("studentId") ?? undefined,
      academicYearId: searchParams.get("academicYearId") ?? undefined,
      academicTermId: searchParams.get("academicTermId") ?? undefined,
      classGroupId: searchParams.get("classGroupId") ?? undefined,
      dateFrom: searchParams.get("dateFrom") ?? undefined,
      dateTo: searchParams.get("dateTo") ?? undefined,
      agingBucket: (searchParams.get("agingBucket") as AgingFilters["agingBucket"]) ?? undefined,
      search: searchParams.get("search") ?? undefined,
      page: 1,
      pageSize: BATCH_SIZE,
    };
    exportConfig = {
      headers: [
        "Nº Fatura", "Aluno", "Curso", "Filial",
        "Data de Vencimento", "Saldo", "Dias em Atraso", "Escalão",
      ],
      filename: "analise-aging.csv",
      fetchBatch: async (page, pageSize) => {
        const { rows, total } = await listAgingRows({ ...filters, page, pageSize });
        return {
          csvRows: rows.map((r) => [
            r.invoiceNumber,
            r.studentName ?? "",
            r.courseName ?? "",
            r.branchName ?? "",
            formatCsvDate(r.dueDate),
            formatCsvAmount(r.balanceAmount),
            r.daysOverdue,
            AGING_BUCKET_LABELS[r.agingBucket] ?? r.agingBucket,
          ]),
          total,
        };
      },
    };

  } else if (reportType === "payments") {
    const filters: PaymentsReportFilters = {
      organizationId: orgId,
      branchId: searchParams.get("branchId") ?? undefined,
      studentId: searchParams.get("studentId") ?? undefined,
      dateFrom: searchParams.get("dateFrom") ?? undefined,
      dateTo: searchParams.get("dateTo") ?? undefined,
      paymentMethod: searchParams.get("paymentMethod") ?? undefined,
      search: searchParams.get("search") ?? undefined,
      page: 1,
      pageSize: BATCH_SIZE,
    };
    exportConfig = {
      headers: [
        "Nº Pagamento", "Aluno", "Nº Fatura", "Filial",
        "Valor Bruto", "Reembolsado", "Valor Líquido",
        "Métodos", "Estado", "Data Pagamento", "Criado Por",
      ],
      filename: "relatorio-pagamentos.csv",
      fetchBatch: async (page, pageSize) => {
        const { rows, total } = await listPaymentsReport({ ...filters, page, pageSize });
        return {
          csvRows: rows.map((r) => [
            r.paymentNumber,
            r.studentName ?? "",
            r.invoiceNumber ?? "",
            r.branchName ?? "",
            formatCsvAmount(r.totalAmount),
            formatCsvAmount(r.refundedAmount),
            formatCsvAmount(r.netAmount),
            r.paymentMethods.map((m) => PAYMENT_METHOD_LABELS[m] ?? m).join("; "),
            PAYMENT_STATUS_LABELS[r.status] ?? r.status,
            formatCsvDate(r.paymentDate),
            r.createdBy ?? "",
          ]),
          total,
        };
      },
    };

  } else if (reportType === "refunds") {
    const filters: RefundsReportFilters = {
      organizationId: orgId,
      branchId: searchParams.get("branchId") ?? undefined,
      studentId: searchParams.get("studentId") ?? undefined,
      dateFrom: searchParams.get("dateFrom") ?? undefined,
      dateTo: searchParams.get("dateTo") ?? undefined,
      refundMethod: searchParams.get("refundMethod") ?? undefined,
      refundStatus: searchParams.get("refundStatus") ?? undefined,
      search: searchParams.get("search") ?? undefined,
      page: 1,
      pageSize: BATCH_SIZE,
    };
    exportConfig = {
      headers: [
        "Nº Reembolso", "Aluno", "Nº Pagamento", "Nº Recibo",
        "Valor", "Método", "Estado", "Motivo",
        "Solicitado Em", "Concluído Em", "Filial", "Aprovado Por",
      ],
      filename: "relatorio-reembolsos.csv",
      fetchBatch: async (page, pageSize) => {
        const { rows, total } = await listRefundsReport({ ...filters, page, pageSize });
        return {
          csvRows: rows.map((r) => [
            r.refundNumber,
            r.studentName ?? "",
            r.paymentNumber ?? "",
            r.receiptNumber ?? "",
            formatCsvAmount(r.amount),
            REFUND_METHOD_LABELS[r.refundMethod] ?? r.refundMethod,
            REFUND_STATUS_LABELS[r.status] ?? r.status,
            r.reason ?? "",
            formatCsvDate(r.requestedAt),
            formatCsvDate(r.completedAt),
            r.branchName ?? "",
            r.approvedBy ?? "",
          ]),
          total,
        };
      },
    };

  } else if (reportType === "student-debt") {
    const filters: StudentDebtFilters = {
      organizationId: orgId,
      branchId: searchParams.get("branchId") ?? undefined,
      courseId: searchParams.get("courseId") ?? undefined,
      studentId: searchParams.get("studentId") ?? undefined,
      academicYearId: searchParams.get("academicYearId") ?? undefined,
      academicTermId: searchParams.get("academicTermId") ?? undefined,
      classGroupId: searchParams.get("classGroupId") ?? undefined,
      dateFrom: searchParams.get("dateFrom") ?? undefined,
      dateTo: searchParams.get("dateTo") ?? undefined,
      dueDateFrom: searchParams.get("dueDateFrom") ?? undefined,
      dueDateTo: searchParams.get("dueDateTo") ?? undefined,
      overdueOnly: searchParams.get("overdueOnly") === "true",
      minBalance: searchParams.get("minBalance") ? parseFloat(searchParams.get("minBalance")!) : undefined,
      search: searchParams.get("search") ?? undefined,
      page: 1,
      pageSize: BATCH_SIZE,
    };
    exportConfig = {
      headers: [
        "Aluno", "Código", "Cursos", "Filiais",
        "Total Faturado", "Total Pago", "Saldo em Aberto",
        "Saldo Vencido", "Nº Faturas", "Dias Máx. em Atraso",
      ],
      filename: "relatorio-divida-alunos.csv",
      fetchBatch: async (page, pageSize) => {
        const { rows, total } = await listStudentDebtRows({ ...filters, page, pageSize });
        return {
          csvRows: rows.map((r) => [
            r.studentName,
            r.studentCode ?? "",
            r.courseNames.join("; "),
            r.branchNames.join("; "),
            formatCsvAmount(r.totalInvoiced),
            formatCsvAmount(r.totalPaid),
            formatCsvAmount(r.outstandingBalance),
            formatCsvAmount(r.overdueBalance),
            r.invoiceCount,
            r.longestOverdueDays,
          ]),
          total,
        };
      },
    };

  } else if (reportType === "collections") {
    const filters: CollectionsFilters = {
      organizationId: orgId,
      branchId: searchParams.get("branchId") ?? undefined,
      courseId: searchParams.get("courseId") ?? undefined,
      studentId: searchParams.get("studentId") ?? undefined,
      academicYearId: searchParams.get("academicYearId") ?? undefined,
      academicTermId: searchParams.get("academicTermId") ?? undefined,
      classGroupId: searchParams.get("classGroupId") ?? undefined,
      dateFrom: searchParams.get("dateFrom") ?? undefined,
      dateTo: searchParams.get("dateTo") ?? undefined,
      dueDateFrom: searchParams.get("dueDateFrom") ?? undefined,
      dueDateTo: searchParams.get("dueDateTo") ?? undefined,
      installmentStatus: searchParams.get("installmentStatus") ?? undefined,
      minDaysOverdue: searchParams.get("minDaysOverdue") ? parseInt(searchParams.get("minDaysOverdue")!, 10) : undefined,
      maxDaysOverdue: searchParams.get("maxDaysOverdue") ? parseInt(searchParams.get("maxDaysOverdue")!, 10) : undefined,
      search: searchParams.get("search") ?? undefined,
      page: 1,
      pageSize: BATCH_SIZE,
    };
    exportConfig = {
      headers: [
        "Aluno", "Curso", "Filial", "Nº Fatura",
        "Plano de Pagamento", "Nº Prestação", "Data Vencimento",
        "Valor", "Pago", "Saldo", "Dias em Atraso", "Estado",
      ],
      filename: "relatorio-cobrancas.csv",
      fetchBatch: async (page, pageSize) => {
        const { rows, total } = await listCollectionsRows({ ...filters, page, pageSize });
        return {
          csvRows: rows.map((r) => [
            r.studentName ?? "",
            r.courseName ?? "",
            r.branchName ?? "",
            r.invoiceNumber,
            r.paymentPlanName,
            r.installmentNumber,
            formatCsvDate(r.dueDate),
            formatCsvAmount(r.amount),
            formatCsvAmount(r.paidAmount),
            formatCsvAmount(r.balanceAmount),
            r.daysOverdue,
            INSTALLMENT_STATUS_LABELS[r.status] ?? r.status,
          ]),
          total,
        };
      },
    };

  } else if (reportType === "branch-revenue") {
    const filters: BranchRevenueFilters = {
      organizationId: orgId,
      branchId: searchParams.get("branchId") ?? undefined,
      academicYearId: searchParams.get("academicYearId") ?? undefined,
      academicTermId: searchParams.get("academicTermId") ?? undefined,
      dateFrom: searchParams.get("dateFrom") ?? undefined,
      dateTo: searchParams.get("dateTo") ?? undefined,
    };
    exportConfig = {
      headers: [
        "Filial", "Total Faturado", "Total Cobrado", "Saldo em Aberto",
        "Saldo Vencido", "Taxa de Cobrança (%)", "Pagamentos", "Alunos",
      ],
      filename: "receita-por-filial.csv",
      fetchBatch: async (page) => {
        if (page > 1) return { csvRows: [], total: 0 };
        const { rows } = await getBranchRevenueReport(filters);
        return {
          csvRows: rows.map((r) => [
            r.branchName,
            formatCsvAmount(r.totalInvoiced),
            formatCsvAmount(r.totalCollected),
            formatCsvAmount(r.outstandingBalance),
            formatCsvAmount(r.overdueBalance),
            r.collectionRate.toFixed(1),
            r.paymentCount,
            r.studentCount,
          ]),
          total: rows.length,
        };
      },
    };

  } else if (reportType === "wallets") {
    const filters: WalletActivityFilters = {
      organizationId: orgId,
      branchId: searchParams.get("branchId") ?? undefined,
      studentId: searchParams.get("studentId") ?? undefined,
      transactionType: searchParams.get("transactionType") ?? undefined,
      dateFrom: searchParams.get("dateFrom") ?? undefined,
      dateTo: searchParams.get("dateTo") ?? undefined,
      minBalance: searchParams.get("minBalance") ? parseFloat(searchParams.get("minBalance")!) : undefined,
      search: searchParams.get("search") ?? undefined,
      page: 1,
      pageSize: BATCH_SIZE,
    };
    exportConfig = {
      headers: [
        "Aluno", "Código", "Saldo Actual", "Total Créditos", "Total Débitos",
        "Nº Transacções", "Última Transacção", "Último Tipo",
      ],
      filename: "extrato-carteiras.csv",
      fetchBatch: async (page, pageSize) => {
        const { rows, total } = await listWalletActivityRows({ ...filters, page, pageSize });
        return {
          csvRows: rows.map((r) => [
            r.studentName,
            r.studentCode ?? "",
            formatCsvAmount(r.currentBalance),
            formatCsvAmount(r.totalCredits),
            formatCsvAmount(r.totalDebits),
            r.transactionCount,
            formatCsvDate(r.lastTransactionDate),
            WALLET_TRANSACTION_TYPE_LABELS[r.lastTransactionType ?? ""] ?? (r.lastTransactionType ?? ""),
          ]),
          total,
        };
      },
    };

  } else if (reportType === "course-revenue") {
    const filters: CourseRevenueFilters = {
      organizationId: orgId,
      branchId: searchParams.get("branchId") ?? undefined,
      courseId: searchParams.get("courseId") ?? undefined,
      academicYearId: searchParams.get("academicYearId") ?? undefined,
      academicTermId: searchParams.get("academicTermId") ?? undefined,
      dateFrom: searchParams.get("dateFrom") ?? undefined,
      dateTo: searchParams.get("dateTo") ?? undefined,
    };
    exportConfig = {
      headers: [
        "Curso", "Matrículas Activas", "Total Faturado", "Total Cobrado",
        "Saldo em Aberto", "Saldo Vencido", "Taxa de Cobrança (%)", "Valor Médio",
      ],
      filename: "receita-por-curso.csv",
      fetchBatch: async (page) => {
        if (page > 1) return { csvRows: [], total: 0 };
        const { rows } = await getCourseRevenueReport(filters);
        return {
          csvRows: rows.map((r) => [
            r.courseName,
            r.activeEnrollments,
            formatCsvAmount(r.totalInvoiced),
            formatCsvAmount(r.totalCollected),
            formatCsvAmount(r.outstandingBalance),
            formatCsvAmount(r.overdueBalance),
            r.collectionRate.toFixed(1),
            formatCsvAmount(r.averageInvoiceValue),
          ]),
          total: rows.length,
        };
      },
    };

  } else if (reportType === "student-statement") {
    const studentId = searchParams.get("studentId");
    if (!studentId) {
      return NextResponse.json(
        { error: "studentId é obrigatório para o extrato de aluno" },
        { status: 400 }
      );
    }
    const filters: StudentStatementFilters = {
      organizationId: orgId,
      studentId,
      dateFrom: searchParams.get("dateFrom") ?? undefined,
      dateTo: searchParams.get("dateTo") ?? undefined,
    };
    exportConfig = {
      headers: [
        "Data", "Tipo de Transacção", "Direcção", "Valor", "Descrição", "Nº Referência",
      ],
      filename: "extrato-financeiro-aluno.csv",
      fetchBatch: async (page) => {
        if (page > 1) return { csvRows: [], total: 0 };
        const entries = await getStudentLedger(filters);
        return {
          csvRows: entries.slice(0, MAX_EXPORT_ROWS).map((e) => [
            formatCsvDate(e.occurredAt),
            e.transactionType,
            e.direction,
            formatCsvAmount(e.amount),
            e.description ?? "",
            e.referenceNumber ?? "",
          ]),
          total: entries.length,
        };
      },
    };

  } else if (reportType === "integrity") {
    const filters: IntegrityReportFilters = {
      organizationId: orgId,
      severity: searchParams.get("severity") ?? undefined,
      category: searchParams.get("category") ?? undefined,
      entityType: searchParams.get("entityType") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      dateFrom: searchParams.get("dateFrom") ?? undefined,
      dateTo: searchParams.get("dateTo") ?? undefined,
      page: 1,
      pageSize: BATCH_SIZE,
    };
    exportConfig = {
      headers: [
        "Gravidade", "Categoria", "Verificação", "Tipo de Entidade", "ID Entidade",
        "Descrição", "Valor Esperado", "Valor Real",
        "Detectado Em", "Estado", "Resolvido Em", "Resolvido Por", "Notas de Resolução",
      ],
      filename: "relatorio-integridade.csv",
      fetchBatch: async (page, pageSize) => {
        const { rows, total } = await listIntegrityIssuesForReport({ ...filters, page, pageSize });
        return {
          csvRows: rows.map((r) => [
            r.severity,
            r.category,
            r.checkName,
            r.entityType,
            r.entityId,
            r.description,
            r.expectedValue ?? "",
            r.actualValue ?? "",
            formatCsvDate(r.detectedAt),
            r.status,
            formatCsvDate(r.resolvedAt),
            r.resolvedBy ?? "",
            r.resolutionNotes ?? "",
          ]),
          total,
        };
      },
    };

  } else if (reportType === "reconciliation") {
    const issueTypes = searchParams.getAll("issueTypes") as ReconciliationIssueType[];
    const filters: ReconciliationFilters = {
      organizationId: orgId,
      branchId: searchParams.get("branchId") ?? undefined,
      studentId: searchParams.get("studentId") ?? undefined,
      dateFrom: searchParams.get("dateFrom") ?? undefined,
      dateTo: searchParams.get("dateTo") ?? undefined,
      entityType: searchParams.get("entityType") ?? undefined,
      issueType: (searchParams.get("issueType") as ReconciliationIssueType) ?? undefined,
      issueTypes: issueTypes.length > 0 ? issueTypes : undefined,
      severity: (searchParams.get("severity") as ReconciliationSeverity) ?? undefined,
      page: 1,
      pageSize: BATCH_SIZE,
    };
    exportConfig = {
      headers: [
        "Severidade", "Tipo de Entidade", "Referência da Entidade", "Esperado", "Real",
        "Diferença", "Problema", "Data do Evento", "Detectado Em",
      ],
      filename: "relatorio-reconciliacao.csv",
      fetchBatch: async (page, pageSize) => {
        const { rows, total } = await listReconciliationIssues({ ...filters, page, pageSize });
        return {
          csvRows: rows.map((r) => [
            INTEGRITY_SEVERITY_LABELS[r.severity] ?? r.severity,
            r.entityType,
            r.entityReference,
            formatCsvAmount(r.expectedAmount),
            formatCsvAmount(r.actualAmount),
            formatCsvAmount(r.difference),
            RECONCILIATION_ISSUE_LABELS[r.issueType] ?? r.issueType,
            formatCsvDate(r.occurredAt),
            formatCsvDate(r.detectedAt),
          ]),
          total,
        };
      },
    };

  } else if (reportType === "closing") {
    const filters: ClosingFilters = {
      organizationId: orgId,
      branchId: searchParams.get("branchId") ?? undefined,
      academicYearId: searchParams.get("academicYearId") ?? undefined,
      academicTermId: searchParams.get("academicTermId") ?? undefined,
      dateFrom: searchParams.get("dateFrom") ?? undefined,
      dateTo: searchParams.get("dateTo") ?? undefined,
    };
    exportConfig = {
      headers: ["Secção", "Métrica", "Valor"],
      filename: "fecho-financeiro.csv",
      // Executive summary only — KPIs, trust score, watchlist, control summary.
      // Never streams raw ledgers/invoices/payments, so a single batch is enough.
      fetchBatch: async (page) => {
        if (page > 1) return { csvRows: [], total: 0 };

        const report = await getFinancialClosingReport(filters);
        const { kpis, trustScore, watchlist, controlSummary, reconciliationSummary } = report;

        const csvRows: CsvRow[] = [
          ["KPIs", "Total Faturado", formatCsvAmount(kpis.grossInvoiced)],
          ["KPIs", "Total Cobrado", formatCsvAmount(kpis.grossCollected)],
          ["KPIs", "Posição de Caixa Líquida", formatCsvAmount(kpis.netCashPosition)],
          ["KPIs", "Recebíveis em Aberto", formatCsvAmount(kpis.outstandingReceivables)],
          ["KPIs", "Recebíveis Vencidos", formatCsvAmount(kpis.overdueReceivables)],
          ["KPIs", "Passivo de Carteiras", formatCsvAmount(kpis.walletLiability)],
          ["KPIs", "Exposição a Reembolsos", formatCsvAmount(kpis.refundExposure)],
          ["KPIs", "Problemas Críticos", kpis.criticalFinancialIssues],

          ["Índice de Confiança", "Pontuação", trustScore.score],
          ["Índice de Confiança", "Classificação", TRUST_SCORE_RATING_LABELS[trustScore.rating]],
          ...trustScore.deductions.map((d): CsvRow => [
            "Índice de Confiança",
            TRUST_SCORE_DEDUCTION_LABELS[d.reason],
            `-${d.points}`,
          ]),

          ["Resumo de Controlo", "Integridade — Crítico", controlSummary.integrity.openCritical],
          ["Resumo de Controlo", "Integridade — Alto", controlSummary.integrity.openHigh],
          ["Resumo de Controlo", "Integridade — Médio", controlSummary.integrity.openMedium],
          ["Resumo de Controlo", "Integridade — Baixo", controlSummary.integrity.openLow],
          ["Resumo de Controlo", "Reconciliados", controlSummary.reconciliation.reconciled],
          ["Resumo de Controlo", "Não Reconciliados", controlSummary.reconciliation.unreconciled],
          ["Resumo de Controlo", "Recebíveis em Aberto", formatCsvAmount(controlSummary.receivables.outstanding)],
          ["Resumo de Controlo", "Recebíveis Vencidos", formatCsvAmount(controlSummary.receivables.overdue)],
          ["Resumo de Controlo", "Recebíveis a Vencer em Breve", formatCsvAmount(controlSummary.receivables.dueSoon)],
          ["Resumo de Controlo", "Reembolsos Solicitados", controlSummary.refunds.requestedCount],
          ["Resumo de Controlo", "Reembolsos Aprovados", controlSummary.refunds.approvedCount],
          ["Resumo de Controlo", "Reembolsos Concluídos no Período", controlSummary.refunds.completedThisPeriodCount],
          ["Resumo de Controlo", "Valor Reembolsado no Período", formatCsvAmount(controlSummary.refunds.completedThisPeriodAmount)],
          ["Resumo de Controlo", "Passivo Total de Carteiras", formatCsvAmount(controlSummary.wallet.totalLiability)],
          ["Resumo de Controlo", "Alunos com Crédito", controlSummary.wallet.studentsWithCredit],
          ["Resumo de Controlo", "Maior Saldo de Carteira", formatCsvAmount(controlSummary.wallet.largestBalance)],

          ["Reconciliação", "Lançamentos em Falta", reconciliationSummary.missingLedgerEntries],
          ["Reconciliação", "Lançamentos Duplicados", reconciliationSummary.duplicateLedgerEntries],
          ["Reconciliação", "Lançamentos Órfãos", reconciliationSummary.orphanLedgerEntries],
          ["Reconciliação", "Divergências de Imputação", reconciliationSummary.invoiceAllocationMismatches],
          ["Reconciliação", "Divergências de Recibo", reconciliationSummary.receiptAmountMismatches],

          ...watchlist.map((w): CsvRow => [
            "Lista de Vigilância",
            `${CLOSING_WATCHLIST_CATEGORY_LABELS[w.category]} — ${w.entityType} ${w.entityReference}`,
            `${INTEGRITY_SEVERITY_LABELS[w.severity] ?? w.severity} | ${w.amount != null ? formatCsvAmount(w.amount) : ""} | ${w.description}`,
          ]),
        ];

        return {
          csvRows,
          total: csvRows.length,
          auditMeta: { trustScore: trustScore.score, trustRating: trustScore.rating },
        };
      },
    };

  } else if (reportType === "revenue-trend") {
    const filters: RevenueTrendFilters = {
      organizationId: orgId,
      branchId: searchParams.get("branchId") ?? undefined,
      courseId: searchParams.get("courseId") ?? undefined,
      academicYearId: searchParams.get("academicYearId") ?? undefined,
      academicTermId: searchParams.get("academicTermId") ?? undefined,
      dateFrom: searchParams.get("dateFrom") ?? undefined,
      dateTo: searchParams.get("dateTo") ?? undefined,
    };
    exportConfig = {
      headers: ["Mês", "Faturado", "Cobrado", "Reembolsado", "Cobrado Líquido", "Em Aberto", "Taxa de Cobrança (%)"],
      filename: "tendencia-de-receita.csv",
      fetchBatch: async (page) => {
        if (page > 1) return { csvRows: [], total: 0 };
        const { rows } = await getRevenueTrendReport(filters);
        return {
          csvRows: rows.map((r) => [
            r.month,
            formatCsvAmount(r.invoiced),
            formatCsvAmount(r.collected),
            formatCsvAmount(r.refunded),
            formatCsvAmount(r.netCollected),
            formatCsvAmount(r.outstanding),
            r.collectionRate.toFixed(1),
          ]),
          total: rows.length,
        };
      },
    };

  } else if (reportType === "wallet-liability") {
    const filters: WalletLiabilityFilters = {
      organizationId: orgId,
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
      page: 1,
      pageSize: BATCH_SIZE,
    };
    exportConfig = {
      headers: [
        "Tipo", "Aluno / Métrica", "Filial", "Curso", "Saldo Atual / Valor",
        "Créditos Emitidos", "Créditos Consumidos", "Movimento Líquido",
        "Última Transacção", "Dias Dormente", "Nº Transacções", "Detalhe",
      ],
      filename: "passivo-carteiras.csv",
      // Mixed-shape export: a small KPI summary + watchlist block (page 1 only,
      // bounded), followed by the properly paginated per-wallet table — the
      // "Tipo" column lets a downstream consumer filter by section.
      fetchBatch: async (page, pageSize) => {
        const { rows, total } = await listWalletLiabilityRows({ ...filters, page, pageSize });
        const tableRows: CsvRow[] = rows.map((r) => [
          "Carteira",
          r.studentName,
          r.branchName,
          r.courseName,
          formatCsvAmount(r.currentBalance),
          formatCsvAmount(r.creditsIssued),
          formatCsvAmount(r.creditsConsumed),
          formatCsvAmount(r.netMovement),
          formatCsvDate(r.lastTransactionDate),
          r.daysDormant ?? "",
          r.transactionCount,
          "",
        ]);

        if (page > 1) return { csvRows: tableRows, total };

        const kpis = await getWalletLiabilityKPIs(filters);
        const watchlist = await getWalletLiabilityWatchlist(filters, kpis.totalLiability);

        const kpiRows: CsvRow[] = [
          ["KPI", "Passivo Total", "", "", formatCsvAmount(kpis.totalLiability), "", "", "", "", "", "", ""],
          ["KPI", "Alunos com Crédito", "", "", String(kpis.studentsWithCredit), "", "", "", "", "", "", ""],
          ["KPI", "Saldo Médio Positivo", "", "", formatCsvAmount(kpis.averagePositiveBalance), "", "", "", "", "", "", ""],
          ["KPI", "Maior Saldo", "", "", formatCsvAmount(kpis.largestBalance), "", "", "", "", "", "", ""],
          ["KPI", "Créditos Emitidos no Período", "", "", formatCsvAmount(kpis.creditsIssuedThisPeriod), "", "", "", "", "", "", ""],
          ["KPI", "Créditos Consumidos no Período", "", "", formatCsvAmount(kpis.creditsConsumedThisPeriod), "", "", "", "", "", "", ""],
          ["KPI", "Movimento Líquido", "", "", formatCsvAmount(kpis.netWalletMovement), "", "", "", "", "", "", ""],
          ["KPI", "Carteiras Dormentes", "", "", String(kpis.dormantWallets), "", "", "", "", "", "", ""],
        ];

        const watchlistRows: CsvRow[] = watchlist.map((w) => [
          "Vigilância",
          w.studentName,
          w.branchName,
          w.courseName,
          w.currentBalance != null ? formatCsvAmount(w.currentBalance) : "",
          "",
          "",
          "",
          formatCsvDate(w.lastTransactionDate),
          w.daysDormant ?? "",
          "",
          `${INTEGRITY_SEVERITY_LABELS[w.severity] ?? w.severity}: ${w.issue}`,
        ]);

        return {
          csvRows: [...kpiRows, ...watchlistRows, ...tableRows],
          total,
          auditMeta: { totalLiability: kpis.totalLiability },
        };
      },
    };

  } else if (reportType === "taxes") {
    const filters: TaxReportFilters = {
      organizationId: orgId,
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
      page: 1,
      pageSize: BATCH_SIZE,
    };
    exportConfig = {
      headers: [
        "Nº Fatura", "Aluno", "Filial", "Regra Fiscal", "Taxa (%)",
        "Base Tributável", "Valor de Imposto", "Total da Fatura", "Data de Emissão", "Estado",
      ],
      filename: "relatorio-impostos.csv",
      fetchBatch: async (page, pageSize) => {
        const { rows, total } = await listTaxRows({ ...filters, page, pageSize });
        return {
          csvRows: rows.map((r) => [
            r.invoiceNumber,
            r.studentName ?? "",
            r.branchName ?? "",
            r.taxRuleName,
            r.taxRate.toFixed(2),
            formatCsvAmount(r.taxableBase),
            formatCsvAmount(r.taxAmount),
            formatCsvAmount(r.invoiceTotal),
            formatCsvDate(r.issueDate),
            INVOICE_STATUS_LABELS[r.status] ?? r.status,
          ]),
          total,
        };
      },
    };

  } else if (reportType === "discounts") {
    const filters: DiscountReportFilters = {
      organizationId: orgId,
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
      page: 1,
      pageSize: BATCH_SIZE,
    };
    exportConfig = {
      headers: [
        "Tipo", "Nº Fatura / Métrica", "Aluno", "Filial", "Curso",
        "Regra de Desconto", "Tipo de Desconto", "Valor de Desconto", "Total da Fatura",
        "Taxa de Fuga (%)", "Aplicado Por", "Aplicado Em", "Detalhe / Estado",
      ],
      filename: "descontos-fuga-de-receita.csv",
      // Mixed-shape export: a small KPI summary + watchlist block (page 1
      // only, bounded), followed by the properly paginated per-discount
      // table — the "Tipo" column lets a downstream consumer filter by section.
      fetchBatch: async (page, pageSize) => {
        const { rows, total } = await listDiscountRows({ ...filters, page, pageSize });
        const tableRows: CsvRow[] = rows.map((r) => [
          "Desconto",
          r.invoiceNumber,
          r.studentName ?? "",
          r.branchName ?? "",
          r.courseName ?? "",
          r.discountRuleName,
          DISCOUNT_TYPE_LABELS[r.discountType] ?? r.discountType,
          formatCsvAmount(r.discountAmount),
          formatCsvAmount(r.invoiceTotal),
          r.leakageRate.toFixed(1),
          r.appliedByName ?? "",
          formatCsvDate(r.appliedAt),
          INVOICE_STATUS_LABELS[r.status] ?? r.status,
        ]);

        if (page > 1) return { csvRows: tableRows, total };

        const kpis = await getDiscountKPIs(filters);
        const watchlist = await getDiscountWatchlist(filters);

        const kpiRows: CsvRow[] = [
          ["KPI", "Total de Descontos", "", "", "", "", "", formatCsvAmount(kpis.totalDiscounts), "", "", "", "", ""],
          ["KPI", "Faturas com Desconto", "", "", "", "", "", String(kpis.discountedInvoicesCount), "", "", "", "", ""],
          ["KPI", "Total Antes de Descontos", "", "", "", "", "", formatCsvAmount(kpis.grossBeforeDiscounts), "", "", "", "", ""],
          ["KPI", "Total Faturado (Líquido)", "", "", "", "", "", formatCsvAmount(kpis.netInvoiced), "", "", "", "", ""],
          ["KPI", "Taxa de Fuga de Receita (%)", "", "", "", "", "", kpis.revenueLeakageRate.toFixed(1), "", "", "", "", ""],
          ["KPI", "Desconto Médio por Fatura", "", "", "", "", "", formatCsvAmount(kpis.averageDiscountPerInvoice), "", "", "", "", ""],
          ["KPI", "Maior Desconto", "", "", "", "", "", formatCsvAmount(kpis.largestDiscount), "", "", "", "", ""],
          ["KPI", "Descontos Manuais", "", "", "", "", "", `${formatCsvAmount(kpis.manualDiscountsAmount)} (${kpis.manualDiscountsCount})`, "", "", "", "", ""],
        ];

        const watchlistRows: CsvRow[] = watchlist.map((w) => [
          "Vigilância",
          w.invoiceNumber,
          w.studentName,
          w.branchName,
          w.courseName,
          w.discountRuleName,
          "",
          formatCsvAmount(w.discountAmount),
          "",
          w.leakageRate.toFixed(1),
          w.appliedByName ?? "",
          "",
          `${INTEGRITY_SEVERITY_LABELS[w.severity] ?? w.severity}: ${DISCOUNT_WATCHLIST_ACTION_LABELS[w.recommendedAction]}`,
        ]);

        return {
          csvRows: [...kpiRows, ...watchlistRows, ...tableRows],
          total,
          auditMeta: { totalDiscounts: kpis.totalDiscounts, revenueLeakageRate: kpis.revenueLeakageRate },
        };
      },
    };

  } else if (reportType === "payment-methods") {
    const filters: PaymentMethodMixFilters = {
      organizationId: orgId,
      branchId: searchParams.get("branchId") ?? undefined,
      courseId: searchParams.get("courseId") ?? undefined,
      studentId: searchParams.get("studentId") ?? undefined,
      academicYearId: searchParams.get("academicYearId") ?? undefined,
      academicTermId: searchParams.get("academicTermId") ?? undefined,
      dateFrom: searchParams.get("dateFrom") ?? undefined,
      dateTo: searchParams.get("dateTo") ?? undefined,
      paymentMethod: searchParams.get("paymentMethod") ?? undefined,
      paymentStatus: searchParams.get("paymentStatus") ?? undefined,
    };
    exportConfig = {
      headers: [
        "Tipo", "Método / Métrica", "Total Recebido", "Nº Divisões",
        "Nº Pagamentos", "Valor Médio", "Quota (%)", "Líquido Ajustado (Estim.)",
      ],
      filename: "mix-de-metodos-de-pagamento.csv",
      // Method-rooted table — at most 8 rows (one per PaymentMethod value) —
      // so, like branch-revenue/course-revenue, this is a single batch: a
      // small KPI summary followed by the full method breakdown table.
      fetchBatch: async (page) => {
        if (page > 1) return { csvRows: [], total: 0 };

        const report = await getPaymentMethodMixReport(filters);
        const { kpis, rows } = report;

        const kpiRows: CsvRow[] = [
          ["KPI", "Total Recebido", formatCsvAmount(kpis.totalReceived), "", "", "", "", ""],
          ["KPI", "Recebido em Numerário", formatCsvAmount(kpis.cashReceived), "", "", "", "", ""],
          ["KPI", "Recebido Digitalmente", formatCsvAmount(kpis.digitalReceived), "", "", "", "", ""],
          ["KPI", "Recebido por Via Bancária", formatCsvAmount(kpis.bankReceived), "", "", "", "", ""],
          ["KPI", "Método Mais Utilizado", kpis.mostUsedMethod ? (PAYMENT_METHOD_LABELS[kpis.mostUsedMethod] ?? kpis.mostUsedMethod) : "", "", "", "", "", ""],
          ["KPI", "Método de Maior Valor", kpis.highestValueMethod ? (PAYMENT_METHOD_LABELS[kpis.highestValueMethod] ?? kpis.highestValueMethod) : "", "", "", "", "", ""],
          ["KPI", "Média por Divisão de Pagamento", formatCsvAmount(kpis.averagePaymentSplit), "", "", "", "", ""],
          ["KPI", "Taxa de Dependência de Numerário (%)", kpis.cashDependencyRate.toFixed(1), "", "", "", "", ""],
        ];

        const tableRows: CsvRow[] = rows.map((r) => [
          "Método",
          PAYMENT_METHOD_LABELS[r.method] ?? r.method,
          formatCsvAmount(r.totalAmount),
          String(r.splitCount),
          String(r.paymentCount),
          formatCsvAmount(r.averageAmount),
          r.sharePct.toFixed(1),
          formatCsvAmount(r.refundAdjustedNet),
        ]);

        return {
          csvRows: [...kpiRows, ...tableRows],
          total: kpiRows.length + tableRows.length,
          auditMeta: { totalReceived: kpis.totalReceived, cashDependencyRate: kpis.cashDependencyRate },
        };
      },
    };

  } else if (reportType === "refund-analysis") {
    const filters: RefundAnalysisFilters = {
      organizationId: orgId,
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
      page: 1,
      pageSize: BATCH_SIZE,
    };
    exportConfig = {
      headers: [
        "Tipo", "Referência / Métrica", "Aluno", "Filial", "Curso",
        "Estado", "Valor", "Criado Em", "Aprovado Em", "Concluído Em",
        "Dias de Processamento", "Nº Pagamento", "Detalhe",
      ],
      filename: "analise-de-reembolsos.csv",
      // Mixed-shape export: a small KPI summary + watchlist block (page 1
      // only, bounded), followed by the properly paginated, filtered,
      // sorted refund table — the "Tipo" column lets a downstream consumer
      // filter by section (same convention as Wallet Liability/Discounts).
      fetchBatch: async (page, pageSize) => {
        const { rows, total } = await listRefundAnalysisRows({ ...filters, page, pageSize });
        const tableRows: CsvRow[] = rows.map((r) => [
          "Reembolso",
          r.refundNumber,
          r.studentName ?? "",
          r.branchName ?? "",
          r.courseName ?? "",
          REFUND_STATUS_LABELS[r.status] ?? r.status,
          formatCsvAmount(r.amount),
          formatCsvDate(r.createdAt),
          formatCsvDate(r.approvedAt),
          formatCsvDate(r.completedAt),
          r.processingDays ?? "",
          r.paymentNumber ?? "",
          "",
        ]);

        if (page > 1) return { csvRows: tableRows, total };

        const kpis = await getRefundAnalysisKPIs(filters);
        const watchlist = await getRefundWatchlist(filters);

        const kpiRows: CsvRow[] = [
          ["KPI", "Total Reembolsado", "", "", "", "", formatCsvAmount(kpis.totalRefunded), "", "", "", "", "", ""],
          ["KPI", "Pedidos de Reembolso", "", "", "", "", String(kpis.refundRequests), "", "", "", "", "", ""],
          ["KPI", "Taxa de Reembolso (%)", "", "", "", "", kpis.refundRate.toFixed(1), "", "", "", "", "", ""],
          ["KPI", "Valor Médio de Reembolso", "", "", "", "", formatCsvAmount(kpis.averageRefundAmount), "", "", "", "", "", ""],
          ["KPI", "Maior Reembolso", "", "", "", "", formatCsvAmount(kpis.largestRefund), "", "", "", "", "", ""],
          ["KPI", "Exposição de Reembolsos Pendentes", "", "", "", "", formatCsvAmount(kpis.pendingRefundExposure), "", "", "", "", "", ""],
          ["KPI", "Taxa de Rejeição (%)", "", "", "", "", kpis.rejectedRefundRate.toFixed(1), "", "", "", "", "", ""],
          ["KPI", "Tempo Médio de Processamento (dias)", "", "", "", "", kpis.averageProcessingDays.toFixed(1), "", "", "", "", "", ""],
        ];

        const watchlistRows: CsvRow[] = watchlist.map((w) => [
          "Vigilância",
          w.refundNumber,
          w.studentName,
          w.branchName,
          w.courseName,
          REFUND_STATUS_LABELS[w.status] ?? w.status,
          formatCsvAmount(w.amount),
          "",
          "",
          "",
          String(w.ageDays),
          "",
          `${INTEGRITY_SEVERITY_LABELS[w.severity] ?? w.severity}: ${REFUND_WATCHLIST_ACTION_LABELS[w.recommendedAction]} — ${w.issue}`,
        ]);

        return {
          csvRows: [...kpiRows, ...watchlistRows, ...tableRows],
          total,
          auditMeta: { totalRefunded: kpis.totalRefunded, pendingExposure: kpis.pendingRefundExposure, refundRate: kpis.refundRate },
        };
      },
    };

  } else {
    return NextResponse.json({ error: "Tipo de relatório inválido" }, { status: 400 });
  }

  // ── Preflight: first batch + total count ────────────────────────────────────

  let firstResult: PageResult;
  try {
    firstResult = await exportConfig.fetchBatch(1, BATCH_SIZE);
  } catch (err) {
    console.error("[export] preflight error:", err);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }

  const { total } = firstResult;
  const truncated = total > MAX_EXPORT_ROWS;

  // ── Audit (after preflight succeeds, before streaming body) ─────────────────

  try {
    await auditService.log(context, {
      entity: "FinancialReport",
      entityId: reportType,
      action: "financial_report.exported",
      newValues: {
        reportType,
        format: "csv",
        filters: Object.fromEntries(searchParams),
        rowLimit: MAX_EXPORT_ROWS,
        totalCount: total,
        generatedBy: context.userId,
        generatedAt: new Date().toISOString(),
        ...firstResult.auditMeta,
      },
    });
  } catch (auditErr) {
    console.error("[export] audit error (non-fatal):", auditErr);
  }

  // ── Response ────────────────────────────────────────────────────────────────

  const responseHeaders: Record<string, string> = {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${exportConfig.filename}"`,
    "X-Total-Count": String(total),
    "X-Export-Limit": String(MAX_EXPORT_ROWS),
    "X-Truncated": String(truncated),
  };

  const stream = buildStream(exportConfig, firstResult);

  return new NextResponse(stream, { status: 200, headers: responseHeaders });
}
