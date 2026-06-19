# Financial Audit Log

## Overview

The Financial Audit Log is a dedicated, domain-specific audit trail for all financial events. It sits alongside (not replaces) the generic `AuditLog` and adds financial-specific context: typed event types, monetary amounts, structured before/after state snapshots, and cross-entity metadata.

**Core principle**: append-only. Records are never updated or deleted.

---

## Architecture

```
FinancialAuditService.log(context, input)
  └── appendFinancialAuditLog()       ← repository write
        └── financial_audit_logs       ← SQL Server table (append-only)

FinancialAuditService failures do NOT abort the calling command.
The financial transaction commits first; audit is fire-and-forget.
```

**Two audit trails run in parallel for financial commands:**

| Trail | Table | Purpose |
|---|---|---|
| Generic `AuditService` | `audit_logs` | All system mutations (who, what, when) |
| `FinancialAuditService` | `financial_audit_logs` | Financial events with amounts, before/after, cross-entity refs |

---

## Schema

```prisma
model FinancialAuditLog {
  id             String   @id @default(cuid())
  organizationId String
  eventType      String   // FinancialAuditEventType
  entityType     String   // e.g. "Invoice", "Payment"
  entityId       String
  performedBy    String?  // null for system jobs
  performedAt    DateTime @default(now())
  amount         Decimal? // financial amount involved (if applicable)
  currency       String   @default("MZN")
  beforeData     String?  // JSON: entity state before mutation
  afterData      String?  // JSON: entity state after mutation
  metadata       String?  // JSON: cross-entity refs (invoiceId, paymentId, etc.)
  ipAddress      String?
  userAgent      String?
  createdAt      DateTime @default(now())
}
```

---

## Event Types

### Invoice

| eventType | Trigger | Emitted by |
|---|---|---|
| `INVOICE_CREATED` | New invoice issued | `CreateInvoiceCommand` |
| `INVOICE_UPDATED` | Invoice fields changed | (reserved — not yet wired) |
| `INVOICE_CANCELLED` | Invoice cancelled | `CancelInvoiceCommand` |

### Payment

| eventType | Trigger | Emitted by |
|---|---|---|
| `PAYMENT_REGISTERED` | Payment registered (PENDING) | `RegisterPaymentCommand` |
| `PAYMENT_CONFIRMED` | Payment confirmed | `ConfirmPaymentCommand` |
| `PAYMENT_CANCELLED` | Payment cancelled | `CancelPaymentCommand` |
| `PAYMENT_REFUNDED` | Payment fully refunded | `CompleteRefundCommand` |
| `PAYMENT_PARTIALLY_REFUNDED` | Payment partially refunded | `CompleteRefundCommand` |

### Receipt

| eventType | Trigger | Emitted by |
|---|---|---|
| `RECEIPT_ISSUED` | Receipt issued | `IssueReceiptCommand` |
| `RECEIPT_CANCELLED` | Receipt cancelled manually | `CancelReceiptCommand` |
| `RECEIPT_CANCELLED` | Receipt cancelled via payment cancel/refund | `CancelPaymentCommand`, `CompleteRefundCommand` |
| `RECEIPT_PARTIALLY_REFUNDED` | Receipt partially refunded | `CompleteRefundCommand` |

### Installment

| eventType | Trigger | Emitted by |
|---|---|---|
| `INSTALLMENT_RECALCULATED` | Installment balance reversed on payment cancellation | `CancelPaymentCommand` |

### Allocation

| eventType | Trigger | Emitted by |
|---|---|---|
| `PAYMENT_ALLOCATION_CREATED` | Payment split allocated to invoice items | `ConfirmPaymentCommand` |

### Wallet

| eventType | Trigger | Emitted by |
|---|---|---|
| `WALLET_CREDIT_APPLIED` | Wallet balance applied to invoice | `ConfirmPaymentCommand`, `ApplyWalletCreditCommand` |
| `WALLET_OVERPAYMENT_CREDITED` | Overpayment credited to wallet | `ConfirmPaymentCommand` |
| `WALLET_ADJUSTMENT` | Manual wallet credit/debit | `CreateWalletAdjustmentCommand` |
| `WALLET_REFUND` | Wallet balance refunded to student | `RefundWalletCommand` |

### Refund

| eventType | Trigger | Emitted by |
|---|---|---|
| `REFUND_REQUESTED` | Refund request submitted | `CreateRefundRequestCommand` |
| `REFUND_APPROVED` | Refund request approved | `ApproveRefundCommand` |
| `REFUND_REJECTED` | Refund request rejected | `RejectRefundCommand` |
| `REFUND_COMPLETED` | Refund disbursed | `CompleteRefundCommand` |

