# Guardian / Parent Portal

The Guardian Portal is the **responsible-party view** over one or more linked
students. It answers, for a parent/guardian: which children do I have, how is
each one doing academically, what grades were published, how is attendance, are
there pending payments, missing documents, important notifications, and upcoming
events.

It is deliberately **not** Student 360 and **not** the Student Portal:

| Surface             | Route                      | Audience            | Purpose                              |
| ------------------- | -------------------------- | ------------------- | ------------------------------------ |
| **Student 360**     | `/students/[studentId]`    | Staff (admin)       | Administrative profile of a student  |
| **Student Portal**  | `/student`                 | The student         | Student self-service                 |
| **Guardian Portal** | `/guardian`                | Parent / guardian   | Cross-student responsible-party view |

## Route

`src/app/(org)/guardian/page.tsx` — plus `loading.tsx` and `error.tsx`
(same pattern as the Student/Teacher portals).

- No `studentId` is required in the route. The default dashboard shows the
  guardian's first (primary) linked student.
- A student can be selected via the `?studentId=` query param. **The query param
  is only a selection *request*** — the server validates it against the
  guardian's `GuardianStudent` links before any read. A forged/foreign id is
  ignored and the portal falls back to the first linked student.

## Role & permissions

- **`GUARDIAN`** system role (`SYSTEM_ROLES.GUARDIAN`), seeded by `prisma/seed.ts`.
- **`GUARDIAN_PORTAL_VIEW`** (`guardianPortal.view`) — gates `/guardian`.
  - Granted to: `GUARDIAN`, and `ORG_ADMIN`/`SUPER_ADMIN` (preview/support, via
    their full-permission wildcard).
  - **Not** granted to `STUDENT`, `TEACHER`, or `SECRETARY`.
- **`GUARDIAN_LINKS_MANAGE`** (`guardianLinks.manage`) — gates the Student 360
  "Encarregados" admin card and its actions.
  - Granted to: `ORG_ADMIN`/`SUPER_ADMIN` (wildcard) and `SECRETARY`.
  - **Not** granted to `GUARDIAN`, `STUDENT`, or `TEACHER`.

The `GUARDIAN` role holds an intentionally tiny permission set
(`GUARDIAN_PORTAL_VIEW` + own-notification permissions). All academic /
attendance / finance / document data is aggregated server-side from the
guardian's links and gated by the per-link visibility flags — **never** by coarse
role permissions.

## The `GuardianStudent` relationship

```
GuardianStudent
  id, organizationId
  guardianUserId   → User (GUARDIAN role) — the guardian's login
  studentId        → Student
  relationshipType (GuardianRelationshipType: FATHER|MOTHER|GUARDIAN|SPONSOR|OTHER)
  isPrimary
  canViewAcademic, canViewAttendance, canViewFinance,
  canViewDocuments, canReceiveNotifications     ← per-link visibility flags
  createdAt, updatedAt, deletedAt, createdBy, updatedBy
```

- The guardian is a plain **`User`** with the `GUARDIAN` role — there is no
  dedicated `Guardian` entity, so the same person can hold other roles in other
  orgs without collision.
- **One guardian ↔ many students**, and **one student ↔ many guardians**.
- The relationship is **organization-scoped**.
- Guardian access is **never inferred** from a student's email/contact — a link
  must be created explicitly (provisioning or the Student 360 admin card).

### Indexes & the active-link constraint

- `@@index([organizationId, guardianUserId])`
- `@@index([organizationId, studentId])`
- A **filtered unique index** `guardian_students_active_link_key` on
  `(organizationId, guardianUserId, studentId) WHERE deletedAt IS NULL`
  (hand-written in the migration). It is filtered — not a plain `@@unique` —
  because (a) a soft-deleted link must be able to coexist with a fresh re-link,
  and (b) SQL Server treats multiple `NULL`s as duplicates under a plain unique
  index. See `prisma/migrations/20260628120000_add_guardian_student/`.

