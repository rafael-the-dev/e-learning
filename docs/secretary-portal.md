# Portal da Secretaria (Secretary Portal)

Operational workspace for users with the **SECRETARY** role (and any admin
previewing it). It answers a single question on every load: *what needs my
action right now?* — across enrollments, payments/invoices, documents, student
administration and the next two weeks of deadlines.

## Route

| | |
|---|---|
| Path | `/secretary` |
| File | `src/app/(org)/secretary/page.tsx` (+ `loading.tsx`, `error.tsx`) |
| Entity in URL | none — this is *the current secretary's* workspace inside the *active organization* |

`organizationId` is always resolved server-side from the active org context
(`requirePermissionOrRedirect` → `context.organizationId`); it is never read
from the URL or a query param. `userId` only scopes the notifications panel.

## Permissions

| Permission | `secretaryPortal.view` (`PERMISSIONS.SECRETARY_PORTAL_VIEW`) |
|---|---|

| Role | Access |
|---|---|
| SECRETARY | ✅ (granted explicitly) |
| ORG_ADMIN | ✅ (via the all-permissions-except-`organizations.delete` wildcard) |
| SUPER_ADMIN | ✅ (via the all-permissions wildcard) |
| TEACHER | ❌ |
| STUDENT | ❌ |

> The permission is declared in `src/server/auth/permissions.ts` and is the
> source of truth. A running database must be **re-seeded** for the new
> permission to be granted to existing SECRETARY role rows (see Deployment).

The sidebar item ("Portal da Secretaria", `nav-config.ts`) is gated by the same
permission, so it is hidden from TEACHER/STUDENT automatically. TEACHER/STUDENT
are also scope-locked to their own allowlists (`nav-links.tsx`), so they can
never reach `/secretary` even by direct URL.

## Deployment

**Runtime authorization reads grants from the database, not from
`permissions.ts`.** `ctx.ability.can(...)` is built from the `RolePermission`
rows loaded for the user's roles (`getUserPermissions`). Adding
`SECRETARY_PORTAL_VIEW` to the code catalog therefore has **no effect on a
running environment until the permissions are synchronized**, or SECRETARY users
will be redirected to `/forbidden`.

Every deploy that introduces or regrants a permission must run permission
synchronization:

```bash
pnpm db:seed
```

`prisma/seed.ts` is fully data-driven from `PERMISSIONS` + `ROLE_PERMISSIONS`:

- it inserts every catalog permission into the `Permission` table (idempotent upsert),
- it upserts the `RolePermission` rows for each system role from `ROLE_PERMISSIONS`,
  so SECRETARY receives `SECRETARY_PORTAL_VIEW` and ORG_ADMIN/SUPER_ADMIN receive
  it through their wildcard grant,
- `validatePermissionsSeeded()` fails the seed loudly if the DB catalog drifts
  from the code constants.

The deployment guard is the test
`src/server/auth/__tests__/secretary-portal-permission.test.ts`: it asserts the
catalog code and the per-role wiring that the seed (and therefore runtime
authorization) depends on. If the role mapping ever drifts, that test fails in
CI before the broken grant can ship.

> A targeted migration that inserts the `Permission` row and the SECRETARY
> `RolePermission` link is an acceptable alternative to a full re-seed for
> environments where re-seeding is undesirable.

## Difference from the Executive Dashboard

| | Executive Dashboard (`/dashboard`) | Secretary Portal (`/secretary`) |
|---|---|---|
| Audience | Management | Front-office / secretariat |
| Question | *How is the business doing?* | *What do I need to do today?* |
| Nature | Strategic — health score, KPIs, trends, watchlists | Operational — action queues, top-N lists |
| Data | Aggregated org analytics | Actionable individual records (with deep links) |

They intentionally do **not** share components or services. The Secretary
Portal never exposes executive-only analytics.

## Data sources (reuse)

