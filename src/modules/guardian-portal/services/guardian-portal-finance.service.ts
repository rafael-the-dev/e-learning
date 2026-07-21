import type {
  Student360BillingSummary,
  Student360WalletSummary,
} from "@/modules/students/student-360/services/student-360.service";
import type {
  StudentInvoiceRow,
  StudentPaymentRow,
  StudentPaymentsSummary,
} from "@/modules/student-portal/types";
import type { StudentStatementInvoice, StudentStatementPayment } from "@/modules/reports/finance/types";

// =============================================================================
// GUARDIAN PORTAL — FINANCE SECTION
// Pure builder. The summary figures (total due / overdue / next due / wallet) come
// from the SQL-aggregated finance summary (H3) — never computed from a loaded list.
// The invoice/payment rows are a pre-fetched BOUNDED page (H3/M2), scoped to the
// validated linked student by the caller. Only invoked when the link's canViewFinance
// flag is true.
// =============================================================================

export interface GuardianFinanceSection {
  summary: StudentPaymentsSummary;
  invoices: StudentInvoiceRow[];
  payments: StudentPaymentRow[];
  pendingInvoiceCount: number;
}

export function buildGuardianFinanceSection(
  billing: Student360BillingSummary | null,
  wallet: Student360WalletSummary | null,
  invoiceRows: StudentStatementInvoice[],
  paymentRows: StudentStatementPayment[]
): GuardianFinanceSection {
  const invoices: StudentInvoiceRow[] = invoiceRows.map((inv) => ({
    invoiceId: inv.invoiceId,
    invoiceNumber: inv.invoiceNumber,
    issueDate: inv.issueDate,
    dueDate: inv.dueDate,
    totalAmount: inv.totalAmount,
    paidAmount: inv.paidAmount,
    balanceAmount: inv.balanceAmount,
    status: inv.status,
  }));

  const payments: StudentPaymentRow[] = paymentRows.map((p) => ({
    paymentId: p.paymentId,
    paymentNumber: p.paymentNumber,
    paymentDate: p.paymentDate,
    totalAmount: p.totalAmount,
    status: p.status,
  }));

  return {
    summary: {
      totalDue: billing?.outstandingBalance ?? 0,
      overdueAmount: billing?.overdueAmount ?? 0,
      nextDueDate: billing?.nextDueDate ?? null,
      walletBalance: wallet?.walletBalance ?? 0,
    },
    invoices,
    payments,
    pendingInvoiceCount: billing?.unpaidInvoiceCount ?? 0,
  };
}
