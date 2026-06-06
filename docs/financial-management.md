# Financial Management Module

## Overview

The Financial Core Module handles billing and payment collection for student enrollments. Every amount received is fully auditable: traceable to how it was paid, what obligation it settled, whether it came from wallet credit, and whether it generated an overpayment.

---

## Core Domain Objects

### Invoice

An invoice represents a financial obligation. It has header-level totals (`paidAmount`, `balanceAmount`) and is broken down into `InvoiceItem` records, each representing a specific fee.

**Invoice status** is derived from item balances:
- `PENDING` — no payment applied
- `PARTIALLY_PAID` — some but not all items settled
- `PAID` — all items settled (balanceAmount = 0)
- `OVERDUE` — past due date with remaining balance
- `CANCELLED` — voided

### InvoiceItem

Represents a single financial obligation line (e.g., registration fee, course fee). Key fields:

| Field           | Description                                              |
|-----------------|----------------------------------------------------------|
| `itemType`      | Determines allocation priority (see Priority below)      |
| `paidAmount`    | Sum of all PaymentAllocations for this item              |
| `balanceAmount` | `totalPrice - paidAmount` (cached for query efficiency)  |
| `priority`      | Controls allocation order (lower = paid first)           |
| `status`        | PENDING / PARTIALLY_PAID / PAID                          |

**Allocation priority:**

| Priority | ItemType          |
|----------|-------------------|
| 1        | REGISTRATION_FEE  |
| 2        | COURSE_FEE        |
| 3        | MATERIAL_FEE      |
| 4        | EXAM_FEE          |
| 5        | CERTIFICATE_FEE   |
| 6        | PENALTY           |
| 7        | OTHER             |

### Payment

Represents new money received for an invoice. A payment remains `PENDING` until explicitly confirmed.

| Field          | Description                               |
|----------------|-------------------------------------------|
| `totalAmount`  | Sum of PaymentSplits (new money received) |
| `status`       | PENDING → CONFIRMED or CANCELLED          |

`totalAmount` is the authoritative record of new money. It is never modified after creation.

### PaymentSplit

Breaks down how the payment was received by method (CASH, MPESA, BANK_TRANSFER, etc.). A payment always has at least one split.

### PaymentAllocation

**The core of the settlement model.** Records exactly which invoice item received how much money, and from which source.

| Field                | Description                                          |
|----------------------|------------------------------------------------------|
| `paymentId`          | The payment that generated this allocation (or null) |
| `creditApplicationId`| The wallet credit applied (or null)                  |
| `invoiceItemId`      | Which item was settled                               |
| `amount`             | Amount applied to this item                          |
| `allocationType`     | PAYMENT / WALLET_CREDIT / ADJUSTMENT / REFUND_REVERSAL |

**Invariants:**
- `SUM(allocations for payment) ≤ payment.totalAmount`
- `InvoiceItem.paidAmount = SUM(allocations where invoiceItemId = this.id)`
- `InvoiceItem.balanceAmount = totalPrice - paidAmount`
- `Invoice.paidAmount = SUM(InvoiceItem.paidAmount)`

---

## Payment Flows

### 1. Register Payment (PENDING)

`RegisterPaymentCommand` creates a payment + PaymentSplits. No allocations are created — the payment is unconfirmed and has no financial effect on the invoice.

### 2. Confirm Payment

`ConfirmPaymentCommand` is the heart of the settlement engine. It executes atomically:

1. Validate invoice is not CANCELLED
2. Validate wallet credit does not exceed invoice balance
3. Re-check wallet balance inside the transaction (race condition guard)
4. Sum PaymentSplits to determine new money received
5. **Allocation algorithm** (by item priority):
   - Phase 1: allocate wallet credit to items (by priority)
   - Phase 2: allocate new money to remaining item balances (by priority)
6. Create `CreditApplication` + `StudentWalletTransaction(CREDIT_APPLIED)` if wallet credit used
7. Create `PaymentAllocation` records (one per item per source)
8. Update `InvoiceItem.paidAmount` and `balanceAmount`
9. Update `Invoice.paidAmount`, `balanceAmount`, `status` (incremental)
10. Create `StudentWalletTransaction(OVERPAYMENT)` if new money exceeds invoice balance
11. Update `Installment` if linked
12. Mark `Payment.status = CONFIRMED`
13. Write `AuditLog`