| Concern | Source |
|---|---|
| Notifications | `@/modules/notifications/services/notification.service` (`getUnreadCount`, `getLatestForUser`) + `notification.actions` for mark-read/archive |
| Portal account status | `Student.userId` (null ⇒ no portal login) |
| Everything else | `src/modules/secretary-portal/repositories/secretary-portal.repository.ts` — purpose-built, org-scoped aggregation queries over Enrollment, Student, Invoice, Payment, Refund, StudentDocument, ClassGroup, Assessment, AcademicEvent |

## KPI formulas

| KPI | Definition |
|---|---|
| Matrículas Pendentes | `Enrollment.status ∈ {DRAFT, PENDING_PAYMENT}` |
| Alunos Activos | `Student.status = ACTIVE` |
| Pagamentos Pendentes | `Payment.status = PENDING` |
| Facturas Vencidas | `Invoice.status ∉ {CANCELLED, PAID}` ∧ `balanceAmount > 0` ∧ `dueDate < now` |
| Documentos por Rever | `StudentDocument.status = PENDING` |
| Notificações Não Lidas | unread notifications for the current user |
| Turmas em Formação | `ClassGroup.status = FORMING` |
| Tarefas Urgentes | `Facturas Vencidas + Matrículas Pendentes + Pagamentos Pendentes + Documentos por Rever` |

## Queues (top-N, server-side limits)

All capped at 10 rows, ordered to surface the most urgent first.

- **A — Matrículas Pendentes**: DRAFT/PENDING_PAYMENT enrollments, oldest first → `/enrollments/{id}`
- **B — Pagamentos / Facturas**: overdue invoices, most-overdue first → `/invoices/{id}`
- **C — Documentos por Rever**: PENDING documents, oldest first (days pending) → `/students/{id}`
- **D — Alunos Recentes**: newest students with latest-enrollment summary → `/students/{id}`

## Financial attention

Aggregated counts + summed amounts (SQL `_count`/`_sum`) for: overdue invoices,
payments awaiting confirmation, and refunds REQUESTED/APPROVED. This is an
operational triage panel, **not** the financial reports module — full finance
analytics stay behind their own permissions.

## Student administration

Data-hygiene queues (counts + a top-N list of accounts to provision):

- active students without a portal account (`userId = null`)
- active students missing email
- non-active students that still hold an ACTIVE enrollment
- ACTIVE enrollments without a class group
- ACTIVE enrollments without a current level

Duplicate-contact detection is intentionally omitted — there is no reliable
schema signal for it, so faking it would mislead.

## Security boundaries

- `organizationId` from the active context only; every query is org-scoped (no cross-tenant reads).
- No SUPER_ADMIN/global data; no role/permission management; no org settings.
- SECRETARY cannot see restricted financial analytics unless already permitted.
- Tenant isolation, top-N bounding and SQL aggregation are covered by tests in `__tests__/`.

## Known limitations

- **Required-document rules don't exist** in the schema. The portal never fabricates
  "missing documents"; the Documents & Compliance panel surfaces
  *"Documentos obrigatórios ainda não configurados."* and only counts real
  PENDING uploads.
- **Document expiry isn't tracked** (`StudentDocument` has no expiry field) — the
  expired-documents metric is `null` until the schema supports it.
- The `PENDING_APPROVAL` enrollment status referenced in the original spec does
  not exist in this schema; pending = `DRAFT` + `PENDING_PAYMENT`.
- "Enviar Notificação" quick action is hidden because no compose route exists yet.
- **Student Administration is read-only triage.** It surfaces the issues
  (no portal account, missing email, status mismatches, enrollments missing
  class group / level) and **deep-links each row to Student 360**
  (`/students/{id}`) where account provisioning lives. It does **not** perform
  inline create-account / resend-invite actions — those remain the
  responsibility of Student 360 and its `ensureStudentPortalUser` flow. This is
  intentional: the portal does not duplicate provisioning logic. Portal-account
  *status* is derived directly from `Student.userId` (null ⇒ no login).

## Future improvements

- Required-document rule engine → real "missing documents" queue + KPI.
- Document expiry tracking → expired-documents compliance metric.
- Inline account provisioning / resend-invite actions from the student
  administration panel (currently deep-links to Student 360).
- Per-secretary branch scoping if the org runs multiple branches.
