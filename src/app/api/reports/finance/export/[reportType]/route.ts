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
import { buildCsv, formatCsvDate, formatCsvAmount } from "@/modules/reports/finance/utils/csv-export";
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  REFUND_METHOD_LABELS,
  REFUND_STATUS_LABELS,
  INVOICE_STATUS_LABELS,
  INSTALLMENT_STATUS_LABELS,
  WALLET_TRANSACTION_TYPE_LABELS,
} from "@/modules/finance/types";
import { AGING_BUCKET_LABELS } from "@/modules/reports/finance/types";
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
} from "@/modules/reports/finance/types";

const MAX_EXPORT_ROWS = 5000;

export async function GET(
  req: NextRequest,
  { params }: { params: { reportType: string } }
) {
  try {
    const context = await requirePermission(PERMISSIONS.FINANCIAL_REPORTS_EXPORT);
    const { searchParams } = req.nextUrl;
    const { reportType } = params;

    const baseFilters = {
      organizationId: context.organizationId,
      branchId: searchParams.get("branchId") ?? undefined,
      courseId: searchParams.get("courseId") ?? undefined,
      studentId: searchParams.get("studentId") ?? undefined,
      academicYearId: searchParams.get("academicYearId") ?? undefined,
      academicTermId: searchParams.get("academicTermId") ?? undefined,
      classGroupId: searchParams.get("classGroupId") ?? undefined,
      dateFrom: searchParams.get("dateFrom") ?? undefined,
      dateTo: searchParams.get("dateTo") ?? undefined,
      search: searchParams.get("search") ?? undefined,
      page: 1,
      pageSize: MAX_EXPORT_ROWS,
    };

    let csv = "";
    let filename = "";

    if (reportType === "accounts-receivable") {
      const filters: AccountsReceivableFilters = {
        ...baseFilters,
        dueDateFrom: searchParams.get("dueDateFrom") ?? undefined,
        dueDateTo: searchParams.get("dueDateTo") ?? undefined,
        invoiceStatus: searchParams.get("invoiceStatus") ?? undefined,
        agingBucket: (searchParams.get("agingBucket") as AccountsReceivableFilters["agingBucket"]) ?? undefined,
      };
      const { rows } = await listAccountsReceivable(filters);
      const headers = [
        "Nº Fatura", "Aluno", "Matrícula", "Curso", "Filial",
        "Data de Emissão", "Data de Vencimento", "Total", "Pago", "Saldo",
        "Estado", "Dias em Atraso", "Escalão de Atraso",
      ];
      const data = rows.map((r) => [
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
      ]);
      csv = buildCsv(headers, data);
      filename = "contas-a-receber.csv";

    } else if (reportType === "aging") {
      const filters: AgingFilters = {
        ...baseFilters,
        agingBucket: (searchParams.get("agingBucket") as AgingFilters["agingBucket"]) ?? undefined,
      };
      const { rows } = await listAgingRows(filters);
      const headers = [
        "Nº Fatura", "Aluno", "Curso", "Filial",
        "Data de Vencimento", "Saldo", "Dias em Atraso", "Escalão",
      ];
      const data = rows.map((r) => [
        r.invoiceNumber,
        r.studentName ?? "",
        r.courseName ?? "",
        r.branchName ?? "",
        formatCsvDate(r.dueDate),
        formatCsvAmount(r.balanceAmount),
        r.daysOverdue,
        AGING_BUCKET_LABELS[r.agingBucket] ?? r.agingBucket,
      ]);
      csv = buildCsv(headers, data);
      filename = "analise-aging.csv";

    } else if (reportType === "payments") {
      const filters: PaymentsReportFilters = {
        ...baseFilters,
        paymentMethod: searchParams.get("paymentMethod") ?? undefined,
      };
      const { rows } = await listPaymentsReport(filters);
      const headers = [
        "Nº Pagamento", "Aluno", "Nº Fatura", "Filial",
        "Valor Bruto", "Reembolsado", "Valor Líquido",
        "Métodos", "Estado", "Data Pagamento", "Criado Por",
      ];
      const data = rows.map((r) => [
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
      ]);
      csv = buildCsv(headers, data);
      filename = "relatorio-pagamentos.csv";

    } else if (reportType === "refunds") {
      const filters: RefundsReportFilters = {
        ...baseFilters,
        refundMethod: searchParams.get("refundMethod") ?? undefined,
        refundStatus: searchParams.get("refundStatus") ?? undefined,
      };
      const { rows } = await listRefundsReport(filters);
      const headers = [
        "Nº Reembolso", "Aluno", "Nº Pagamento", "Nº Recibo",
        "Valor", "Método", "Estado", "Motivo",
        "Solicitado Em", "Concluído Em", "Filial", "Aprovado Por",
      ];
      const data = rows.map((r) => [
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
      ]);
      csv = buildCsv(headers, data);
      filename = "relatorio-reembolsos.csv";

    } else if (reportType === "student-debt") {
      const filters: StudentDebtFilters = {
        ...baseFilters,
        dueDateFrom: searchParams.get("dueDateFrom") ?? undefined,
        dueDateTo: searchParams.get("dueDateTo") ?? undefined,
        overdueOnly: searchParams.get("overdueOnly") === "true",
        minBalance: searchParams.get("minBalance") ? parseFloat(searchParams.get("minBalance")!) : undefined,
      };
      const { rows } = await listStudentDebtRows(filters);
      const headers = [
        "Aluno", "Código", "Cursos", "Filiais",
        "Total Faturado", "Total Pago", "Saldo em Aberto",
        "Saldo Vencido", "Nº Faturas", "Dias Máx. em Atraso",
      ];
      const data = rows.map((r) => [
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
      ]);
      csv = buildCsv(headers, data);
      filename = "relatorio-divida-alunos.csv";

    } else if (reportType === "collections") {
      const filters: CollectionsFilters = {
        ...baseFilters,
        dueDateFrom: searchParams.get("dueDateFrom") ?? undefined,
        dueDateTo: searchParams.get("dueDateTo") ?? undefined,
        installmentStatus: searchParams.get("installmentStatus") ?? undefined,
        minDaysOverdue: searchParams.get("minDaysOverdue") ? parseInt(searchParams.get("minDaysOverdue")!, 10) : undefined,
        maxDaysOverdue: searchParams.get("maxDaysOverdue") ? parseInt(searchParams.get("maxDaysOverdue")!, 10) : undefined,
      };
      const { rows } = await listCollectionsRows(filters);
      const headers = [
        "Aluno", "Curso", "Filial", "Nº Fatura",
        "Plano de Pagamento", "Nº Prestação", "Data Vencimento",
        "Valor", "Pago", "Saldo", "Dias em Atraso", "Estado",
      ];
      const data = rows.map((r) => [
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
      ]);
      csv = buildCsv(headers, data);
      filename = "relatorio-cobrancas.csv";

    } else if (reportType === "branch-revenue") {
      const filters: BranchRevenueFilters = {
        organizationId: context.organizationId,
        branchId: searchParams.get("branchId") ?? undefined,
        academicYearId: searchParams.get("academicYearId") ?? undefined,
        academicTermId: searchParams.get("academicTermId") ?? undefined,
        dateFrom: searchParams.get("dateFrom") ?? undefined,
        dateTo: searchParams.get("dateTo") ?? undefined,
      };
      const { rows } = await getBranchRevenueReport(filters);
      const headers = [
        "Filial", "Total Faturado", "Total Cobrado", "Saldo em Aberto",
        "Saldo Vencido", "Taxa de Cobrança (%)", "Pagamentos", "Alunos",
      ];
      const data = rows.map((r) => [
        r.branchName,
        formatCsvAmount(r.totalInvoiced),
        formatCsvAmount(r.totalCollected),
        formatCsvAmount(r.outstandingBalance),
        formatCsvAmount(r.overdueBalance),
        r.collectionRate.toFixed(1),
        r.paymentCount,
        r.studentCount,
      ]);
      csv = buildCsv(headers, data);
      filename = "receita-por-filial.csv";

    } else if (reportType === "wallets") {
      const filters: WalletActivityFilters = {
        organizationId: context.organizationId,
        branchId: searchParams.get("branchId") ?? undefined,
        studentId: searchParams.get("studentId") ?? undefined,
        transactionType: searchParams.get("transactionType") ?? undefined,
        dateFrom: searchParams.get("dateFrom") ?? undefined,
        dateTo: searchParams.get("dateTo") ?? undefined,
        minBalance: searchParams.get("minBalance") ? parseFloat(searchParams.get("minBalance")!) : undefined,
        search: searchParams.get("search") ?? undefined,
        page: 1,
        pageSize: MAX_EXPORT_ROWS,
      };
      const { rows } = await listWalletActivityRows(filters);
      const headers = [
        "Aluno", "Código", "Saldo Actual", "Total Créditos", "Total Débitos",
        "Nº Transacções", "Última Transacção", "Último Tipo",
      ];
      const data = rows.map((r) => [
        r.studentName,
        r.studentCode ?? "",
        formatCsvAmount(r.currentBalance),
        formatCsvAmount(r.totalCredits),
        formatCsvAmount(r.totalDebits),
        r.transactionCount,
        formatCsvDate(r.lastTransactionDate),
        WALLET_TRANSACTION_TYPE_LABELS[r.lastTransactionType ?? ""] ?? (r.lastTransactionType ?? ""),
      ]);
      csv = buildCsv(headers, data);
      filename = "extrato-carteiras.csv";

    } else if (reportType === "course-revenue") {
      const filters: CourseRevenueFilters = {
        organizationId: context.organizationId,
        branchId: searchParams.get("branchId") ?? undefined,
        courseId: searchParams.get("courseId") ?? undefined,
        academicYearId: searchParams.get("academicYearId") ?? undefined,
        academicTermId: searchParams.get("academicTermId") ?? undefined,
        dateFrom: searchParams.get("dateFrom") ?? undefined,
        dateTo: searchParams.get("dateTo") ?? undefined,
      };
      const { rows } = await getCourseRevenueReport(filters);
      const headers = [
        "Curso", "Matrículas Activas", "Total Faturado", "Total Cobrado",
        "Saldo em Aberto", "Saldo Vencido", "Taxa de Cobrança (%)", "Valor Médio",
      ];
      const data = rows.map((r) => [
        r.courseName,
        r.activeEnrollments,
        formatCsvAmount(r.totalInvoiced),
        formatCsvAmount(r.totalCollected),
        formatCsvAmount(r.outstandingBalance),
        formatCsvAmount(r.overdueBalance),
        r.collectionRate.toFixed(1),
        formatCsvAmount(r.averageInvoiceValue),
      ]);
      csv = buildCsv(headers, data);
      filename = "receita-por-curso.csv";

    } else {
      return NextResponse.json({ error: "Tipo de relatório inválido" }, { status: 400 });
    }

    await auditService.log(context, {
      entity: "FinancialReport",
      entityId: reportType,
      action: "financial_report.exported",
      newValues: { reportType, format: "csv" },
    });

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
}