> **⚠️ Manually-maintained index — do not lose it.**
> Prisma cannot express a partial/filtered index, so this constraint is **not**
> in `schema.prisma` and exists **only** in the migration SQL. Two consequences:
> 1. `prisma migrate dev` (shadow-DB diff) will see the index as drift and try to
>    **drop** it. This project authors migrations by hand and deploys with
>    `prisma migrate deploy`; never let `migrate dev` rewrite this migration. If
>    you must regenerate, re-add the `CREATE UNIQUE NONCLUSTERED INDEX … WHERE
>    [deletedAt] IS NULL` statement by hand.
> 2. `ensureGuardianLink` is a find-then-create, so this index is the **only**
>    guard against a duplicate ACTIVE link under concurrent provisioning. A
>    losing concurrent insert raises a unique violation that propagates to the
>    caller (never swallowed into a fake success). See the comment on
>    `ensureGuardianLink` in `guardian-provisioning.service.ts`.
>
> Because the guarantee lives at the DB layer, it can only be fully verified by
> an **integration test against a real SQL Server** (the unit suite mocks the
> Prisma client, so the index can't fire there). The unit suite instead asserts
> the surrounding contract: an existing link is reused (no duplicate `create`),
> and a unique violation from `create` propagates rather than being swallowed.

## Per-link visibility flags

Each link carries five booleans. The portal fetches and renders a section
**only** when its flag is true — a forbidden section is never even queried:

| Flag                      | Hides when false                                  |
| ------------------------- | ------------------------------------------------- |
| `canViewAcademic`         | Grades, assessments, academic KPIs, status        |
| `canViewAttendance`       | Attendance KPIs/trend/sessions, attendance KPIs   |
| `canViewFinance`          | Payments summary, invoices, payment history, KPIs |
| `canViewDocuments`        | Documents panel                                   |
| `canReceiveNotifications` | Unread-notification KPI                            |

Upcoming classes/events are shown when **either** academic **or** attendance
visibility is granted.

Defaults on a new link: academic/attendance/documents/notifications **on**,
finance **off** (finance is the most sensitive, so it is opt-in per link).

## Selected-student validation

`getGuardianPortalData(context, requestedStudentId?)`:

1. Resolve the guardian from `context.userId` (never the request).
2. Load ACTIVE links by `(organizationId, guardianUserId)`.
3. If none → **blocked state** (`students: []`, `selected: null`).
4. Validate `requestedStudentId` against the links; if invalid, fall back to the
   first (primary) linked student.
5. Fetch the selected student's data, gated by the link's flags.

## Finance visibility

Finance is **self-scoped to the selected student** — there is no organization-wide
finance anywhere in the portal. It is built from the same
`StudentFinancialStatement` Student 360 uses, and only when `canViewFinance` is
true for that link.

## Notification privacy

A guardian only ever sees notifications addressed to **their own user**
(`recipientUserId = guardianUserId`). A child's private notifications are **never**
surfaced unless they were explicitly sent (copied) to the guardian's user. For
v1 this is simply "the guardian's own notification inbox".

## Provisioning

`ensureGuardianPortalUser(input)` (in
`src/modules/guardian-portal/services/guardian-provisioning.service.ts`) is pure
and **idempotent**:

- Creates or links a `User` by email, assigns the `GUARDIAN` role
  (`UserOrganization` + `UserRole` upserts), and creates a `GuardianStudent` link.
- Issues a set-password **invite link** (reusing `createStudentPortalInvite`) for
  accounts without a password, and sends a notification. **Never** sends or
  stores a plaintext password.
- Emails are canonicalized via the shared `normalizeEmail` (`src/shared/lib/email.ts`,
  trim + lower-case) used by **both** guardian and student provisioning, so
  lookups/creates never diverge by case.

Statuses: `created`, `linked_existing_user`, `already_linked`, `missing_email`,
`email_conflict`, `skipped_by_policy`.

- `email_conflict` is returned when the email already belongs to a `User` that has
  a **student or teacher profile** — we never co-opt a student's/teacher's own
  self-service login as a guardian account (the nav/data scoping is single-role
  per account; see _Known limitations_).
- Repeated calls never duplicate users, roles, or links.

## Student 360 guardian management

Student 360 → Overview tab → **"Encarregados"** card (gated by
`GUARDIAN_LINKS_MANAGE`):

- Lists linked guardians with relationship, per-link permission badges, primary
  flag, email, and account/invite status.
- Actions: **add guardian** (email + name + relationship + visibility flags),
  **resend invite**, **edit visibility**, **remove link** (soft delete).

Server actions live in
`src/modules/guardian-portal/actions/guardian-links.actions.ts`.

## Navigation

- Nav item **"Portal do Encarregado"** → `/guardian`, gated by
  `guardianPortal.view`.
- A guardian-scoped user's sidebar is locked to an allowlist:
  **Portal do Encarregado** + **Notificações** only. No student lists, finance
  dashboards, reports, settings, or other portals.
- `/guardian` is a guardian-only surface — hidden from everyone who isn't a
  guardian (admins may still navigate directly for preview/support).
- See `src/app/(org)/_components/nav-links.tsx`
  (`GUARDIAN_NAV_ALLOWLIST` / `GUARDIAN_ONLY_HREFS`).

### Redirect behaviour

There is intentionally **no** `redirectIfGuardianScoped` page guard (unlike the
student/teacher rollouts). It isn't needed: the `GUARDIAN` role holds only
`GUARDIAN_PORTAL_VIEW` + own-notification permissions, so every other `(org)`
page's `requirePermissionOrRedirect`/`requireRoleOrRedirect` gate already denies
a guardian and sends them to `/forbidden`. In other words, **permissions** —
not a per-page scoped redirect — are the lock-down. The only reachable surfaces
are `/guardian` and `/notifications`. The trade-off is purely cosmetic: a
guardian who manually types a disallowed URL lands on `/forbidden` rather than
being bounced to `/guardian`. If that UX is ever wanted, add a
`redirectIfGuardianScoped(context, "/guardian")` helper mirroring
`student-scope.ts` and call it from the relevant pages.

## Security invariants

Enforced server-side, never trusted from the client:

- `guardianUserId = context.userId`; `organizationId = active org`.
- `selectedStudentId` is validated against `GuardianStudent` before any read.
- Per-link flags are enforced server-side; a forbidden section is never queried.
- No finance/academic/attendance/documents unless the corresponding flag is true.
- No child private notifications unless copied to the guardian.
- No cross-student and no cross-tenant data.

## Module layout

```
src/modules/guardian-portal/
  components/        guardian-portal-header, guardian-student-selector,
                     guardian-academic-overview, guardian-kpi-cards,
                     guardian-upcoming-events, guardian-grades-panel,
                     guardian-attendance-panel, guardian-payments-panel,
                     guardian-documents-panel, guardian-notifications-panel,
                     guardian-empty-state, student-guardians-card
  services/          guardian-portal.service, guardian-portal-academic.service,
                     guardian-portal-finance.service,
                     guardian-portal-notifications.service,
                     guardian-provisioning.service
  repositories/      guardian-portal.repository
  actions/           guardian-links.actions
  types/             index
src/server/auth/guardian-scope.ts
```

Most panels reuse the proven Student Portal panels (grades, attendance, payments,
documents, notifications, upcoming classes) — the engines are not duplicated.

## Known limitations / future work

- **Single-role accounts**: a guardian account cannot also be a student/teacher
  self-service login (`email_conflict`), because the nav/data scoping is
  single-role per account. A teacher-who-is-also-a-parent needs a distinct
  guardian email. A future enhancement could support multi-role scoping.
- **Notifications v1**: only the guardian's own inbox is shown. Child-related
  notifications are not yet fan-out/copied to guardians.
- **Documents v1**: read-only — no upload/delete from the Guardian Portal.
- **No org policy toggle**: guardian provisioning is always explicit/manual
  (`skipped_by_policy` is reserved but never returned). Auto-provisioning from an
  enrollment form is future work.
- **Selector enrollment labels**: course/class labels in the selector come from
  the student's most recent ACTIVE (else latest) enrollment.
