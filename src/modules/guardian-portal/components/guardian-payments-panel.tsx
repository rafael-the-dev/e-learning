import { StudentPaymentsPanel } from "@/modules/student-portal/components/student-payments-panel";
import type {
  StudentPaymentsSummary,
  StudentInvoiceRow,
  StudentPaymentRow,
} from "@/modules/student-portal/types";

interface Props {
  summary: StudentPaymentsSummary;
  invoices: StudentInvoiceRow[];
  payments: StudentPaymentRow[];
}

// Reuses the Student Portal payments panel, scoped to the SELECTED student only.
// Only rendered when the link's canViewFinance flag is true.
export function GuardianPaymentsPanel({ summary, invoices, payments }: Props) {
  return <StudentPaymentsPanel summary={summary} invoices={invoices} payments={payments} />;
}
