export interface Refund {
  id: string;
  organizationId: string;
  branchId: string | null;
  paymentId: string;
  receiptId: string | null;
  studentId: string | null;
  enrollmentId: string | null;
  invoiceId: string | null;
  refundNumber: string;
  amount: number;
  reason: string;
  // RefundStatus: REQUESTED | APPROVED | REJECTED | COMPLETED
  status: string;
  // RefundMethod: CASH_RETURN | WALLET_CREDIT
  refundMethod: string;
  notes: string | null;
  rejectionReason: string | null;
  requestedBy: string;
  approvedBy: string | null;
  rejectedBy: string | null;
  completedBy: string | null;
  approvedAt: Date | null;
  rejectedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}
