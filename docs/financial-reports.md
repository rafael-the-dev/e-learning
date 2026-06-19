# Financial Reports

Read-only reporting layer that queries, aggregates, and exports financial data. Reports never create invoices, confirm payments, alter allocations, modify wallet balances, or fix integrity issues.

---

## Available Reports

| Route | Report | Description |
|---|---|---|
| `/reports/finance/accounts-receivable` | Contas a Receber | Open invoices with outstanding balances |
| `/reports/finance/aging` | Análise de Aging | Outstanding debt segmented by age buckets |
| `/reports/finance/payments` | Relatório de Pagamentos | Confirmed payments with method breakdown and trends |
| `/reports/finance/refunds` | Relatório de Reembolsos | Refunds by status, method, and timeline |
| `/reports/finance/cash-flow` | Fluxo de Caixa | Ledger-only cash flow: inflows, reversals, refunds |
| `/reports/finance/student-statement/[studentId]` | Extrato do Aluno | Full financial history per student |
| `/reports/finance/reconciliation` | Reconciliação Financeira | Live ledger-vs-source comparison for auditors |
| `/reports/finance/closing` | Fecho Financeiro | Executive control dashboard — trust score, watchlist, control summary |
| `/reports/finance/revenue-trend` | Tendência de Receita | Month-over-month invoiced/collected/refunded evolution |
| `/reports/finance/wallet-liability` | Carteiras — Passivo Financeiro | Organisation-wide liability held in student wallet credit |
| `/reports/finance/taxes` | Relatório de Impostos | Tax collected and tax exposure by period, rule, branch, and invoice |
| `/reports/finance/discounts` | Descontos e Fuga de Receita | Discounted revenue, leakage rate, and impact by rule, branch, and course |
| `/reports/finance/payment-methods` | Mix de Métodos de Pagamento | How money enters the organisation, by payment method, branch, and month |
| `/reports/finance/refund-analysis` | Análise de Reembolsos | Executive analytics on refunds — volume, exposure, efficiency, and trends |

---

## RBAC

| Permission | Roles | Covers |
|---|---|---|
| `financialReports.view` | ORG_ADMIN, SECRETARY | All Phase 1 reports, Revenue Trend, Wallet Liability, Tax Report, Discount Report, Payment Method Mix Report, Refund Analysis Report |
| `financialReports.export` | ORG_ADMIN, SECRETARY | CSV export for all Phase 1 reports |
| `financialReports.studentStatement.view` | ORG_ADMIN, SECRETARY | Student Financial Statement |
| `financialReports.integrity.view` | ORG_ADMIN | Integrity warning banner only |
| `financialReports.reconciliation.view` | ORG_ADMIN | Financial Reconciliation Report |
| `financialReports.closing.view` | ORG_ADMIN | Financial Closing Dashboard |

---

## Tenant Isolation

All queries include `organizationId` derived server-side from the authenticated session (`requirePermission`). `organizationId` is never read from client input (URL params, query strings, or request bodies).

---

## Accounts Receivable

**Data source:** `Invoice` where `balanceAmount > 0` and `status NOT IN ('CANCELLED', 'PAID')`

**KPI formulas:**

| KPI | Formula |
|---|---|
| Total a Receber | SUM(balanceAmount) for all open invoices |
| Em Atraso | SUM(balanceAmount) for invoices where dueDate < today (computed at runtime, not from `status`) |
| Vencem em 7 dias | SUM(balanceAmount) for invoices where dueDate in (today, today+7]; excludes null-dueDate |
| Pagamento Parcial | COUNT invoices where `status = 'PARTIALLY_PAID'` |
| Alunos com Dívida | COUNT DISTINCT studentId for open invoices |

