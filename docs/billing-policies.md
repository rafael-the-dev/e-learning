# Billing Policies & Financial Obligations

## Overview

The billing module automates invoice generation during enrollment. An `ORG_ADMIN` configures billing rules once; the system applies them every time a student enrolls.

## Core Entities

### FeeDefinition
A reusable fee template owned by the organization. Defines what a fee *is* (type, default amount, priority). Fee definitions are referenced by `PolicyFee` records inside a billing policy.

**Fee Types:** `REGISTRATION_FEE`, `COURSE_FEE`, `MATERIAL_FEE`, `EXAM_FEE`, `CERTIFICATE_FEE`, `PENALTY`, `OTHER`

**Priority:** Lower number = allocated first when a payment arrives. Mirrors `ITEM_TYPE_PRIORITY` in the finance module.

### EnrollmentBillingPolicy
A named configuration that controls how invoices are generated for enrollments.

| Field | Description |
|---|---|
| `autoGenerateInvoiceOnEnrollment` | If true, invoice is created when enrollment is saved |
| `invoiceMode` | `MANUAL`, `SINGLE_INVOICE`, or `INSTALLMENT_INVOICES` |
| `activationRule` | When the enrollment status moves to `ACTIVE` |
| `installmentsRequired` | Whether a payment plan is auto-created |
| `defaultNumberOfInstallments` | Number of installments (2–60) |
| `minimumFirstPaymentAmount` | Override for the first installment amount |
| `isDefault` | Only one default policy per organization |

Only one policy can be `isDefault = true` per organization. Setting a new default clears the previous one atomically.

### PolicyFee
Links a `FeeDefinition` to a `BillingPolicy` with a configurable amount override:

| amountType | Amount used |
|---|---|
| `FIXED` | `fixedAmount` field |
| `COURSE_BASE_PRICE` | `course.price` |
| `PERCENTAGE_OF_COURSE_PRICE` | `(course.price * percentage) / 100` |

### DiscountRule
An organization-scoped discount that is applied automatically to all invoices generated during the active date range.

- `PERCENTAGE`: reduces invoice subtotal by a percentage
- `FIXED_AMOUNT`: reduces by a fixed currency amount
- `stackable = false`: only the first applicable discount is applied

### TaxRule
An organization-scoped tax applied after discounts.

- `isIncludedInPrice = true`: informational only (not added to total)
- `isIncludedInPrice = false`: added to `totalAmount`

## Invoice Generation Flow

When `CreateEnrollmentCommand` runs:

```
1. Enrollment created (status = DRAFT)
2. Load active default EnrollmentBillingPolicy
3. If policy.autoGenerateInvoiceOnEnrollment = false → stop
4. Load active DiscountRules (within date range)
5. Load active TaxRules
6. BillingCalculatorService.calculateBilling() → deterministic result
7. Create Invoice (status = PENDING)
8. Create InvoiceItems from PolicyFees
9. Store AppliedDiscount records (snapshot — never recalculated)
10. Store AppliedTax records (snapshot — never recalculated)
11. If installmentsRequired → create PaymentPlan + Installments
12. Apply activationRule → update Enrollment status
13. Write AuditLog: enrollment_invoice.generated
```

## Activation Rules

The `activationRule` field controls when the enrollment status transitions to `ACTIVE`.

| Rule | Status immediately after invoice generation | Status transitions to `ACTIVE` when… |
|---|---|---|
| `MANUAL` | Unchanged (`DRAFT`) | Manually by an admin |
| `AFTER_INVOICE_CREATED` | → `ACTIVE` immediately | Already active |
| `AFTER_REGISTRATION_FEE` | → `PENDING_PAYMENT` | Registration fee is paid |
| `AFTER_FIRST_PAYMENT` | → `PENDING_PAYMENT` | First payment of any amount is confirmed |
| `AFTER_FULL_PAYMENT` | → `PENDING_PAYMENT` | Invoice is fully paid |

Payment-triggered transitions are handled by `ConfirmPaymentCommand` after a payment is confirmed.

## Auditability

- `AppliedDiscount` and `AppliedTax` store the **calculated amount at generation time**. Future changes to discount/tax rules do NOT alter old invoices.
- `Invoice.billingPolicyId` records which policy generated the invoice.
- `Enrollment.billingPolicyId` records which policy was in effect at enrollment time.
- `InvoiceItem.feeDefinitionId` traces each line item back to its fee definition.
- All mutations are logged to `AuditLog` with `oldValues` / `newValues`.

## Why Old Invoices Don't Change

The `BillingCalculatorService` is **pure** (no DB writes). It reads rules at generation time and returns calculated values. Those values are immediately written to `Invoice`, `InvoiceItem`, `AppliedDiscount`, and `AppliedTax` as concrete numbers — not references. If an admin later changes a policy fee amount or archives a discount rule, all historical invoices retain the values that were calculated when they were created.

## Permissions

| Permission | ORG_ADMIN | SECRETARY |
|---|---|---|
| `feeDefinitions.view` | ✓ | ✓ |
| `feeDefinitions.create` | ✓ | — |
| `feeDefinitions.update` | ✓ | — |
| `feeDefinitions.archive` | ✓ | — |
| `billingPolicies.view` | ✓ | ✓ |
| `billingPolicies.create` | ✓ | — |
| `billingPolicies.update` | ✓ | — |
| `billingPolicies.archive` | ✓ | — |
| `billingPolicies.setDefault` | ✓ | — |
| `discountRules.view` | ✓ | ✓ |
| `discountRules.*` | ✓ | — |
| `taxRules.view` | ✓ | ✓ |
| `taxRules.*` | ✓ | — |

## UI: /settings/billing

Four tabs:
- **Políticas** — list, create, edit, archive, set default. Detail page manages PolicyFees.
- **Taxas** — list, create, edit, archive FeeDefinitions.
- **Descontos** — list, create, edit, archive DiscountRules with date ranges.
- **Impostos** — list, create, edit, archive TaxRules.

## Tenant Safety Rules

- `organizationId` is **never** accepted from client input.
- All repository queries are scoped to `activeOrganizationId` from `requireOrganization()`.
- Only one `isDefault = true` policy can exist per organization. Switching the default is performed inside a Prisma `$transaction` that clears the previous default and sets the new one atomically — ensuring no window where zero or two defaults exist concurrently.
- PolicyFee must reference a FeeDefinition that belongs to the same organization (validated in `AddPolicyFeeCommand`, enforced via `organizationId` filter on the existence check).