**Overpayment**: If new money exceeds the invoice balance after wallet credit is applied, the excess is credited to the student's wallet as `OVERPAYMENT`. No `PaymentAllocation` is created for overpayment — it is not applied to any invoice item.

### 3. Cancel Payment

`CancelPaymentCommand` reverses all financial effects for CONFIRMED payments:

1. Load all `PaymentAllocation` records for this payment
2. Reverse wallet credit applications (ADJUSTMENT transaction to wallet)
3. Reverse overpayment if present (blocked if wallet balance has been spent)
4. Reverse `InvoiceItem.paidAmount` grouped by item
5. Reverse `Invoice.paidAmount` and `balanceAmount`
6. Mark `Payment.status = CANCELLED`

### 4. Apply Wallet Credit (standalone)

`ApplyWalletCreditCommand` applies wallet credit to an invoice without an associated payment. This creates:
- A `CreditApplication` (paymentId = null)
- `StudentWalletTransaction(CREDIT_APPLIED)`
- `PaymentAllocation(allocationType = WALLET_CREDIT)` per item settled

---

## Wallet Credit Flow

```
Student pays 800 MT for a 1000 MT invoice.
Student has 200 MT wallet credit.

→ ConfirmPayment(walletCreditAmount: 200)

Wallet:
  - CREDIT_APPLIED: -200 MT (referenceType: Invoice)

PaymentAllocations:
  - REGISTRATION_FEE item (500 MT): WALLET_CREDIT 200 MT + PAYMENT 300 MT
  - COURSE_FEE item (500 MT):       PAYMENT 500 MT

Invoice:
  paidAmount: 1000 MT
  balanceAmount: 0
  status: PAID
```

---

## Overpayment Flow

```
Student pays 1200 MT for a 1000 MT invoice.

→ ConfirmPayment(walletCreditAmount: 0)

PaymentAllocations:
  - REGISTRATION_FEE item: PAYMENT 500 MT
  - COURSE_FEE item:        PAYMENT 500 MT

Wallet:
  - OVERPAYMENT: +200 MT (referenceType: Payment)

Invoice:
  paidAmount: 1000 MT, status: PAID

Receipt:
  amount: 1000 MT (settled against invoice)
  overpaymentAmount: 200 MT (shown separately on receipt)
```

---

## Receipt

A receipt is issued for a CONFIRMED payment. It is the official proof of settlement.

**Receipt.amount** = sum of all `PaymentAllocation` records for this payment (total settled against the invoice).

The receipt displays:
- Payment splits (how new money was received, by method)
- Wallet credit applied (if any)
- Allocation breakdown by invoice item
- Overpayment credited to wallet (if any)
- Total amount settled

---

## Auditability Guarantees

Every financial mutation produces an `AuditLog` entry. The full trail for a payment is:
- `payment.registered` — payment created with splits
- `payment.confirmed` — settlement executed with allocation details
- `wallet.credit_applied` — wallet debit recorded separately
- `receipt.issued` — receipt created after confirmation
- `payment.cancelled` — reversal with before/after values

**Tenant isolation**: `organizationId` is always sourced from the server-side auth context (`requireOrganization()`), never from client input. All repository queries include `organizationId` as a mandatory filter.

---

## Registration Fee Activation Logic

When a student's invoice includes a `REGISTRATION_FEE` item, it is always allocated first (priority 1). This ensures the registration obligation is settled before course fees. Enrollment activation logic in the enrollment module can check whether the `REGISTRATION_FEE` item on the student's invoice has `status = PAID`.

---

## Architecture

```
Client → Server Action → Command → Repository/DB
                         ↓
                    Validates input (Zod)
                    Authorizes (RBAC)
                    Executes in $transaction
                    Writes AuditLog
```

- **Commands** handle all mutations (RegisterPayment, ConfirmPayment, etc.)
- **Repositories** handle all DB access (explicit `select`, typed rows, mapped domain objects)
- **Services** are thin wrappers used by RSC pages
- **No Prisma in pages or components**
