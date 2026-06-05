# Student Wallet Module

## Overview

The Student Wallet module provides a per-student credit system. It supports advance deposits, overpayments, administrative adjustments, credit application to invoices, and refunds. **Balance is never stored directly** — it is always derived from the ledger of wallet transactions.

## Domain Model

```
Student
  └── StudentWallet (one per student per organization)
        └── StudentWalletTransaction[] (ledger)

Invoice
  └── CreditApplication[] (records when wallet credit was applied)
```

## Models

### StudentWallet

One wallet per student per organization. Enforced by `@@unique([organizationId, studentId])`.

| Field | Type | Description |
|-------|------|-------------|
| organizationId | String | Tenant isolation |
| studentId | String | Owner student |
| status | String | `ACTIVE` / `SUSPENDED` |

**Balance** is computed as `SUM(StudentWalletTransaction.amount)` where positive amounts increase the balance and negative amounts decrease it.

### StudentWalletTransaction

Every credit and debit is recorded here. This is the source of truth for the wallet balance.

| Field | Type | Description |
|-------|------|-------------|
| type | String | Transaction type (see below) |
| amount | Decimal | Signed: positive = credit, negative = debit |
| referenceType | String? | Entity type being referenced (e.g. `"Payment"`, `"Invoice"`) |
| referenceId | String? | ID of the referenced entity |
| description | String? | Free-text description |

### Transaction Types

| Type | Sign | Description |
|------|------|-------------|
| `DEPOSIT` | + | Manual cash/payment deposit into wallet |
| `OVERPAYMENT` | + | Excess from a payment routed to wallet |
| `PROMOTIONAL_CREDIT` | + | Promotional balance granted |
| `ADJUSTMENT` | ±  | Admin correction (positive or negative) |
| `CREDIT_APPLIED` | − | Wallet credit used to pay an invoice |
| `REFUND` | − | Money returned from wallet to student |

### CreditApplication

Records every instance where wallet credit was applied to an invoice. One record per application event.

| Field | Type | Description |
|-------|------|-------------|
| studentId | String | Student owner |
| studentWalletId | String | Wallet used |
| invoiceId | String | Invoice credited |
| amount | Decimal | Amount applied |

## Business Rules

1. One wallet per student per organization.
2. Wallet is created on demand (via `CreateWalletCommand` or auto-created in `ProcessOverpaymentCommand`).
3. **Balance = `SUM(transaction.amount)`** — never stored as a field.
4. Credit applied (`CREDIT_APPLIED`) cannot exceed the wallet balance.
5. Credit applied cannot exceed the invoice's current `balanceAmount`.
6. Credit can only be applied to invoices belonging to the same student and organization.
7. Deposits must be positive (> 0).
8. Refunds cannot exceed the available balance.
9. Adjustments (positive or negative) are restricted to `ORG_ADMIN`.
10. A negative adjustment cannot exceed the available balance.
11. All wallet mutations that touch the invoice are fully transactional.

## Permissions

| Permission | ORG_ADMIN | SECRETARY |
|------------|-----------|-----------|
| wallets.view | ✓ | ✓ |
| walletTransactions.view | ✓ | ✓ |
| walletTransactions.deposit | ✓ | ✓ |
| walletTransactions.adjust | ✓ | — |
| walletTransactions.applyCredit | ✓ | ✓ |
| walletTransactions.refund | ✓ | — |

## Commands

| Command | Description |
|---------|-------------|
| `CreateWalletCommand` | Creates a new wallet for a student (checks for existing) |
| `CreateDepositCommand` | Records a `DEPOSIT` transaction |
| `ApplyWalletCreditCommand` | Records `CREDIT_APPLIED` + updates invoice + creates `CreditApplication` — fully transactional |
| `CreateWalletAdjustmentCommand` | Records an `ADJUSTMENT` (ORG_ADMIN only) |
| `RefundWalletCommand` | Records a `REFUND` (negative transaction) |
| `ProcessOverpaymentCommand` | Creates/finds wallet and records `OVERPAYMENT`; called when a payment exceeds invoice balance |

## Architecture

```
src/modules/wallets/
├── types/index.ts                  # Domain types + label maps
├── schemas/wallet.schema.ts        # Zod validation schemas
├── repositories/wallet.repository.ts
├── services/wallet.service.ts
├── commands/
│   ├── create-wallet.command.ts
│   ├── create-deposit.command.ts
│   ├── apply-wallet-credit.command.ts
│   ├── create-wallet-adjustment.command.ts
│   ├── refund-wallet.command.ts
│   └── process-overpayment.command.ts
├── actions/wallet.actions.ts
└── components/
    ├── student-wallet-card.tsx         # Card shown on student detail page
    ├── wallets-table.tsx               # Org-wide wallet list
    ├── wallet-transactions-table.tsx   # Transaction history table
    ├── deposit-drawer.tsx              # Sheet form for deposits
    ├── apply-credit-drawer.tsx         # Sheet form for applying credit
    └── adjustment-drawer.tsx           # Sheet form for adjustments
```

## UI Routes

| Route | Description |
|-------|-------------|
| `/student-wallets` | All wallets in the organization with search and status filter |
| `/student-wallets/[walletId]` | Wallet detail: balance, transaction history, deposit/credit/adjust actions |
| `/student-wallets/new?studentId=…` | Auto-creates a wallet and redirects to detail |
| `/students/[studentId]` | Student detail — shows wallet card with balance + recent transactions |

## Multi-Tenancy

- `organizationId` resolved server-side via `requireOrganization()` in every action.
- Never accepted from client input.
- All repository queries include `organizationId` in every `where` clause.
- Cross-tenant validation: when applying credit, the command verifies the invoice's `studentId` matches the wallet's `studentId` and both belong to the active organization.

## Balance Derivation

```ts
// Repository
const result = await db.studentWalletTransaction.aggregate({
  where: { studentWalletId: walletId },
  _sum: { amount: true },
});
const balance = result._sum.amount?.toNumber() ?? 0;
```

The `StudentWallet.balance` field in the domain type is computed at read time — it is not persisted in the database.