**Aging bucket** is computed from `dueDate` at query time (see Aging section). It is not stored and is not derived from `status` (which may lag if the daily job hasn't run).

**Pagination with agingBucket filter:** When the `agingBucket` filter is active, all matching invoices are fetched first, bucket-filtered in memory, then the requested page is sliced. This is required because the bucket value is computed at runtime. Without this, DB-level `OFFSET/LIMIT` would slice before the bucket filter, producing wrong `total` counts and incomplete pages.

---

## Aging Analysis

**Data source:** Same as Accounts Receivable — open invoices with outstanding balances.

**Bucket rules** (computed in `src/modules/reports/finance/utils/aging-calc.ts`):

| Bucket | Condition |
|---|---|
| `current` | dueDate is null, today, or in the future |
| `1-30` | dueDate is 1–30 days in the past |
| `31-60` | dueDate is 31–60 days in the past |
| `61-90` | dueDate is 61–90 days in the past |
| `90+` | dueDate is more than 90 days in the past |

Bucket boundaries are **inclusive**: a dueDate exactly 30 days ago is in `1-30`; 31 days ago falls in `31-60`.

**daysOverdue** = `max(0, floor((today - dueDate) / 86400000))`. Returns 0 when dueDate is in the future or null.

---

## Payments Report

**Data source:** `Payment` where `status = 'CONFIRMED'`

**Key formulas:**

| KPI | Formula |
|---|---|
| Total Recebido (gross) | SUM(payment.totalAmount) |
| Total Reembolsado | SUM(Refund.amount WHERE status=COMPLETED AND parent payment status=CONFIRMED) |
| Recebido Líquido | totalReceived − refundedTotal |
| Média por Pagamento | totalReceived / paymentsCount |
| Recebido em Numerário | SUM(splits.amount) where method = 'CASH' |
| Mobile Money | SUM(splits.amount) where method IN ('MPESA', 'EMOLA') |
| Transferência Bancária | SUM(splits.amount) where method = 'BANK_TRANSFER' |

**Method breakdown** and **monthly trend** are derived from `PaymentSplit` records grouped in memory — no raw-SQL aggregation.

**Method coverage gap:** The schema allows methods POS, CARD, CHEQUE, and OTHER. These appear in the per-method breakdown table but are not reflected in the named KPIs (Numerário / Mobile Money / Transferência). The sum of the three named KPIs may therefore be less than `totalReceived` when these methods are used.

**Divergence from Refund Report:** If a payment transitions status CONFIRMED → REFUNDED after its refund is completed, it drops out of this report's scope (filter is `status = CONFIRMED`). Its completed refunds remain visible in the Refund Report. The two reports therefore answer different questions: Payments Report = "of confirmed payments, how much was refunded?"; Refund Report = "how much was refunded regardless of current payment status?"

---

## Refunds Report

**Data source:** `Refund` where `deletedAt IS NULL`

| KPI | Formula |
|---|---|
| Total Reembolsado | SUM(amount) for status = 'COMPLETED' |
| Reembolsos Concluídos | COUNT where status = 'COMPLETED' |
| Reembolsos Pendentes | COUNT where status = 'REQUESTED' |
| Aprovados não Concluídos | COUNT where status = 'APPROVED' |
| Devolução em Numerário | COUNT where refundMethod = 'CASH_RETURN' (COMPLETED only) |
| Crédito em Carteira | COUNT where refundMethod ≠ 'CASH_RETURN' (COMPLETED only) |

Branch context comes directly from `Refund.branchId` — not through a payment relation.

---

## Student Financial Statement

**Seven data sections per student:**

1. **KPIs** — totalInvoiced, totalPaid, creditApplied, totalRefunded, walletBalance, outstandingBalance
2. **Faturas** — all `Invoice` records for the student (including CANCELLED, for full audit trail)
3. **Pagamentos** — all `Payment` records (confirmed and pending)
4. **Recibos** — all `Receipt` records (1:1 with Payment)
5. **Carteira** — `StudentWalletTransaction` history via `StudentWallet`
6. **Reembolsos** — all `Refund` records for the student
7. **Livro-Razão** — `FinancialTransaction` ledger (capped at 200 entries, field: `transactionNumber`)

All date-range filters apply across all sections simultaneously.

**KPI formulas:**

| KPI | Source | Notes |
|---|---|---|
| Total Faturado | SUM(Invoice.totalAmount) WHERE status ≠ CANCELLED | Excludes voided invoices |
| Total Pago | SUM(Payment.totalAmount) WHERE status IN (CONFIRMED, PARTIALLY_REFUNDED, REFUNDED) | Cash / bank payments received — includes subsequently refunded payments so the identity holds |
| Crédito Aplicado | SUM(CreditApplication.amount) | Wallet credit applied to invoices; no Payment record created |
| Total Reembolsado | SUM(Refund.amount) WHERE status = COMPLETED | |
| Saldo Carteira | StudentWallet.balance | Live balance at time of query |
| Saldo Devedor | SUM(Invoice.balanceAmount) WHERE status ≠ CANCELLED | |

**Accounting identity:** `Total Faturado = Total Pago + Crédito Aplicado + Saldo Devedor` (approximately — small differences can appear from discount/tax adjustments made post-payment). Refunds do not break this identity because `Total Pago` counts all payments that were received (including subsequently refunded ones), and `Saldo Devedor` is not reversed by refunds.

**Why creditApplied is separate from totalPaid:** `apply-wallet-credit` creates a `CreditApplication` with no `paymentId`, directly reducing `Invoice.paidAmount` and `Invoice.balanceAmount`. Without a `creditApplied` KPI, a student who settled 200 MZN via wallet credit would show `Saldo Devedor = 0` but `Total Pago < Total Faturado` with no reconciling item visible.

---

## CSV Export

- Route: `GET /api/reports/finance/export/[reportType]`
- Valid report types: `accounts-receivable`, `aging`, `payments`, `refunds`
- Maximum rows: **5 000** (configurable via `MAX_EXPORT_ROWS` constant)
- Response: `Content-Type: text/csv; charset=utf-8` with `Content-Disposition: attachment`
- Permission required: `financialReports.export`
- All values are escaped per RFC 4180 (commas, quotes, and newlines in cell values are handled)
- Amounts use dot decimal separator (`toFixed(2)`) for machine-readable CSV compatibility — not the `toLocaleString("pt-PT")` comma format used in the UI
- Dates use DD/MM/YYYY format

---

## Audit Trail

Every report view and export emits an audit log event:

| Event | Trigger |
|---|---|
| `financial_report.viewed` | API route called for any report |
| `financial_report.exported` | Export route called |
| `student_statement.viewed` | Student statement API route called |

Audit entries include `organizationId`, `userId`, `reportType`, applied filters, and timestamp.

---

## Integrity Warning Banner

Every report page queries:

```ts
db.financialIntegrityIssue.count({
  where: { organizationId, severity: "CRITICAL", status: "OPEN", deletedAt: null }
})
```

If `criticalCount > 0`, a destructive `Alert` is rendered at the top of the page:

> "Existem N problema(s) crítico(s) de integridade financeira. Aceda à página de Integridade para mais detalhes."

The banner does not block report generation. Permission to see the full integrity report requires `financialReports.integrity.view` (ORG_ADMIN only).

---

## Reconciliation Boundaries

These are known, intentional divergences between reports and the ledger. They are not bugs.

| Comparison | Gap | Reason |
|---|---|---|
| Payments Report `totalReceived` vs SUM(PAYMENT_RECEIVED) | Payments Report is lower once refunds exist | `buildPaymentWhere` filters `status = CONFIRMED`; refunded payments transition to REFUNDED/PARTIALLY_REFUNDED and exit the report |
| Payments Report KPI vs Cash Flow `totalCashIn` | Same as above | Cash Flow reads the immutable ledger; Payments Report reads current payment status |
| Refund Report `totalRefunded` vs SUM(REFUND_DISBURSED) for same date range | May differ | Refund Report date filter uses `Refund.createdAt` (request date); Cash Flow uses `FinancialTransaction.occurredAt` (completion time). Without date filters they match |
| AR `totalReceivable` KPI vs SUM of filtered table rows | KPI is higher | KPI ignores `agingBucket`, `invoiceStatus`, `search` filters — it shows the global open balance |
| Student Statement `outstandingBalance` after a full refund | Shows 0 despite money returned | Refund does not reverse invoice balances; that is a design choice (refund ≠ cancellation) |
| Student Statement `totalPaid` | Includes payments with status CONFIRMED, PARTIALLY_REFUNDED, REFUNDED | Fix applied: `totalPaid` now counts all payments that were received regardless of subsequent refund |

**Cash Flow cannot be filtered by branch.** `FinancialTransaction` has no `branchId` column and no Prisma relation to `Payment` or `Refund`. The ledger is organisation-wide only. Date and student filters are supported.

---

## Cash Flow Report

**Source:** `FinancialTransaction` only — no joins to operational tables.

**Transaction types included:**

| Type | Direction | Meaning |
|---|---|---|
| `PAYMENT_RECEIVED` | CREDIT | Cash received from students |
| `PAYMENT_CANCELLED` | DEBIT | Reversal of a previously confirmed payment |
| `REFUND_DISBURSED` | DEBIT | Refund paid out (both CASH_RETURN and WALLET_CREDIT method) |

**Types explicitly excluded:**

| Type | Reason |
|---|---|
| `INVOICE_CREATED` | Revenue recognition entry — no cash changes hands |
| `INVOICE_CANCELLED` | Reversal of above — no cash changes hands |
| `RECEIPT_ISSUED` | Documentation event; same amount as its `PAYMENT_RECEIVED` — would double-count |
| `WALLET_CREDIT` | Overpayment liability created; the cash was already counted in `PAYMENT_RECEIVED` |
| `CREDIT_APPLIED` | Wallet balance reducing receivable — internal transfer, no new cash |
| `WALLET_DEBIT` | Wallet disbursement to student — separately tracked, rare in this domain |

**KPI formulas:**

| KPI | Formula |
|---|---|
| Total Entradas | SUM(amount WHERE type = PAYMENT_RECEIVED) |
| Cancelamentos | SUM(amount WHERE type = PAYMENT_CANCELLED) |
| Reembolsos | SUM(amount WHERE type = REFUND_DISBURSED) |
| Fluxo Líquido | Total Entradas − Cancelamentos − Reembolsos |

**Known limitation:** `REFUND_DISBURSED` entries are written regardless of refund method (CASH_RETURN or WALLET_CREDIT). For WALLET_CREDIT refunds, no actual cash leaves — the student's wallet balance increases. The cash flow report currently includes both, which may overstate cash outflows. The ledger's `description` field contains the method label but it is not queryable as a structured field.

**Date semantics:** `FinancialTransaction.occurredAt` for `PAYMENT_RECEIVED` entries is set to `payment.paymentDate` (the business date the payment was entered, not the wall-clock confirmation time). For `REFUND_DISBURSED`, `occurredAt` is the completion timestamp.

---

## Ledger Consistency Review

### Why Payments Report stays on operational tables

The Payments Report requires per-split method breakdown (CASH / MPESA / EMOLA / BANK_TRANSFER). `PaymentSplit` data is not written to `FinancialTransaction` — each `PAYMENT_RECEIVED` entry records only the total amount. Migrating to ledger-only would make method breakdown impossible.

Additionally, the Payments Report filters by `Payment.paymentDate` (business date). Before the `occurredAt` fix (described below), ledger entries used wall-clock confirmation time, which diverges for backdated payments.

**Recommendation:** Keep Payments Report on `Payment + PaymentSplit + Refund`. Use the ledger only as a reconciliation cross-check (e.g., detect confirmed payments with no `PAYMENT_RECEIVED` entry — which is the Integrity Check module's job).

### Why Refund Report stays on operational tables

`FinancialTransaction` has no `refundMethod` field. Method breakdown (CASH_RETURN vs WALLET_CREDIT) is embedded in the `description` text and is not queryable. Additionally, `REFUND_DISBURSED` entries exist only for completed refunds — the report also needs REQUESTED and APPROVED counts, which have no ledger entries (they haven't been disbursed yet).

**Recommendation:** Keep Refund Report on the `Refund` table.

### `occurredAt` fix in confirm-payment.command.ts

Before this fix, `recordPaymentReceived` was called without `occurredAt`, so ledger entries defaulted to `new Date()` — the wall-clock time the payment was confirmed, not the business date the payment was entered.

**Impact:** Any payment backdated to a previous period would appear in the current period in the ledger. The Payments Report (which uses `Payment.paymentDate`) and the Cash Flow Report (which uses `FinancialTransaction.occurredAt`) would disagree on which period a backdated payment belongs to.

**Fix applied:** `confirm-payment.command.ts` now passes `occurredAt: payment.paymentDate` to `recordPaymentReceived`. The `recordPaymentReceived` function accepts the optional `occurredAt` and forwards it to `appendLedgerEntry`.

---

## Financial Closing Dashboard

**Route:** `/reports/finance/closing` · **Permission:** `financialReports.closing.view` (ORG_ADMIN, SUPER_ADMIN — not SECRETARY, TEACHER, or STUDENT)

**Purpose:** an executive, CFO-level control view that answers "can we trust the financial numbers right now?" before a books closing. It is **not a transactional page** and **never computes a new financial fact** — it only aggregates numbers already produced by the Integrity, Reconciliation, Accounts Receivable, Cash Flow, and Wallet repositories. If a number looks wrong here, the fix belongs in the report that owns that number, not in the closing dashboard.

### Data Sources

| Section | Reused from |
|---|---|
| Gross Invoiced / Gross Collected | Dedicated lean SQL aggregates over `Invoice` / `Payment` (see "Why not reuse the existing report KPIs" below) |
| Net Cash Position / Trend | `cash-flow.repository.ts` → `getCashFlowMonthlyTrend` (unmodified, reused as-is) |
| Outstanding / Overdue / Due Soon Receivables | `accounts-receivable.repository.ts` → `getAccountsReceivableKPIs` (unmodified, reused as-is) |
| Wallet Liability | New SQL aggregate (positive balances only) — see formula below |
| Refund Exposure | New SQL aggregate over `Refund` |
| Critical Financial Issues / Integrity Status | New SQL aggregate over `FinancialIntegrityIssue`, scoped by `status = 'OPEN'` (same "open" definition as the Integrity Report and the report-hub warning banner) |
| Reconciliation Summary | `reconciliation.repository.ts` → `getReconciliationKPIs` + `listReconciliationIssues` (unmodified, reused as-is) |
| Closing Watchlist | Composes all of the above into one ranked list |

### Why not reuse the existing report KPIs verbatim

`getPaymentsReportKPIs` and `getCashFlowKPIs` (the JS-aggregating variant, not `getCashFlowMonthlyTrend`) both hydrate every matching row via `findMany` and sum in JavaScript — acceptable for their own report pages, but too costly to run a second time just to produce one executive KPI at 100k-payment / 500k-transaction scale. **Gross Collected** is therefore computed as a dedicated single-row `SUM(Payment.totalAmount) WHERE status = 'CONFIRMED'` SQL aggregate (same "gross" definition documented under Payments Report above), and **Net Cash Position** is derived by summing the already-SQL-aggregated monthly points from `getCashFlowMonthlyTrend` rather than re-running a JS-side aggregation.

### KPI Formulas

| KPI | Formula |
|---|---|
| Total Faturado (Gross Invoiced) | SUM(Invoice.totalAmount) WHERE status ≠ CANCELLED |
| Total Cobrado (Gross Collected) | SUM(Payment.totalAmount) WHERE status = CONFIRMED |
| Posição de Caixa Líquida (Net Cash Position) | SUM of the Cash Flow Report's monthly `net` points (cash in − cash out) over the filtered range |
| Recebíveis em Aberto (Outstanding Receivables) | Accounts Receivable Report's `totalReceivable` |
| Recebíveis Vencidos (Overdue Receivables) | Accounts Receivable Report's `overdueReceivable` |
| Passivo de Carteiras (Wallet Liability) | SUM of **positive** per-student wallet balances only — a wallet with a negative computed balance is a data-integrity defect (flagged separately by the Integrity engine's `wallet.negative_balance` check), never a liability |
| Exposição a Reembolsos (Refund Exposure) | SUM(Refund.amount) WHERE status IN (REQUESTED, APPROVED) — a point-in-time liability snapshot, not a period flow |
| Problemas Financeiros Críticos (Critical Financial Issues) | COUNT(FinancialIntegrityIssue) WHERE status = OPEN AND severity = CRITICAL |

### Trust Score Formula

A single 0–100 executive indicator. Starts at 100; each condition below subtracts a fixed number of points (additive, not compounding):

| Condition | Points |
|---|---|
| Unresolved CRITICAL integrity issues exist (`status = OPEN`) | −25 |
| Unresolved HIGH integrity issues exist (`status = OPEN`) | −15 |
| Critical reconciliation mismatches exist (Reconciliation KPI `criticalIssues > 0`) | −20 |
| Duplicate ledger entries exist | −10 |
| Orphan ledger entries exist | −10 |
| A wallet-liability mismatch exists (an OPEN `FinancialIntegrityIssue` with `category = WALLET_BALANCE`) | −10 |

Result is clamped to `[0, 100]` (defensive — today's weights sum to 90, so 10 is the realistic floor, but the clamp protects against future weight changes). Rating bands:

| Score | Rating |
|---|---|
| 90–100 | Saudável (Healthy) |
| 70–89 | Requer Revisão (Needs Review) |
| 40–69 | Arriscado (Risky) |
| 0–39 | Inseguro (Unsafe) |

A destructive banner is shown on the page when the score is below 70, and an additional critical banner when below 40. Implementation: `src/modules/reports/finance/utils/trust-score.ts` (pure function, no DB access — see its unit tests for the exact per-condition arithmetic).

### Closing Watchlist

Combines, ranks (CRITICAL → HIGH → MEDIUM → LOW, then most recent first), and caps at 20 total items:

| Source | Per-category cap | Notes |
|---|---|---|
| Open CRITICAL integrity issues | 5 | |
| Open HIGH integrity issues | 5 | |
| CRITICAL reconciliation mismatches | 5 | via `listReconciliationIssues({ severity: "CRITICAL" })` |
| Duplicate ledger entries | 5 | |
| Orphan ledger entries | 5 | |
| Wallet balances above 5 000 MZN | 5 | threshold is a named constant, not user-configurable today |
| Pending refunds (REQUESTED/APPROVED) above 5 000 MZN | 5 | |
| Overdue receivables above 10 000 MZN | 5 | severity escalates to HIGH past 60 days overdue |

### Filter Applicability

Supported filters: date range, branch, academic year, academic term. **Not every section honours every filter** — documented here rather than silently ignored:

| Filter | Applies to | Does **not** apply to | Reason |
|---|---|---|---|
| Branch | Gross Invoiced, Gross Collected, Outstanding/Overdue Receivables, Refund Exposure watchlist, Overdue Receivables watchlist | Net Cash Position/Trend, Wallet Liability KPI, Critical Financial Issues, Reconciliation Summary (ledger-only checks) | `FinancialTransaction` and `FinancialIntegrityIssue` have no `branchId` column |
| Academic Year / Term | Gross Invoiced, Gross Collected, Outstanding/Overdue Receivables | Everything else | Only `Invoice`/`Payment` carry an `enrollmentId` this dashboard joins through; ledger and integrity rows do not |
| Date Range | Gross Invoiced (`issueDate`), Gross Collected (`paymentDate`), Net Cash Trend (`occurredAt`), Critical Financial Issues / Integrity watchlist (`detectedAt`), Reconciliation Summary (`occurredAt`), Refunds "Completed This Period" (`completedAt`) | Wallet Liability, Refund Exposure (pending) | Both are current-balance/liability snapshots, not period flows — there is no historical wallet-balance snapshot to query |

### Reconciliation & Integrity Dependency

The Closing Dashboard does not reimplement either engine:
- **Reconciliation Summary** calls `getReconciliationKPIs` and `listReconciliationIssues` directly from `reconciliation.repository.ts` — the same functions backing `/reports/finance/reconciliation`.
- **Integrity Status** queries `FinancialIntegrityIssue` with the same `status = 'OPEN'` definition already used by `getIntegrityReportKPIs` and the report-hub warning banner, scoped down to date filtering (which the existing Integrity Report KPI does not support, since it always shows the current open count).

If either underlying report changes its detection logic, the Closing Dashboard picks up the change automatically with no code changes here.

### Export Scope

`GET /api/reports/finance/export/closing` — an **executive summary export**, not a ledger dump:

- Three columns: `Secção`, `Métrica`, `Valor`.
- Includes: all 8 KPIs, the trust score (+ its per-reason deductions), the full Financial Control Summary, the Reconciliation Summary, and every Closing Watchlist item (one row each, fields concatenated into `Valor`).
- Does **not** include raw `FinancialTransaction`, `Invoice`, or `Payment` rows — those are already exportable from their own dedicated report pages.
- Always a single batch (the row count is bounded by definition: 8 KPIs + ~10 trust/control rows + ≤20 watchlist rows), unlike the paginated multi-batch exports used by the transactional reports.
- Audit metadata additionally records `trustScore` and `trustRating` alongside the standard `reportType` / `filters` / `generatedBy` / `generatedAt` fields already captured by every export.

## Wallet Liability Report

**Route:** `/reports/finance/wallet-liability` · **Permission:** `financialReports.view` (same tier as the other operational reports — wallet liability is not treated as more sensitive than, say, Accounts Receivable, so no dedicated permission was added)

### Wallet credit is a liability

If a student holds +10 000 MZN of wallet credit, the organisation owes that value back as future service credit, a future payment offset, or a possible cash refund. **Only positive balances count as liability.** A *negative* wallet balance is never treated as "negative liability" — it is a data-integrity defect (the same `wallet.negative_balance` condition the Integrity engine already detects) and is surfaced on this report's Watchlist as CRITICAL, not folded into the KPI totals.

### Wallet Activity vs. Wallet Liability

| | Wallet Activity (`/reports/finance/wallets`) | Wallet Liability (`/reports/finance/wallet-liability`) |
|---|---|---|
| Question | What movements happened? | How much do we currently owe, and where is it concentrated/at risk? |
| Shape | Transaction-level ledger view | Liability/exposure view — KPIs, trend, concentration, watchlist |
| Negative balances | Shown like any other balance | Excluded from liability totals; flagged CRITICAL on the Watchlist |

Both reports read the same two tables (`StudentWallet`, `StudentWalletTransaction`); Wallet Liability adds branch/course attribution, dormancy, and integrity awareness on top.

### KPI Formulas

| KPI | Formula | Scope |
|---|---|---|
| Passivo Total (Total Wallet Liability) | SUM(currentBalance) WHERE currentBalance > 0 | All-time |
| Alunos com Crédito (Students With Credit) | COUNT(wallets) WHERE currentBalance > 0 | All-time |
| Saldo Médio Positivo (Average Positive Balance) | Passivo Total ÷ Alunos com Crédito (0 when no students have credit) | All-time |
| Maior Saldo (Largest Wallet Balance) | MAX(currentBalance) over positive wallets | All-time |
| Créditos Emitidos no Período (Credits Issued This Period) | SUM(amount) WHERE amount > 0, within the date filter | Date-range |
| Créditos Consumidos no Período (Credits Consumed This Period) | ABS(SUM(amount)) WHERE amount < 0, within the date filter | Date-range |
| Movimento Líquido (Net Wallet Movement) | Créditos Emitidos − Créditos Consumidos | Date-range |
| Carteiras Dormentes (Dormant Wallets) | COUNT(wallets) WHERE currentBalance > 0 AND lastTransactionDate older than 90 days | currentBalance is all-time; the 90-day threshold is evaluated against `GETDATE()`, not the date filter |

### Filter Semantics

| Filter | Applies to |
|---|---|
| `currentBalance` (KPI #1/#4, table sort/HAVING, dormancy eligibility) | **Always all-time**, regardless of the date range filter |
| `creditsIssued` / `creditsConsumed` / `netMovement` (KPI #5–#7, table columns, trend chart) | **Date-range scoped** — all-time when no date filter is supplied |
| Dormancy (`lastTransactionDate`, `daysDormant`) | **Always all-time** — the date range filter never changes which wallets count as dormant |
| Branch / Course / Student | Apply uniformly to every KPI, the table, the trend, and the branch/course breakdowns |

### Branch / Course Attribution

- **Branch**: taken directly from `Student.branchId`. A student with no branch shows as "Sem Filial".
- **Course**: resolved from the student's **most recent ACTIVE `Enrollment`** (`ROW_NUMBER() OVER (PARTITION BY studentId ORDER BY enrollmentDate DESC, createdAt DESC)`, `rn = 1`). If a student has multiple active enrollments, only the most recent one is used — they are **not** split into a "Multiple Courses" bucket (the simpler, deterministic choice; every wallet appears in exactly one course breakdown row). A student with no ACTIVE enrollment shows as "Sem Curso".

### Dormancy Definition

A wallet is dormant once `DATEDIFF(day, MAX(StudentWalletTransaction.createdAt), GETDATE())` exceeds a threshold. Three different thresholds are used across the report, all computed from the same expression:

| Context | Threshold |
|---|---|
| KPI #8 "Dormant Wallets" | ≥ 90 days |
| Watchlist MEDIUM | ≥ 90 days (and < 180) |
| Watchlist HIGH | ≥ 180 days |
| `dormantDays` filter | user-supplied (table/export only) |

A wallet with zero transactions (`lastTransactionDate IS NULL`) never matches a dormancy condition — `DATEDIFF` against `NULL` is `NULL`, which SQL treats as unknown/false.

### Watchlist

| Severity | Criteria |
|---|---|
| CRITICAL | Negative wallet balance, **or** an OPEN `FinancialIntegrityIssue` with `category = WALLET_BALANCE` or `checkName = wallet_transaction.missing_wallet` (severity taken from the stored issue, so it may also surface as HIGH) |
| HIGH | currentBalance ≥ 50 000 MZN, or dormant ≥ 180 days with a positive balance |
| MEDIUM | currentBalance ≥ 10 000 MZN (and < 50 000), or dormant 90–179 days with a positive balance |
| LOW | "Concentration" — a wallet holding more than 5% of total wallet liability while still under 10 000 MZN (an informational signal for organisations with a small total liability pool, where one student's balance is disproportionate even though it's not absolutely large) |

A student can appear more than once (e.g. both "large balance" and "dormant") — each row states its own reason, by design.

### Integrity Warning

If any OPEN **CRITICAL** `FinancialIntegrityIssue` exists with `category = WALLET_BALANCE` or `checkName = wallet_transaction.missing_wallet`, a banner is shown at the top of the page:

> "Existem inconsistências críticas em carteiras. O passivo pode não reflectir a realidade."

This is independent of the generic org-wide Integrity Warning Banner (which checks *any* category) — the wallet-specific banner only reacts to wallet-related categories, since a critical issue in, say, `RECEIPT_INTEGRITY` should not make a finance user distrust the wallet liability numbers specifically.

### Tenant Isolation

`organizationId` always comes from `requirePermission()`'s server-side context, never from client input. Cross-tenant `branchId`/`courseId`/`studentId` values are not pre-validated with an extra round trip — every query ANDs `organizationId` together with the other filters, so a value belonging to a different organisation simply matches zero rows. This is the same approach used by every other report in this module.

### Export Scope

`GET /api/reports/finance/export/wallet-liability` — combines all three required sections (KPI summary, watchlist, and the full per-wallet table) in **one CSV** using a leading `Tipo` (Type) column (`KPI` / `Vigilância` / `Carteira`) so a downstream consumer can filter by section:

- `KPI` and `Vigilância` rows are bounded and only ever appear once, on the first page.
- `Carteira` rows are the properly paginated, filtered, sorted per-wallet table — the same `listWalletLiabilityRows()` call the interactive table uses — so the export can scale to the full student population without loading it into memory at once.
- Audit metadata additionally records `totalLiability` alongside the standard `reportType` / `filters` / `generatedBy` / `generatedAt` / `totalCount` / `rowLimit` / `truncated` fields already captured by every export.

### Performance

`HAVING` (never `WHERE`, since the predicates are on aggregated columns), pagination (`OFFSET`/`FETCH NEXT`), and sorting (`ORDER BY`) all happen in the same SQL statement as the `GROUP BY studentWalletId`-equivalent aggregation (grouped by wallet, joined through `Student`/`Branch`/the active-enrollment CTE/`Course`). No raw `StudentWalletTransaction` rows are ever loaded into the application — every KPI, the table, both breakdown charts, and the trend chart are single aggregated queries (mirroring the same SQL-aggregation discipline used by the Closing Dashboard and Revenue Trend reports).

## Tax Report

**Route:** `/reports/finance/taxes` · **Permission:** `financialReports.view` (same tier as the other operational reports — no dedicated tax permission was added)

### Data source

`AppliedTax` is an **immutable snapshot** of the tax computed at invoice-generation time (see `generate-invoice-from-enrollment.command.ts` → `billing-calculator.service.ts`, where `amount = base * (rate / 100)` is calculated once and stored alongside the `rate` used). This report never recomputes tax — it only aggregates what was already applied. It reads `AppliedTax`, `TaxRule`, `Invoice`, `Branch`, `Student`, and `Enrollment`/`Course` (for attribution); it never reads or infers anything from `InvoiceItem`, since line items carry no tax-rule association in this schema.

### Taxable base derivation

`AppliedTax` has no stored `base` column. Rather than inventing a new formula, the report derives the taxable base **algebraically from the exact relationship already used to compute the tax**:

```
taxableBase = amount / (rate / 100)
```

Implemented in SQL as `CASE WHEN at.rate <> 0 THEN CAST(at.amount AS FLOAT) / (CAST(at.rate AS FLOAT) / 100) ELSE 0 END` — the `rate <> 0` guard avoids a divide-by-zero; a zero-rate applied tax (if one ever exists) contributes 0 to both `taxAmount` and `taxableBase`.

### Reporting date basis

`Invoice.issueDate` is the reporting date axis for every KPI, chart, and the table — never `AppliedTax.createdAt`, `Payment.paymentDate`, or any payment-collection date. Tax is recognised when the invoice is issued, not when it is paid.

### Cancellation rules

`Invoice.status <> 'CANCELLED'` is applied by default everywhere (KPIs, breakdowns, trend, table). Supplying the `invoiceStatus` filter switches this to an exact match (e.g. `status = 'PAID'`) instead of the exclusion — matching the same pattern used by Accounts Receivable.

### KPI Formulas

| KPI | Formula | Granularity |
|---|---|---|
| Total de Imposto (Total Tax Amount) | SUM(AppliedTax.amount) | Applied-tax level |
| Base Tributável (Taxable Base) | SUM(amount / (rate/100)) | Applied-tax level |
| Total Faturado (Gross Invoiced) | SUM(Invoice.totalAmount) for every invoice in scope (regardless of whether it has any tax applied) | Invoice level — never inflated by invoices carrying multiple `AppliedTax` rows |
| Faturas com Imposto (Taxed Invoices Count) | COUNT(invoices) that have at least one `AppliedTax` row | Invoice level |
| Taxa Efectiva Média (Average Effective Tax Rate) | Total de Imposto ÷ Base Tributável × 100 (0 when the base is 0) — a liability-weighted average, not an unweighted mean of `AppliedTax.rate` | Derived |
| Isento / Sem Imposto (Exempt / Zero Tax Amount) | SUM(Invoice.totalAmount) for invoices in scope that have **no** `AppliedTax` row at all | Invoice level |

"Gross Invoiced" and "Exempt" are computed from a **separate, invoice-rooted** query (not the applied-tax-rooted query used for the other four KPIs) specifically to avoid double-counting an invoice that carries more than one applied tax (e.g. two different tax rules on the same invoice).

### Filter Semantics

When a `taxRuleId` filter is supplied, "Gross Invoiced"/"Taxed Invoices Count"/"Exempt" are scoped down to only the invoices that have *that* tax rule applied (via an `EXISTS` against `AppliedTax`), so the KPI block stays internally consistent with the rest of the page rather than mixing a tax-rule-filtered tax total against an unfiltered invoice total. Branch/Course/Academic Year/Academic Term/Date filters apply identically across every KPI, chart, and the table.

### Branch / Course Attribution

Same as Accounts Receivable: **Branch** comes directly from `Invoice.branchId`; **Course** comes from the invoice's own `enrollmentId` → `Enrollment.courseId` (a fixed 1:1 link already on the invoice, so — unlike Wallet Liability — there is no "most recent active enrollment" ambiguity to resolve here).

### Charts

| Chart | Source | Notes |
|---|---|---|
| Imposto por Mês (Tax by Month) | Monthly `GROUP BY CONVERT(VARCHAR(7), Invoice.issueDate, 120)` over `AppliedTax` | Sparse — only months with data are returned; not zero-filled (unlike Revenue Trend) since this was not part of the spec for this report |
| Imposto por Regra Fiscal (Tax by Rule) | `GROUP BY AppliedTax.taxRuleId` | |
| Imposto por Filial (Tax by Branch) | `GROUP BY Invoice.branchId` | Falls back to "Sem Filial" |
| Tendência da Taxa Efectiva (Effective Tax Rate Trend) | Same monthly rows as "Tax by Month" | `effectiveTaxRate = taxAmount / taxableBase × 100` per month, computed alongside the SQL aggregation, not in a separate pass |

### Export Scope

`GET /api/reports/finance/export/taxes` streams the paginated, filtered, sorted `AppliedTax`-level table (the same `listTaxRows()` call the interactive table uses) — one row per applied tax, joined to its invoice/student/branch/tax-rule. Unlike Wallet Liability or Closing, this report has no watchlist and a single-shape table, so the export needs no KPI/section discriminator column.

### Performance

`GROUP BY`/`SUM`/`COUNT` aggregation, `HAVING`-free filtering (every predicate here is on a non-aggregated column, so plain `WHERE` is sufficient), pagination (`OFFSET`/`FETCH NEXT`), and sorting (`ORDER BY`) all happen in SQL. No raw `AppliedTax` or `Invoice` rows are loaded into the application for KPI/chart computation — `getTaxKPIs` issues exactly two aggregate queries (one rooted at `AppliedTax`, one at `Invoice`, to avoid invoice double-counting) and every breakdown/trend query is a single `GROUP BY`.

## Discount & Revenue Leakage Report

**Route:** `/reports/finance/discounts` · **Permission:** `financialReports.view` (same tier as the other operational reports — no dedicated discount permission was added)

### Discounts are revenue leakage, not a cash outflow

A discount reduces *billed* revenue before collection — it is never treated as a refund (cash already collected, then returned), a wallet credit, or a payment. `AppliedDiscount` is an **immutable snapshot** created at invoice-generation time (`generate-invoice-from-enrollment.command.ts` is the *only* code path that ever creates one — there is no later "apply a discount to an existing invoice" command). The report only aggregates what was already applied; it never recomputes a discount or mutates `Invoice`/`AppliedDiscount` data.

### Data sources

`AppliedDiscount`, `DiscountRule`, `Invoice` (for `subtotal`/`totalAmount`/`createdBy`), `Branch`, `Student`, and `Enrollment`/`Course` (for attribution, via the invoice's own `enrollmentId`). `InvoiceItem` is not read — it carries no discount association in this schema (the same constraint Tax Report documents for tax associations).

### Two schema facts that shape this report

1. **No "manual discount" concept exists.** `AppliedDiscount.discountRuleId` is a required (`NOT NULL`) foreign key, and `DiscountRule.discountType` is only `PERCENTAGE | FIXED_AMOUNT` — there is no `MANUAL` type anywhere in the schema, and no command creates an `AppliedDiscount` without a `DiscountRule`. So **"Manual Discounts" is always 0** (`manualDiscountsAmount`/`manualDiscountsCount`), and the "Manual vs. Automatic" donut always renders 100% automatic. This is a direct consequence of the data model, not an arbitrary choice — see `discount.repository.ts`.
2. **"Applied By" has no dedicated field.** `AppliedDiscount` carries no actor column. The closest available proxy is **`Invoice.createdBy`** — the user who triggered invoice generation, and therefore the automatic application of whichever discount rules were active at that moment. Since invoice generation is the *only* path that creates a discount, this proxy is exact for every row in the current system (there is no scenario where a different user "applied" the discount after the fact).

### Gross Before Discounts uses the stored `Invoice.subtotal`

`Invoice.subtotal` is the gross amount **before discount and before tax** (see `billing-calculator.service.ts`: items are summed into `subtotal`, then discounts reduce it, then tax is added on top of the discounted amount). Because this field is already stored, "Gross Before Discounts" reads it directly — it is **not** estimated from `totalAmount + discountAmount` (the spec's documented fallback for schemas that don't store a pre-discount subtotal; this one does).

One consequence worth flagging: `subtotal` excludes tax while `totalAmount` (used for "Net Invoiced") includes it. So `Net Invoiced` will **not** equal `Gross Before Discounts − Total Discounts` exactly — the difference is the tax amount added after the discount was applied. This is expected, not a bug.

### Date basis

`AppliedDiscount.createdAt` is the date basis for every discount-rooted aggregate (Total Discounts, by-rule/branch/course, monthly trend, the table). Since discounts are created in the very same request as their invoice (no separate manual-entry path — see above), `AppliedDiscount.createdAt` and `Invoice.issueDate` are always the same moment in current data. Invoice-rooted KPIs (Gross Before Discounts, Net Invoiced, Discounted Invoices Count) therefore filter on `Invoice.issueDate` directly, with no risk of date-basis drift between the two roots.

### Cancellation rules

`Invoice.status <> 'CANCELLED'` is applied by default everywhere. Supplying the `invoiceStatus` filter switches to an exact match instead of the exclusion (e.g. `status = 'CANCELLED'` to explicitly include cancelled invoices) — same pattern as Accounts Receivable and Tax Report.

### Double-counting protection (discount-rooted vs. invoice-rooted queries)

An invoice can have more than one `AppliedDiscount` row (stackable discount rules). Two independent WHERE-builders keep every aggregate correct:

- **Discount-rooted** (`buildDiscountWhere`, rooted at `applied_discounts ad`) — used for Total Discounts, Largest Discount, the by-rule/branch/course breakdowns, the monthly trend, the table, and the watchlist. Each `AppliedDiscount` row is counted exactly once.
- **Invoice-rooted** (`buildInvoiceWhere`, rooted at `invoices i`) — used only for Gross Before Discounts, Net Invoiced, and Discounted Invoices Count. An invoice with two discounts is never summed twice, because `i.subtotal`/`i.totalAmount` are read once per invoice row, with discount-matching expressed as a scalar `EXISTS(...)` check rather than a `JOIN` that would multiply rows.

When `discountRuleId`/`discountType`/`minDiscountAmount` filters are active, the invoice-rooted query scopes its `EXISTS` check by those same conditions, so the KPI block stays internally consistent with the discount-rooted aggregates (same pattern Tax Report uses for its `taxRuleId` filter).

### KPI Formulas

| KPI | Formula | Granularity |
|---|---|---|
| Total de Descontos (Total Discounts) | SUM(AppliedDiscount.amount) | Discount level |
| Faturas com Desconto (Discounted Invoices) | COUNT(invoices) with at least one `AppliedDiscount` row | Invoice level |
| Total Antes de Descontos (Gross Before Discounts) | SUM(Invoice.subtotal) | Invoice level — stored field, not estimated |
| Total Faturado / Líquido (Net Invoiced) | SUM(Invoice.totalAmount) | Invoice level (tax-inclusive — see note above) |
| Taxa de Fuga de Receita (Revenue Leakage Rate) | Total de Descontos ÷ Total Antes de Descontos × 100 (0 when the denominator is 0) | Derived |
| Desconto Médio por Fatura (Average Discount Per Invoice) | Total de Descontos ÷ Faturas com Desconto (0 when the denominator is 0) | Derived |
| Maior Desconto (Largest Discount) | MAX(AppliedDiscount.amount) | Discount level |
| Descontos Manuais (Manual Discounts) | Always 0 — see "schema facts" above | N/A |

### Filter Semantics

Branch/Course/Academic Year/Academic Term/Date/Student filters apply identically across every KPI, chart, and the table. `discountRuleId`, `discountType`, and `minDiscountAmount` apply directly in the discount-rooted query and via a scoped `EXISTS` in the invoice-rooted query (see "Double-counting protection"). `appliedBy` filters on `Invoice.createdBy` on both query roots.

### Branch / Course Attribution

Same as Tax Report: **Branch** comes directly from `Invoice.branchId`; **Course** comes from the invoice's own `enrollmentId` → `Enrollment.courseId` (a fixed 1:1 link, so no "most recent active enrollment" ambiguity).

### Charts

| Chart | Source | Notes |
|---|---|---|
| Descontos por Mês (Discounts by Month) | Monthly `GROUP BY CONVERT(VARCHAR(7), AppliedDiscount.createdAt, 120)` | Sparse — not zero-filled, same convention as Tax Report |
| Descontos por Regra (Discounts by Rule) | `GROUP BY AppliedDiscount.discountRuleId` | |
| Descontos por Filial (Discounts by Branch) | `GROUP BY Invoice.branchId` | Falls back to "Sem Filial" |
| Descontos por Curso (Discounts by Course) | `GROUP BY Enrollment.courseId` | Falls back to "Sem Curso" |
| Manual vs. Automático | Derived from KPIs (`manualDiscountsAmount`, always 0) and `totalDiscounts` — no separate query, since the answer is always known from the schema constraint above | |

### Watchlist ("Top Leakage Watchlist")

A single discount-rooted query (no separate generators per source, unlike Wallet Liability) computes a per-row **leakage rate** — the sum of discounts on that invoice (matching the current filters) divided by `Invoice.subtotal` — via a window function in a CTE (SQL Server forbids `OVER` directly inside a `WHERE` clause, so the window result is materialized first and filtered/ordered as a plain column afterward). Severity is whichever tier the row crosses first:

| Severity | Single-discount amount | OR invoice leakage rate |
|---|---|---|
| CRITICAL | ≥ 50,000 MZN | ≥ 50% |
| HIGH | ≥ 10,000 MZN | ≥ 30% |
| MEDIUM | ≥ 5,000 MZN | ≥ 15% |

Rows below the MEDIUM threshold are **not surfaced** in the watchlist — the spec's "LOW / informational" tier has no numeric threshold, and since every discount would technically qualify, including it would flood a list that is explicitly meant to be a "Top" watchlist. The full, unfiltered-by-severity population remains visible in the paginated table below regardless.

Recommended action is derived from *which* threshold a row crossed: if the leakage-rate condition triggered the severity, the action is **"Rever Regra de Desconto"** (this specific rule wiped out a large share of one invoice — worth checking the rule's configuration); otherwise it's **"Ver Fatura"** (a single large one-off discount — worth checking the invoice directly). A "View Audit" action was considered (per the original spec) but dropped — this application has no audit-log viewer page to link to, and a dead link is worse than a smaller action set.

### Integrity Warning

Discount amounts are part of `Invoice.totalAmount` (`subtotal − discount + tax = total`), so an open, **CRITICAL**, `category = 'INVOICE_BALANCE'` row in `financial_integrity_issues` (the closest match — there is no dedicated discount/tax category in the schema's `IntegrityIssueCategory` enum) triggers the page's warning banner, same convention as Tax Report and Wallet Liability.

### Export Scope

`GET /api/reports/finance/export/discounts` streams a mixed-shape CSV: a small KPI summary block + the watchlist (page 1 only, bounded) + the properly paginated, filtered, sorted discount table — a `"Tipo"` discriminator column ("KPI" / "Vigilância" / "Desconto") lets a downstream consumer filter by section, the same convention used by Wallet Liability's export.

### Performance

`GROUP BY`/`SUM`/`COUNT`/`COUNT DISTINCT`-equivalent (`EXISTS` + `COUNT(CASE WHEN...)`) aggregation, pagination (`OFFSET`/`FETCH NEXT`), and sorting (`ORDER BY`) all happen in SQL. `getDiscountKPIs` issues exactly two aggregate queries (one rooted at `AppliedDiscount`, one at `Invoice`); every breakdown/trend query is a single `GROUP BY`; the watchlist is a single CTE-backed query. No raw `AppliedDiscount` or `Invoice` rows are ever loaded into the application for aggregation.

## Payment Method Mix Report

**Route:** `/reports/finance/payment-methods` · **Permission:** `financialReports.view` (no dedicated permission — methods are not treated as more sensitive than the rest of the operational reports)

### `PaymentSplit` is the source of truth, never `Payment.totalAmount`

A `Payment` can be **split across several methods** (e.g. half `CASH`, half `MPESA`). Every aggregate in this report is rooted at `payment_splits ps`, joined to `payments p` only to apply status/date/branch/student/course filters — `Payment.totalAmount` is never summed per method. This is the exact bug the original spec called out: summing `Payment.totalAmount` once per method touched by a split payment would double (or N-tuple) count it. `payment_splits` joins to `payments` 1:1 (each split belongs to exactly one payment), so this join can never multiply split rows — see `payment-method.repository.ts`.

### Gross method basis — which payment statuses count as "received"

`Payment.status IN ('CONFIRMED', 'PARTIALLY_REFUNDED', 'REFUNDED')` is the basis for every figure in this report. This is a **hard rule, not a default**: `PENDING` and `CANCELLED` payments never represent received money and cannot be selected via the `paymentStatus` filter, even explicitly — `buildWhere()` silently falls back to the 3-status list if an out-of-range value is supplied. `PARTIALLY_REFUNDED` and `REFUNDED` are included as **gross** received money: a later refund doesn't erase the fact that cash/digital money physically came in through that method (see "Refund handling" below for how refunds are surfaced instead).

### Method categories

`PaymentMethod` has exactly 8 values (`shared/types/common.ts`):

| Category | Methods |
|---|---|
| Cash | `CASH` |
| Digital | `MPESA`, `EMOLA`, `CARD`, `POS` |
| Bank | `BANK_TRANSFER`, `CHEQUE` |
| Uncategorised | `OTHER` — included in Total Received, but in no category total |

### Date basis

`Payment.paymentDate`, not `PaymentSplit.createdAt`. Splits are always created in the same transaction as their parent payment, so the two timestamps are operationally identical; `paymentDate` is used because it's the conventional date axis for payment-level reporting elsewhere in this codebase (`payments-report.repository.ts`, `branch-revenue.repository.ts`) and is already covered by existing `Payment` indexes.

### Refund handling — "Refund-Adjusted Net" is a proportional estimate, not a ledger fact

`Refund.paymentId` points at a **whole Payment**, never at a specific `PaymentSplit`. For a single-method payment this is unambiguous; for a split payment, a refund cannot be tied to one method as a *stored fact* — there is no schema column that says "this refund reversed the CASH portion." `refundAdjustedNet` is therefore computed as a **proportional allocation**: each split absorbs a share of its payment's `COMPLETED` refunds equal to its share of that payment's `totalAmount`:

```
refundEstimate(split) = split.amount × refundedAmount(payment) ÷ payment.totalAmount
refundAdjustedNet(method) = SUM(split.amount) − SUM(refundEstimate(split))
```

`COMPLETED` refunds are pre-aggregated per payment in a CTE (`WITH PaymentRefunds AS (... GROUP BY paymentId)`) *before* being joined back to `payment_splits` — this keeps the join one-to-one, so split rows are never multiplied by a payment having more than one refund. Refunds are never counted as discounts, wallet credits, or "negative payments" anywhere else in this report — they only ever adjust this one derived column.

### Branch attribution

`COALESCE(Payment.branchId, Invoice.branchId)` — the same fallback already established in `branch-revenue.repository.ts`. `Payment.branchId` is preferred; `Invoice.branchId` is used only when the payment itself has no branch recorded.

### Course attribution

`Payment.invoiceId` → `Invoice.enrollmentId` → `Enrollment.courseId`. Falls back to `"Sem Curso"` when the payment has no invoice, the invoice has no enrollment, or the enrollment has no course — same convention as Tax Report and Discount Report.

### KPI Formulas

| KPI | Formula | Granularity |
|---|---|---|
| Total Recebido (Total Received) | SUM(PaymentSplit.amount) | Split level |
| Recebido em Numerário (Cash Received) | SUM(PaymentSplit.amount) WHERE method = `CASH` | Split level |
| Recebido Digitalmente (Digital Received) | SUM(PaymentSplit.amount) WHERE method IN (`MPESA`,`EMOLA`,`CARD`,`POS`) | Split level |
| Recebido por Via Bancária (Bank Received) | SUM(PaymentSplit.amount) WHERE method IN (`BANK_TRANSFER`,`CHEQUE`) | Split level |
| Método Mais Utilizado (Most Used Method) | Method with the highest split **count** | Derived |
| Método de Maior Valor (Highest Value Method) | Method with the highest split **amount** | Derived |
| Média por Divisão (Average Payment Split) | Total Recebido ÷ total split count, across all methods (0 when denominator is 0) | Derived |
| Taxa de Dependência de Numerário (Cash Dependency Rate) | Recebido em Numerário ÷ Total Recebido × 100 (0 when denominator is 0) | Derived |

All 8 KPIs are derived in JS from the **same** ≤8-row, SQL-aggregated method breakdown that backs the table (`computePaymentMethodKPIs`, a pure function over already-grouped rows) — this is not a second pass over raw `PaymentSplit` rows, so it stays within the "SQL aggregation only" rule.

### Filter Semantics

Branch/Course/Academic Year/Academic Term/Date/Student/Method filters apply identically across the KPIs, the table, and all four charts (every query shares the same `buildWhere()`). `paymentStatus` only narrows within `CONFIRMED | PARTIALLY_REFUNDED | REFUNDED` — see "Gross method basis" above.

### Table cardinality — no pagination, no dedicated API route

The table is **method-rooted**, so it has at most 8 rows (one per `PaymentMethod` value) — it is never row-heavy, so (per the spec's own "if the table is row-heavy" qualifier) it needs no `OFFSET`/`FETCH NEXT` pagination and no dedicated paginated API route. It is rendered server-side directly from the same result `getPaymentMethodMixReport()` already computed for the KPIs and charts — the same pattern Branch Revenue and Course Revenue already use for their own small, fixed-cardinality tables.

| Column | Formula |
|---|---|
| Método | `PaymentSplit.method` |
| Total Amount | SUM(PaymentSplit.amount) |
| Split Count | COUNT(*) |
| Payment Count | COUNT(DISTINCT PaymentSplit.paymentId) |
| Average Amount | Total Amount ÷ Split Count |
| Share % | Total Amount ÷ SUM(Total Amount across all methods) × 100 |
| Refund-Adjusted Net | Total Amount − refund estimate (see "Refund handling" above) |

### Charts

| Chart | Source | Notes |
|---|---|---|
| Mix de Métodos (donut) | The method breakdown (`rows`) | Colour-coded via `PAYMENT_METHOD_COLORS` |
| Tendência Mensal por Método | `GROUP BY CONVERT(VARCHAR(7), Payment.paymentDate, 120), PaymentSplit.method` | Multi-line — one series per method, answers "are digital payments growing?" |
| Métodos por Filial | `GROUP BY COALESCE(Payment.branchId, Invoice.branchId), PaymentSplit.method` | 100%-style stacked horizontal bar — a branch whose bar is mostly the CASH colour is cash-dependent |
| Valor Médio por Método | `rows[].averageAmount` | No separate query — same breakdown as the table |

### Integrity Warning

`payment.split_sum` (`category = 'PAYMENT_ALLOCATION'` in `financial_integrity_issues`) verifies `SUM(PaymentSplit.amount) = Payment.totalAmount` for `CONFIRMED`/`PARTIALLY_REFUNDED`/`REFUNDED` payments. An open, **CRITICAL** issue in that category is the single most relevant check for this report — a mismatch there would directly corrupt every KPI, chart, and table row — so it's reused as-is (same convention as Tax Report reusing `INVOICE_BALANCE`).

### Export Scope

`GET /api/reports/finance/export/payment-methods` streams a small, single-batch CSV (like Branch Revenue / Course Revenue, not like Discount/Wallet Liability's paginated mixed-shape export — there is no row-heavy dataset here to page through): a KPI summary block followed by the full ≤8-row method breakdown table, discriminated by a `"Tipo"` column (`"KPI"` / `"Método"`).

### Performance

`GROUP BY`/`SUM`/`COUNT`/`COUNT DISTINCT` aggregation happens entirely in SQL across three queries (method breakdown, monthly trend, by-branch breakdown), each a single pass over `payment_splits` joined to `payments`/`invoices`/`enrollments`/`branches`. No raw `Payment` or `PaymentSplit` rows are ever loaded into the application — KPIs and the table are both pure derivations over the same ≤8-row aggregated result. No new indexes were required: `payment_splits_org_method_createdat_idx`, `payment_splits_payment_method_idx`, `payments_org_status_paymentdate_idx`, `payments_org_branch_status_paymentdate_idx`, `refunds_org_payment_status_idx`, and `enrollments_org_course_idx` (added for the Discount Report) already cover every access path this report needs.

## Refund Analysis Report

**Route:** `/reports/finance/refund-analysis` · **Permission:** `financialReports.view` (no dedicated permission — refunds are not treated as more sensitive than the rest of the operational reports)

### Refunds are cash outflows, not discounts or wallet credits

A refund reverses money that has already left the organisation's books once and is now going back out — it is never treated as a discount (revenue reduced *before* collection) or a wallet credit (a liability, never a cash movement). This report is the executive-analytics counterpart to the operational "Refunds Report" (`refunds-report.repository.ts`, which still loads rows with `findMany` and aggregates in JS); every query in `refund-analysis.repository.ts` is pure SQL aggregation instead — no raw `Refund` rows are ever loaded just to sum/group them.

### Data sources

`Refund`, `Payment`, `Invoice` (for `paidAmount`/branch fallback), `Enrollment`/`Course` (for attribution), `Branch`, `Student`, and `financial_integrity_issues` (for the integrity warning). There is no `RefundReason` model or enum anywhere in the schema — see "Refund Reasons" below.

### Branch / Course / Student attribution — "most direct field wins"

`Refund` already carries its own `branchId`, `studentId`, `enrollmentId`, and `invoiceId` (all nullable) — more direct than the spec's illustrative `Refund -> Payment -> Invoice -> Enrollment -> Course` join chain. The spec's own branch fallback (`Refund.branchId` → `Payment.branchId` → `Invoice.branchId`) establishes the "prefer the most direct stored field, fall back through the chain" principle; this report applies that same principle symmetrically:

- **Branch:** `COALESCE(Refund.branchId, Payment.branchId, Invoice.branchId)`
- **Course:** `COALESCE(Refund.enrollmentId, Payment.enrollmentId, Invoice.enrollmentId)` → `Enrollment.courseId`
- **Student:** `COALESCE(Refund.studentId, Payment.studentId, Invoice.studentId)`

`refunds JOIN payments` is a straight FK lookup (one payment per refund), so this join never multiplies rows — there is no double-counting risk to guard against here, unlike Tax/Discount Report's one-to-many join concerns.

### Date semantics (three distinct bases — all documented per the spec's own requirement)

- **Population filter** (`dateFrom`/`dateTo`, applied everywhere): `Refund.createdAt` — "which refunds were *requested* in this window." This is the single, consistent date-range filter for KPIs, the table, the watchlist, and the Refund Trend chart.
- **Processing Time / "Refunded Amount" bucketing**: once the createdAt-ranged, COMPLETED-only population is selected, the Processing Time Trend chart and the "Refunded Amount" series of the Amount Trend chart bucket by `Refund.completedAt` month instead — the natural axis for "when did this cash actually go out," matching Revenue Trend's exact precedent (`getRefundMonthlyAggregates` groups by `completedAt`).
- **"Pending Exposure" series**: pending refunds have no `completedAt` by definition, so this series decomposes *today's* pending exposure total by the month each pending refund was *created* — it is **not** a historical reconstruction of "exposure as of each past month-end" (`Refund` has no status-history table, so that figure cannot be derived without inventing a fact the schema doesn't store — see "Do not create new financial facts").

### KPI Formulas

| KPI | Formula | Notes |
|---|---|---|
| Total Reembolsado (Total Refunded) | SUM(Refund.amount) WHERE status = COMPLETED | |
| Pedidos de Reembolso (Refund Requests) | COUNT(*) (any status) | |
| Taxa de Reembolso (Refund Rate) | Total Refunded ÷ grossCollectedAmount × 100 | See "Refund Rate" below |
| Valor Médio de Reembolso (Average Refund Amount) | Total Refunded ÷ COUNT(COMPLETED) | 0 when denominator is 0 |
| Maior Reembolso (Largest Refund) | MAX(Refund.amount) WHERE status = COMPLETED | |
| Exposição Pendente (Pending Refund Exposure) | SUM(Refund.amount) WHERE status IN (REQUESTED, APPROVED) | |
| Taxa de Rejeição (Rejected Refund Rate) | COUNT(REJECTED) ÷ COUNT(*) × 100 | 0 when denominator is 0 |
| Tempo Médio de Processamento (Average Processing Time) | AVG(DATEDIFF(day, createdAt, completedAt)) WHERE status = COMPLETED | Whole-day granularity, consistent with `daysDormant` in `wallet-liability.repository.ts` |

All 8 KPIs are computed from **one** aggregate query (every status-specific figure derived via `CASE WHEN` in a single pass over the createdAt-filtered population) plus one separate invoice-rooted query for the Refund Rate's denominator — two queries total, never a raw-row loop.

### Refund Rate reuses Revenue Trend's collection definition exactly

`grossCollectedAmount = SUM(Invoice.paidAmount)` for non-cancelled invoices, scoped by the same branch/course/academicYear/academicTerm/student/date filters, using **`Invoice.issueDate`** as the date-range column — not `Refund.completedAt`. Revenue Trend's own "collected" series already uses a different date column than its "refunded" series for the exact same reason (`getInvoiceMonthlyAggregates` groups by `issueDate`; `getRefundMonthlyAggregates` groups by `completedAt`); this report's Refund Rate just extends that established precedent to a single ratio. The two halves of the ratio are therefore each scoped to their own entity's natural date axis, not a single shared one.

### Cancellation / status rules

The general population filter (`buildWhere`) has **no default status restriction** — unlike Tax/Discount Report, which default-exclude `CANCELLED` invoices, every refund status is in scope unless the optional `status` filter narrows it. Status-specific KPIs (Total Refunded, Average Refund, Largest Refund, Average Processing Time, Pending Exposure) apply their *own* status condition via `CASE WHEN`/`AND`, which simply intersects with whatever the user's `status` filter already says (e.g. filtering to `status = REJECTED` makes `Total Refunded` read 0 — correct and expected, not a bug).

### Charts

| Chart | Source | Notes |
|---|---|---|
| Tendência de Reembolsos (Refund Trend) | `GROUP BY CONVERT(VARCHAR(7), Refund.createdAt, 120)`, `COUNT(CASE WHEN status = ...)` per status | Cohort-by-creation-month, sliced by *current* status — "of the refunds requested in month M, how many are now in each status" |
| Tendência de Valor de Reembolso (Refund Amount Trend) | Two queries, two date bases (see "Date semantics"), merged by month label in JS | Merging two small pre-aggregated result sets, not raw-row aggregation |
| Reembolsos por Filial (Refunds by Branch) | `GROUP BY` branch fallback, `SUM(amount) WHERE status = COMPLETED` | Falls back to "Sem Filial"; basis matches the "Total Refunded" KPI ("how much are refunds costing us, by branch") |
| Reembolsos por Curso (Refunds by Course) | `GROUP BY Enrollment.courseId`, same COMPLETED-amount basis | Falls back to "Sem Curso" |
| Reembolsos por Estado (Refunds by Status, donut) | `GROUP BY status`, `COUNT(*)` | All statuses, count-based — shows the status mix, not cost |
| Tendência de Tempo de Processamento (Processing Time Trend) | `GROUP BY CONVERT(VARCHAR(7), completedAt, 120)`, `AVG(DATEDIFF(day, createdAt, completedAt))` | COMPLETED only |

### Refund Reasons — chart permanently skipped

There is no `RefundReason` model or enum anywhere in the schema. `Refund.reason` is unstructured free text (`z.string().min(2, "A razão deve ter pelo menos 2 caracteres")` in `refund.schema.ts` — no enum constraint, no lookup table). Grouping by it would either fragment into near-one-row cardinality (every refund's free text is slightly different) or require inventing a keyword-based categorization onto the spec's suggested buckets (cancellation, duplicate payment, overpayment, withdrawal, administrative correction) — which the spec explicitly forbids ("Do not invent reasons"). Per the spec's own "If no reason exists: Skip chart" instruction, **no "Refunds by Reason" chart, and no corresponding repository function, exist at all** — this is a permanent, schema-driven omission, not a placeholder. `refund-analysis.repository.test.ts` asserts no such export exists.

### Watchlist ("Lista de Vigilância de Reembolsos")

Only **REQUESTED** and **APPROVED** refunds can appear — REJECTED and COMPLETED refunds need no further action, so they are never surfaced. Severity escalates by amount **or** age, whichever is worse, computed by a pure exported function (`computeRefundWatchlistSeverity`, directly unit-tested):

| Severity | Amount | OR pending (REQUESTED) age | OR approved (APPROVED) age |
|---|---|---|---|
| CRITICAL | ≥ 50,000 MZN | > 60 days | > 30 days |
| HIGH | ≥ 10,000 MZN | > 30 days | *(no rule — only the CRITICAL 30-day threshold applies to APPROVED)* |
| MEDIUM | ≥ 5,000 MZN | > 14 days | *(no rule)* |

"Age" is `DATEDIFF(day, approvedAt, GETDATE())` for APPROVED refunds (time spent waiting to be *completed* after approval) and `DATEDIFF(day, createdAt, GETDATE())` for REQUESTED refunds (time spent waiting to be *reviewed*) — a plain scalar function, not a window function, so (unlike the Discount Report's leakage-rate watchlist) no CTE is needed to use it directly in `WHERE`/`ORDER BY`. Rows below MEDIUM are **not surfaced** — the spec's "LOW / informational" tier has no numeric threshold, and surfacing every open refund would defeat the purpose of a "top risky refunds" list (same precedent as the Discount Report's watchlist), capped at 20 rows.

**Recommended Action** is derived from status alone: `REQUESTED` → "Rever Pedido", `APPROVED` → "Concluir Reembolso". **"View Refund" was considered (per the original spec) but dropped** — there is no refund detail page anywhere in this app. Both recommended actions, and the table's own "Acções" column, deep-link to `/reports/finance/refunds?search={refundNumber}` — the closest *real* destination, since this app has no approve/reject/complete UI wired up yet (the commands exist in `modules/finance/refunds/commands/` but no route or page calls them). "Ver Aluno" links to the real `/students/[studentId]` page; "Ver Pagamento" links to `/payments/[paymentId]`, matching the existing Refunds Report table's own established (if currently dead, since no such page exists yet) convention rather than introducing a new one.

### Integrity Warning

Unlike most other reports here (which reuse a single `IntegrityIssueCategory`), this check spans **three** categories per the spec's own wording ("refunds, payments, ledger mismatches"): an open, **CRITICAL** issue in `REFUND_TOTAL` (e.g. `refund.exceeds_payment`), `PAYMENT_ALLOCATION` (e.g. `payment.split_sum`), or `LEDGER_CONSISTENCY` triggers the warning banner — any of the three would mean the refund totals, the payments they're refunding, or the ledger entries behind them cannot be trusted.

### Tenant Isolation

Enforced structurally — `organizationId` is ANDed into every `WHERE` clause, so a cross-tenant `branchId`/`courseId`/`studentId` simply matches zero rows (the same pattern `wallet-liability.repository.ts` documents and every other report in this suite relies on), not a separate pre-validation round trip.

### Export Scope

`GET /api/reports/finance/export/refund-analysis` streams a mixed-shape CSV: a small KPI summary block + the watchlist (page 1 only, bounded) + the properly paginated, filtered, sorted refund table — a `"Tipo"` discriminator column (`"KPI"` / `"Vigilância"` / `"Reembolso"`) lets a downstream consumer filter by section, the same convention used by Wallet Liability and Discounts.

### Performance

`SUM`/`COUNT`/`AVG`/`CASE WHEN` aggregation, pagination (`OFFSET`/`FETCH NEXT`), and sorting (`ORDER BY`) all happen in SQL. The KPI block is exactly 2 queries (one rooted at `Refund`, one at `Invoice`); every breakdown/trend query is a single `GROUP BY`; the watchlist is a single query with no CTE needed (no window functions involved). Two new indexes support this: `refunds_org_createdat_idx` (organizationId, createdAt) for the general population scan when no status filter is active, and `refunds_org_status_completedat_idx` (organizationId, status, completedAt) for the COMPLETED-only, completedAt-bucketed queries (Refunded Amount trend, Processing Time Trend). All other access paths (branch/course fallback joins, the gross-collected denominator) are already covered by existing `payments`/`invoices`/`enrollments` indexes from the schema baseline and prior migrations.

## Performance Notes

- All paginated tables use server-side pagination via React Query + dedicated API routes. No client-side filtering of large datasets.
- KPI aggregations are server-side (in-memory after a single `findMany`). Avoid N+1: all related data is fetched in a single query with `select`.
- Aging bucket filter is applied in-memory after the database query (bucket is not stored — see Aging section).
- Student statement ledger is capped at 200 entries per request. Full history requires a date range filter.
- Export route caps at 5 000 rows to prevent memory exhaustion on large datasets.

---

## Database Indexes

Finance report queries follow predictable patterns: always scoped by `organizationId`, then filtered by status, date range, branch, enrollment, or entity reference. The indexes below are sized to match those patterns at 100k invoices, 100k payments, and 500k transactions.

### Invoice (`invoices`)

| Index name | Columns | Used by |
|---|---|---|
| `invoices_org_student_status_idx` | `organizationId, studentId, status` | Student Debt Report, Student Financial Statement |
| `invoices_org_status_duedate_idx` | `organizationId, status, dueDate` | Aging Report, Accounts Receivable, overdue KPIs, Collections |
| `invoices_org_status_issuedate_idx` | `organizationId, status, issueDate` | Invoice monthly trends, revenue trends, AR date filters |
| `invoices_org_branch_status_issuedate_idx` | `organizationId, branchId, status, issueDate` | Branch Revenue Report, branch-filtered AR/Aging |
| `invoices_org_enrollment_status_idx` | `organizationId, enrollmentId, status` | Course Revenue Report, enrollment financial history |

### Payment (`payments`)

| Index name | Columns | Used by |
|---|---|---|
| `payments_org_status_paymentdate_idx` | `organizationId, status, paymentDate` | Payments Report, Cash Flow support, Payment Method Mix Report's status/date filter |
| `payments_org_branch_status_paymentdate_idx` | `organizationId, branchId, status, paymentDate` | Branch Revenue Report, branch payment trends, Payment Method Mix Report's branch filter |
| `payments_org_invoice_status_idx` | `organizationId, invoiceId, status` | Invoice payment history, Student Statement, refund reconciliation |

### Payment Split (`payment_splits`)

| Index name | Columns | Used by |
|---|---|---|
| `payment_splits_org_method_createdat_idx` | `organizationId, method, createdAt` | Payment Method Mix Report (method breakdown, monthly trend, by-branch — `method` as the 2nd key serves the `GROUP BY method` even without a method filter), Payments Report method filters |
| `payment_splits_payment_method_idx` | `paymentId, method` | Payment detail drilldown, Payment Method Mix Report's `payment_splits ⋈ payments` join path |

### Student Wallet Transaction (`student_wallet_transactions`)

| Index name | Columns | Used by |
|---|---|---|
| `swt_wallet_createdat_idx` *(prior migration)* | `studentWalletId, createdAt` | Wallet aggregation CTE, lastTransaction ROW_NUMBER |
| `swt_org_type_createdat_idx` *(prior migration)* | `organizationId, type, createdAt` | Org-scoped transaction queries with type and date filters |
| `swt_org_createdat_idx` | `organizationId, createdAt` | Wallet activity trends, wallet liability period movement |

### Financial Transaction (`financial_transactions`)

| Index name | Columns | Used by |
|---|---|---|
| *(existing)* | `organizationId, invoiceId` | Reconciliation lookup by invoice |
| *(existing)* | `organizationId, paymentId` | Reconciliation lookup by payment |
| *(existing)* | `organizationId, studentId` | Student-scoped ledger filter |
| *(existing)* | `organizationId, occurredAt` | Date-range ledger queries |
| *(existing)* | `organizationId, transactionType` | Type-only ledger filter |
| `financial_tx_org_type_occurredat_idx` | `organizationId, transactionType, occurredAt` | Cash Flow (type + date), Ledger timeline, Reconciliation |
| `financial_tx_org_source_ref_idx` | `organizationId, sourceType, sourceId` | Entity reconciliation, ledger lookup by source entity |
| `financial_tx_org_student_occurredat_idx` | `organizationId, studentId, occurredAt` | Student Financial Statement ledger timeline |

### Refund (`refunds`)

| Index name | Columns | Used by |
|---|---|---|
| `refunds_org_status_createdat_idx` | `organizationId, status, createdAt` | Refund Report, Refund Analysis Report's `status`-filtered queries |
| `refunds_org_payment_status_idx` | `organizationId, paymentId, status` | Refundable amount calculation, payment refund history, Payment Method Mix Report's per-payment `COMPLETED` refund CTE |
| `refunds_org_createdat_idx` | `organizationId, createdAt` | Refund Analysis Report's general population scan (Refund Trend chart, KPIs) when no `status` filter is active — the common case |
| `refunds_org_status_completedat_idx` | `organizationId, status, completedAt` | Refund Analysis Report's COMPLETED-only, `completedAt`-bucketed queries (Refunded Amount trend series, Processing Time Trend) |

### Installment (`installments`)

| Index name | Columns | Used by |
|---|---|---|
| `installments_org_status_duedate_idx` | `organizationId, status, dueDate` | Collections Report, overdue installments, installment aging |
| `installments_org_invoice_status_idx` | `organizationId, invoiceId, status` | Invoice payment plan detail, installment reconciliation |

### Financial Integrity Issue (`financial_integrity_issues`)

| Index name | Columns | Used by |
|---|---|---|
| *(existing)* | `organizationId, severity` | Severity filter per org |
| *(existing)* | `organizationId, category` | Category filter per org |
| *(existing)* | `organizationId, status, detectedAt` | Status + date range queries |
| *(existing)* | `organizationId, entityType, entityId` | Entity-targeted lookups |
| `fii_org_status_severity_idx` | `organizationId, status, severity` | Combined status+severity — integrity warning banner (OPEN + CRITICAL) |
| `fii_org_category_status_idx` | `organizationId, category, status` | Combined category+status — integrity report category drilldown |

### Applied Discount (`applied_discounts`)

| Index name | Columns | Used by |
|---|---|---|
| `applied_discounts_org_createdat_idx` | `organizationId, createdAt` | Discount Report date filter, monthly trend (date basis is `AppliedDiscount.createdAt`) |
| `applied_discounts_org_rule_createdat_idx` | `organizationId, discountRuleId, createdAt` | Discount Report rule filter + by-rule breakdown |
| `applied_discounts_org_invoice_idx` | `organizationId, invoiceId` | Discount Report's invoice-rooted `EXISTS(applied_discounts WHERE invoiceId = i.id)` checks |

### Enrollment (`enrollments`)

| Index name | Columns | Used by |
|---|---|---|
| `enrollments_org_course_idx` | `organizationId, courseId` | Discount/Tax/Revenue/Payment Method Mix reports' course filter, applied via `Invoice.enrollmentId → Enrollment.courseId` |

### Index Rules

**Add an index when:**
- A new report filters by a column combination not covered by existing indexes.
- Query plan analysis shows table scans on tables with > 10k rows.

**Do not add an index when:**
- The column combination is already a prefix of an existing composite index.
- The table is small (< 5k rows) and full scans are acceptable.
- The column contains free-text or JSON — these are not indexable efficiently.
- You're speculating about future query patterns rather than matching a real query.

**SQL Server composite index prefix rule:** An index on `(A, B, C)` is usable for queries filtering on `A`, `A+B`, or `A+B+C`. It is not usable for `B` or `C` alone. Index column order matters — put the highest-cardinality equality filter first, then the range column last.

---

## File Structure

```
src/modules/reports/finance/
├── types/index.ts                          — All DTOs, filter types, KPI interfaces
├── utils/
│   ├── aging-calc.ts                       — Pure calculation functions (testable, no DB)
│   ├── csv-export.ts                       — CSV building helpers
│   └── trust-score.ts                      — Pure Financial Trust Score formula (testable, no DB)
├── repositories/
│   ├── accounts-receivable.repository.ts
│   ├── aging.repository.ts
│   ├── cash-flow.repository.ts             — Reads FinancialTransaction only
│   ├── payments-report.repository.ts
│   ├── refunds-report.repository.ts
│   ├── reconciliation.repository.ts        — Live ledger-vs-source comparison checks
│   ├── closing.repository.ts               — Closing Dashboard KPIs, watchlist, control summary
│   ├── revenue-trend.repository.ts         — Invoiced/Collected/Outstanding + Refunded monthly aggregates
│   ├── wallet-liability.repository.ts      — Per-wallet SQL aggregation, watchlist, branch/course breakdown
│   ├── tax.repository.ts                  — AppliedTax-rooted aggregation; derives taxable base algebraically
│   ├── discount.repository.ts             — AppliedDiscount-rooted aggregation; dual WHERE roots; CTE-backed watchlist
│   ├── payment-method.repository.ts       — PaymentSplit-rooted aggregation; refund estimate via per-payment CTE
│   ├── refund-analysis.repository.ts      — Refund-rooted aggregation; "most direct field wins" attribution; no CTE needed (no window functions)
│   └── student-statement.repository.ts
├── services/
│   ├── financial-reports.service.ts        — Orchestrates repositories (also composes getTaxReport directly)
│   ├── financial-reconciliation-report.service.ts
│   ├── financial-closing-report.service.ts — Composes KPIs/trust score/watchlist for the Closing Dashboard
│   ├── revenue-trend-report.service.ts     — Zero-fills months (the only place this happens)
│   ├── wallet-liability-report.service.ts
│   ├── discount-report.service.ts          — Composes KPIs/watchlist/charts/rows for the Discount Report
│   ├── payment-method-report.service.ts    — Composes KPIs/table/trend/by-branch for the Payment Method Mix Report
│   └── refund-analysis-report.service.ts   — Composes KPIs/watchlist/charts/rows for the Refund Analysis Report
├── components/
│   ├── accounts-receivable-table.tsx
│   ├── aging-buckets-chart.tsx
│   ├── aging-table.tsx
│   ├── cash-flow-chart.tsx                 — Monthly trend line chart (client); reused by the Closing Dashboard
│   ├── export-button.tsx
│   ├── integrity-warning-banner.tsx
│   ├── wallet-integrity-warning-banner.tsx — Wallet-category-scoped variant for Wallet Liability
│   ├── payments-report-table.tsx
│   ├── refunds-report-table.tsx
│   ├── reconciliation-issues-table.tsx
│   ├── closing-filters-form.tsx
│   ├── closing-watchlist-table.tsx
│   ├── revenue-trend-chart.tsx / billing-collection-gap-chart.tsx / collection-rate-chart.tsx / revenue-trend-table.tsx
│   ├── wallet-liability-trend-chart.tsx / credits-issued-consumed-chart.tsx
│   ├── liability-by-branch-chart.tsx / liability-by-course-chart.tsx
│   ├── wallet-liability-watchlist-table.tsx / wallet-liability-table.tsx
│   ├── tax-by-month-chart.tsx / tax-by-rule-chart.tsx / tax-by-branch-chart.tsx / effective-tax-rate-chart.tsx
│   ├── tax-table.tsx
│   ├── discount-by-month-chart.tsx / discount-by-rule-chart.tsx / discount-by-branch-chart.tsx / discount-by-course-chart.tsx
│   ├── manual-vs-automatic-discount-chart.tsx
│   ├── discount-watchlist-table.tsx / discount-table.tsx
│   ├── payment-method-mix-donut-chart.tsx / payment-method-monthly-trend-chart.tsx
│   ├── payment-method-by-branch-chart.tsx / payment-method-avg-split-chart.tsx
│   ├── payment-method-mix-table.tsx        — Static, server-rendered — table is method-rooted, max 8 rows
│   ├── refund-trend-chart.tsx / refund-amount-trend-chart.tsx
│   ├── refund-by-branch-chart.tsx / refund-by-course-chart.tsx / refund-by-status-chart.tsx
│   ├── refund-processing-time-chart.tsx
│   ├── refund-watchlist-table.tsx / refund-analysis-table.tsx
│   └── student-statement-view.tsx
└── __tests__/
    ├── aging-calc.test.ts                  — Unit tests for pure calculation functions
    ├── trust-score.test.ts                 — Unit tests for the Trust Score formula
    ├── closing.repository.test.ts
    ├── financial-closing-report.service.test.ts
    ├── revenue-trend.repository.test.ts
    ├── revenue-trend-report.service.test.ts
    ├── wallet-liability.repository.test.ts
    ├── tax.repository.test.ts
    ├── discount.repository.test.ts
    ├── payment-method.repository.test.ts
    └── refund-analysis.repository.test.ts

src/app/(org)/reports/finance/
├── page.tsx                                — Report hub
├── accounts-receivable/page.tsx
├── aging/page.tsx
├── cash-flow/page.tsx                      — Server page, ledger-only data source
├── payments/page.tsx
├── refunds/page.tsx
├── reconciliation/page.tsx
├── closing/page.tsx                        — Executive Closing Dashboard
├── revenue-trend/page.tsx
├── wallet-liability/page.tsx
├── taxes/page.tsx
├── discounts/page.tsx
├── payment-methods/page.tsx                — No dedicated API route; table is method-rooted (max 8 rows)
├── refund-analysis/page.tsx
└── student-statement/
    ├── page.tsx                            — Student search/picker
    └── [studentId]/page.tsx

src/app/api/reports/finance/
├── accounts-receivable/route.ts
├── aging/route.ts
├── cash-flow/route.ts                      — GET, auth: FINANCIAL_REPORTS_VIEW
├── payments/route.ts
├── refunds/route.ts
├── reconciliation/route.ts
├── wallet-liability/route.ts               — Paginated table only; KPIs/watchlist/charts use the bundled service
├── taxes/route.ts                          — Paginated table only; KPIs/charts use the bundled service
├── discounts/route.ts                      — Paginated table only; KPIs/watchlist/charts use the bundled service
├── refund-analysis/route.ts                — Paginated table only; KPIs/watchlist/charts use the bundled service
├── student-statement/[studentId]/route.ts
└── export/[reportType]/route.ts            — Single shared route; one branch per report type, including revenue-trend, wallet-liability, taxes, discounts, payment-methods, and refund-analysis
```
