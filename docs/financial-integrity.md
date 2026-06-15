# Financial Integrity Check System

## Overview

The Financial Integrity Check system detects data inconsistencies in the financial domain without ever auto-repairing them. It runs daily as a background job and records every detected violation as a `FinancialIntegrityIssue` that must be reviewed and resolved by a human operator.

**Core principle**: detect and report only. Never auto-fix.

---

## Checks

Eight categories of checks are implemented. Each category is independent and can be run selectively.

### 1. `INVOICE_BALANCE`

| Check name | Description | Severity |
|---|---|---|
| `invoice.balance_amounts` | `paidAmount + balanceAmount ≠ totalAmount` | CRITICAL |
| `invoice.total_formula` | `totalAmount ≠ subtotal − discountAmount + taxAmount` | HIGH |
| `invoice.status_paid_but_balance` | status = PAID but `balanceAmount > 0` | HIGH |
| `invoice.status_should_be_paid` | `balanceAmount = 0` and `paidAmount > 0` but status ≠ PAID | MEDIUM |

**Skips**: CANCELLED invoices are excluded from status checks.

---

### 2. `INSTALLMENT_BALANCE`

| Check name | Description | Severity |
|---|---|---|
| `payment_plan.installment_sum` | `SUM(installments.amount) ≠ paymentPlan.totalAmount` | HIGH |
| `installment.balance_amounts` | `paidAmount + balanceAmount ≠ installment.amount` | CRITICAL |

**Skips**: CANCELLED payment plans are excluded.

---

### 3. `PAYMENT_ALLOCATION`

| Check name | Description | Severity |
|---|---|---|
| `payment.split_sum` | `SUM(paymentSplits.amount) ≠ payment.totalAmount` for confirmed payments | CRITICAL |
| `payment.allocation_sum` | `SUM(paymentAllocations.amount) ≠ payment.totalAmount` for confirmed payments | HIGH |
| `payment_allocation.cancelled_invoice` | `PaymentAllocation` references a CANCELLED invoice | MEDIUM |

---

### 4. `WALLET_BALANCE`

| Check name | Description | Severity |
|---|---|---|
| `wallet.negative_balance` | `SUM(walletTransactions.amount) < 0` for a student wallet | CRITICAL |
| `credit_application.allocation_mismatch` | `creditApplication.amount ≠ SUM(linked paymentAllocations.amount)` | HIGH |

---

### 5. `REFUND_TOTAL`

| Check name | Description | Severity |
|---|---|---|
| `refund.exceeds_payment` | `SUM(COMPLETED refunds) > payment.totalAmount` | CRITICAL |
| `receipt.refunded_amount_mismatch` | `receipt.refundedAmount ≠ SUM(COMPLETED refunds for same payment)` | HIGH |

---

### 6. `RECEIPT_INTEGRITY`

| Check name | Description | Severity |
|---|---|---|
| `receipt.amount_mismatch` | `receipt.amount ≠ payment.totalAmount` for non-cancelled receipts | HIGH |
| `receipt.status_should_be_cancelled` | `refundedAmount ≥ receipt.amount` but status ≠ CANCELLED | HIGH |
| `receipt.status_should_be_partially_refunded` | `refundedAmount > 0 AND < receipt.amount` but status = ISSUED | MEDIUM |

---

### 7. `ORPHAN_RECORD`

| Check name | Description | Severity |
|---|---|---|
| `refund.cancelled_payment` | Non-rejected Refund references a CANCELLED payment | HIGH |
| `credit_application.cancelled_invoice` | CreditApplication references a CANCELLED invoice | MEDIUM |
| `wallet_transaction.missing_wallet` | WalletTransaction has no matching parent wallet | CRITICAL |

---

### 8. `LEDGER_CONSISTENCY`

Checks within the `financial_transactions` table itself — does not flag missing ledger entries for historical records (which predate the ledger feature).

| Check name | Description | Severity |
|---|---|---|
| `ledger.duplicate_entry` | Multiple entries for the same `(sourceType, sourceId, transactionType)` | HIGH |
| `ledger.wrong_direction` | Ledger entry `direction` contradicts the canonical direction for its `transactionType` | CRITICAL |
| `ledger.non_positive_amount` | Ledger entry `amount ≤ 0` | CRITICAL |

