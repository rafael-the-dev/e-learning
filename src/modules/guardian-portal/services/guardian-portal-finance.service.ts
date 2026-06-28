import type { StudentFinancialStatement } from "@/modules/reports/finance/types";
import type {
  StudentInvoiceRow,
  StudentPaymentRow,
  StudentPaymentsSummary,
} from "@/modules/student-portal/types";

// =============================================================================
// GUARDIAN PORTAL — FINANCE SECTION
// Pure builder over the SELECTED student's financial statement (the same
// statement Student 360 / the Student Portal use). Scope is guaranteed by the
// caller: the statement only ever belongs to the validated, linked student.
// Only invoked when the link's canViewFinance flag is true.
// =============================================================================

const UNPAID_INVOICE_STATUSES = ["PENDING", "OVERDUE", "PARTIALLY_PAID"];

export interface GuardianFinanceSection {
  summary: StudentPaymentsSummary;
  invoices: StudentInvoiceRow[];
  payments: StudentPaymentRow[];
  pendingInvoiceCount: number;
}

export function buildGuardianFinanceSection(
  statement: StudentFinancialStatement | null,
  invoiceLimit: number,
  paymentLimit: number
): GuardianFinanceSection {
  const allInvoices = statement?.invoices ?? [];
  const allPayments = statement?.payments ?? [];

  const invoices: StudentInvoiceRow[] = allInvoices
    .filter((inv) => UNPAID_INVOICE_STATUSES.includes(inv.status))
    .slice(0, invoiceLimit)
    .map((inv) => ({
      invoiceId: inv.invoiceId,
      invoiceNumber: inv.invoiceNumber,
      issueDate: inv.issueDate,
      dueDate: inv.dueDate,
      totalAmount: inv.totalAmount,
      paidAmount: inv.paidAmount,
      balanceAmount: inv.balanceAmount,
      status: inv.status,
    }));

  const payments: StudentPaymentRow[] = allPayments.slice(0, paymentLimit).map((p) => ({
    paymentId: p.paymentId,
    paymentNumber: p.paymentNumber,
    paymentDate: p.paymentDate,
    totalAmount: p.totalAmount,
    status: p.status,
  }));

  const overdueAmount = allInvoices
    .filter((inv) => inv.status === "OVERDUE")
    .reduce((sum, inv) => sum + inv.balanceAmount, 0);

  const nextDueDate =
    allInvoices
      .filter((inv) => UNPAID_INVOICE_STATUSES.includes(inv.status) && inv.dueDate != null)
      .map((inv) => inv.dueDate as Date)
      .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;

  const pendingInvoiceCount = allInvoices.filter((inv) =>
    UNPAID_INVOICE_STATUSES.includes(inv.status)
  ).length;

  return {
    summary: {
      totalDue: statement?.kpis.outstandingBalance ?? 0,
      overdueAmount,
      nextDueDate,
      walletBalance: statement?.kpis.walletBalance ?? 0,
    },
    invoices,
    payments,
    pendingInvoiceCount,
  };
}