### Financial Integrity

| eventType | Trigger | Emitted by |
|---|---|---|
| `INTEGRITY_ISSUE_DETECTED` | Integrity issue detected or re-confirmed | `DailyFinancialIntegrityJob` |
| `INTEGRITY_ISSUE_ACKNOWLEDGED` | Issue acknowledged by operator | `ResolveFinancialIntegrityIssueCommand` |
| `INTEGRITY_ISSUE_RESOLVED` | Issue resolved with notes | `ResolveFinancialIntegrityIssueCommand` |
| `INTEGRITY_ISSUE_SUPPRESSED` | Issue suppressed as false-positive | `ResolveFinancialIntegrityIssueCommand` |

---

## Entity Types

| entityType | Description |
|---|---|
| `Invoice` | Invoice record |
| `Payment` | Payment record |
| `Receipt` | Receipt record |
| `Installment` | Payment plan installment |
| `StudentWallet` | Student wallet (balance container) |
| `Refund` | Refund request/disbursement |
| `FinancialIntegrityIssue` | Integrity check violation |

---

## Before/After Data Contract

Each event stores optional `beforeData` and `afterData` JSON snapshots. These capture the entity's relevant state, not the full row.

**Pattern:**
```ts
beforeData: { status: "PENDING" }
afterData:  { status: "CONFIRMED" }
metadata:   { invoiceId: "inv-001", paymentNumber: "PAG-000001" }
```

**INTEGRITY_ISSUE_DETECTED** uses `afterData` (no `beforeData` — detection is always additive):
```ts
afterData: {
  isNew: true,                    // false if re-confirming an existing OPEN issue
  severity: "CRITICAL",
  category: "INVOICE_BALANCE",
  checkName: "invoice.balance_amounts",
  description: "paidAmount + balanceAmount ≠ totalAmount",
  expectedValue: "1000.00",
  actualValue: "999.99",
}
metadata: {
  jobRunId: "...",
  affectedEntityType: "Invoice",
  affectedEntityId: "inv-...",
}
```

---

## Querying

### List audit entries for an entity

```ts
import { listFinancialAuditLogs } from "@/modules/finance/audit/repositories/financial-audit.repository";

const { entries, total } = await listFinancialAuditLogs({
  organizationId: "org-...",
  entityType: "Payment",
  entityId: "pay-...",
  page: 1,
  pageSize: 20,
});
```

### Filter by event type and date range

```ts
const { entries } = await listFinancialAuditLogs({
  organizationId: "org-...",
  eventType: "PAYMENT_CONFIRMED",
  fromDate: new Date("2026-06-01"),
  toDate: new Date("2026-06-30"),
});
```

### Summarize events for an entity (e.g. all events for one payment)

```ts
import { summarizeAuditByEvent } from "@/modules/finance/audit/repositories/financial-audit.repository";

const summary = await summarizeAuditByEvent("org-...", "Payment", "pay-...");
// [{ eventType: "PAYMENT_CONFIRMED", count: 1, totalAmount: 1500 }, ...]
```

---

## Service Usage

```ts
import { financialAuditService } from "@/modules/finance/audit/services/financial-audit.service";
import { FinancialAuditEventType } from "@/shared/types/common";

await financialAuditService.log(context, {
  eventType: FinancialAuditEventType.PAYMENT_CONFIRMED,
  entityType: "Payment",
  entityId: payment.id,
  amount: payment.totalAmount,
  beforeData: { status: "PENDING" },
  afterData:  { status: "CONFIRMED" },
  metadata:   { invoiceId: payment.invoiceId, paymentNumber: payment.paymentNumber },
});
```

**Context** must include `organizationId` and `userId`. For system jobs, use `userId: "system"`.

**Failures** are swallowed: `financialAuditService.log()` never throws. It logs to stderr and returns `null` if the database write fails.

---

## Relation to Financial Integrity

Every issue detected by the `DailyFinancialIntegrityJob` produces an `INTEGRITY_ISSUE_DETECTED` entry in the financial audit log. This lets operators correlate:
- When was the issue first detected?
- How many job runs re-confirmed it before it was resolved?
- Which job run (`jobRunId`) produced the resolution trigger?

Combined with `INTEGRITY_ISSUE_RESOLVED` entries, you get the full lifecycle of every integrity violation in one queryable trail.

See [financial-integrity.md](./financial-integrity.md) for the full integrity check documentation.