**Direction contract** (from organization's perspective):

| transactionType | Expected direction |
|---|---|
| INVOICE_CREATED | CREDIT |
| INVOICE_CANCELLED | DEBIT |
| PAYMENT_RECEIVED | CREDIT |
| PAYMENT_CANCELLED | DEBIT |
| CREDIT_APPLIED | CREDIT |
| WALLET_CREDIT | DEBIT |
| WALLET_DEBIT | DEBIT |
| REFUND_DISBURSED | DEBIT |
| RECEIPT_ISSUED | CREDIT |

---

## Severity Levels

| Severity | Label (pt-PT) | Meaning |
|---|---|---|
| `CRITICAL` | Crítico | Data corruption or impossible financial state. Investigate immediately. |
| `HIGH` | Alto | Balance mismatch. Investigate before end of day. |
| `MEDIUM` | Médio | Soft inconsistency (status wrong but amounts OK). Investigate within the week. |
| `LOW` | Baixo | Informational / expected for historical data. Review at leisure. |

---

## Issue Lifecycle

```
Detected → OPEN → ACKNOWLEDGED → RESOLVED
                              ↘ SUPPRESSED
```

| Status | Label (pt-PT) | Meaning |
|---|---|---|
| `OPEN` | Em Aberto | Newly detected. Requires operator attention. |
| `ACKNOWLEDGED` | Reconhecido | Seen and under investigation. |
| `RESOLVED` | Resolvido | Root cause found and manually corrected. Requires `resolutionNotes`. |
| `SUPPRESSED` | Suprimido | Known false-positive. Intentionally silenced. |

**Transitions**: Only `OPEN` and `ACKNOWLEDGED` issues can be transitioned. `RESOLVED` and `SUPPRESSED` are terminal states.

**Deduplication**: A filtered unique index (SQL Server `WHERE status = 'OPEN'`) prevents two OPEN issues for the same `(organizationId, entityType, entityId, checkName)`. Re-running the job on an existing OPEN issue updates `detectedAt` (re-confirmation) instead of creating a duplicate.

---

## Investigation Workflow

### Step 1 — Triage

Open the integrity issues list filtered to `status = OPEN`, sorted by severity descending.
For CRITICAL issues, page the responsible finance team immediately.

### Step 2 — Identify root cause

Each issue includes:
- `entityType` + `entityId`: navigate to the offending record in the admin UI.
- `expectedValue` / `actualValue`: the exact numerical or status discrepancy.
- `description`: human-readable explanation of the violation.
- `jobRunId`: groups all issues from the same run to understand blast radius.

Common causes:
- **Balance mismatches**: aborted transactions that left partial state; concurrent command races; manual database edits.
- **Status mismatches**: billing job ran before payment confirmed; race between payment confirmation and installment update.
- **Orphan records**: refund/credit applied before the referenced entity was fully committed; manual deletions.
- **Ledger issues**: duplicate event publishing; command re-runs without idempotency.

### Step 3 — Correct the data

**Never use the application commands to auto-repair.** Data corrections must be:
1. Performed via a controlled migration script reviewed by a second engineer.
2. Applied in a transaction with a corresponding audit log entry.
3. Documented in the issue's `resolutionNotes`.

### Step 4 — Resolve the issue

Once the underlying data is fixed, use `ResolveFinancialIntegrityIssueCommand` with:
- `newStatus: "RESOLVED"`
- `resolutionNotes`: a human-readable description of what was fixed and how.

On the next daily run, the check will re-run and confirm the issue no longer exists (no new OPEN issue created).

### Step 5 — Suppress known false-positives

If the check produces a consistent false-positive for a specific entity (e.g., a legacy record that pre-dates the current invariant), resolve it as `SUPPRESSED` with a note explaining why. Do not suppress CRITICAL issues without team sign-off.

---

## Running Manually

The check can be triggered on-demand via `RunFinancialIntegrityCheckCommand`:

```ts
const result = await new RunFinancialIntegrityCheckCommand(
  {
    organizationId: "org-xyz",       // optional: omit to run across all orgs
    categories: ["INVOICE_BALANCE"], // optional: omit to run all 8 categories
  },
  context
).run();
```

This requires the `integrity.checks.run` permission (granted to SUPER_ADMIN and ORG_ADMIN by default).

---

## Architecture

```
DailyFinancialIntegrityJob          ← job entry point (daily cron)
  └── RunFinancialIntegrityCheckCommand   ← wraps job as a command
  └── ALL_CHECKS[]                        ← 8 check functions
        ├── checkInvoiceBalances
        ├── checkInstallmentBalances
        ├── checkPaymentAllocations
        ├── checkWalletBalances
        ├── checkRefundTotals
        ├── checkReceiptIntegrity
        ├── checkOrphanRecords
        └── checkLedgerConsistency
  └── upsertOpenIssue                     ← dedup-safe persistence
  └── AuditLog (summary per run)

ResolveFinancialIntegrityIssueCommand ← manual resolution
  └── updateIssueStatus
  └── AuditLog (per resolution)
```

**Atomicity**: each check runs independently. A failure in one category does not abort the others. Errors are captured per-category in `CategoryCheckResult.error`.

**Scalability**: all checks use SQL aggregation (`$queryRaw`) rather than loading all records into Node.js memory. They are read-only and safe to run concurrently with normal application traffic.

**Multi-tenancy**: all queries and writes are scoped to `organizationId`. The job loops over organizations and never mixes data between tenants.
