# Student User Provisioning

Automatically gives a student a Portal login (a `User` with the `STUDENT` role,
linked via `Student.userId`) when their enrollment becomes **ACTIVE** — so normal
cases need no manual account linking. Complements [student-portal.md](./student-portal.md).

## When an account is created

Provisioning runs on **both** enrollment-activation paths:

1. **Manual activation** — `ActivateEnrollmentCommand` emits the
   `enrollment.activated` domain event; `StudentUserProvisioningHandler`
   (`src/server/events/handlers/student-user-provisioning.handler.ts`) handles it.
2. **Payment-driven auto-activation** — `EnrollmentActivationEventHandler`
   (on `payment.confirmed`) sets the enrollment ACTIVE without re-emitting
   `enrollment.activated`, so it calls the provisioning service **directly**.

Both call the same idempotent service:

```
ensureStudentPortalUser({ organizationId, studentId, triggeredByUserId?, reason })
  → { status, userId?, inviteUrl?, tempPassword?, invited }
```
`src/modules/students/services/student-user-provisioning.service.ts`

It can also be called with `reason: "MANUAL" | "IMPORT"` from future admin/import flows.

## Policy switches

Per-organization, on `OrganizationSettings` (defaults shown):

| Field | Default | Effect |
|---|---|---|
| `autoCreateStudentUserOnActivation` | `true` | Master switch. `false` → service returns `skipped_by_policy` and does nothing. |
| `sendStudentPortalInvite` | `true` | Whether to issue an invite/notification after create/link. |
| `studentPortalInviteStrategy` | `INVITE_LINK` | `INVITE_LINK` or `TEMP_PASSWORD` (see below). |

When no settings row exists, the defaults above apply.

## Email requirement

A login needs an email. If `Student.email` is missing, the service returns
**`missing_email`**, creates **no** user, and records an audit entry — the
enrollment activation still succeeds. The secretary must add an email and
re-trigger (re-activation, or a future admin "Create access" action).

## Invite flow (INVITE_LINK — default)

1. A `User` is created with **no password** (`passwordHash = null`). Auth
   (`authorize`) rejects null-password accounts, so the account cannot be used
   until a password is set.
2. A single-use, 7-day token is issued (`VerificationToken`) and an invite URL
   `/set-password?token=…&email=…` is generated
   (`src/modules/users/services/account-invite.service.ts`).
3. A `student.portal_account_created` notification is sent to the user, carrying
   the invite URL in `actionUrl`.
4. The student opens `/set-password` (a **public** route — added to `proxy.ts`
   `PUBLIC_PATHS`), sets a password; the token is consumed (single-use) and the
   account is activated. They can then log in and land on `/student`.

### TEMP_PASSWORD strategy

The `User` is created with a randomly generated temporary password (bcrypt-hashed).
The plaintext temp password is returned **only** in the service result
(`result.tempPassword`) for the caller/admin to deliver out-of-band — it is
**never** placed in a notification, email, or audit log. (Surfacing it in an
admin UI is future work; until then this strategy is mainly for programmatic use.)

## Linking an existing user

If a `User` already exists with the student's email:

- If that user is already linked to a **different** student (anywhere — `Student.userId`
  is globally unique) → **`email_conflict`**, no changes.
- Otherwise it is **linked** (`Student.userId` set), and org membership +
  STUDENT role are ensured. An invite is sent only if that account has no
  password yet; an already-usable account just gains the role.

## Idempotency

- `Student.userId` set once → re-runs return `already_linked` and do nothing.
- `UserOrganization` and `UserRole` use `upsert` on their compound unique keys —
  never duplicated.
- The account-created notification dedupes on `referenceId = studentId`.
- Handler runs are also de-duplicated by the domain-event dispatcher
  (`DomainEventHandlerLog`, unique `(eventId, handlerName)`).

## Conflict / failure handling

The service **never throws** for recoverable business outcomes — it returns a
status (`missing_email`, `email_conflict`, `skipped_by_policy`) so enrollment
activation is never broken. It throws only for genuine programming/data errors
(student not found in the org → `NotFoundError`; missing `STUDENT` system role).
Handler-level throws are caught by the event dispatcher and logged as a FAILED
handler run without rolling back the (already committed) activation.

## Result statuses

`created` · `linked_existing_user` · `already_linked` · `missing_email` ·
`email_conflict` · `skipped_by_policy`

## Tenant isolation

The student is loaded with an `organizationId` filter, so a `studentId` from
another org resolves to null → `NotFoundError`. A user already bound to a student
in any other org is rejected as `email_conflict` (global `Student.userId`
uniqueness). Org membership + role are always assigned for the **triggering**
org only.

## Admin panel (Student 360)

Automatic provisioning on activation remains the **primary** flow. The Student 360
**Overview tab** now also has a **"Conta do Portal do Aluno"** card
(`student-portal-account-card.tsx`) for staff remediation/visibility.

- **Status DTO** — `getStudentPortalAccountStatus(studentId, organizationId)`
  returns `{ status, studentId, studentEmail, linkedUser?, invite?, policy }`.
  Status is one of: `linked`, `not_linked`, `missing_email`, `email_conflict`,
  `invite_pending`, `invite_expired`, `disabled_by_policy`. It never returns
  password hashes or token values; `invite.sentAt` is derived (VerificationToken
  has no `createdAt`).
- **Actions** (`src/modules/students/actions/portal-account.actions.ts`), all
  gated by `students.managePortalAccount`:
  - `createOrLinkStudentPortalAccountAction` → `ensureStudentPortalUser({ reason: "MANUAL" })`
  - `resendStudentPortalInviteAction` → `resendStudentPortalInvite` (creates/links
    first if needed; invalidates prior unused tokens; no-op `already_active` if the
    account already has a password)
  - `unlinkStudentPortalAccountAction` → `unlinkStudentPortalAccount` (clears
    `Student.userId`, invalidates outstanding invites; **does not** delete the
    `User` or remove the role). Additionally asserts the caller is ORG_ADMIN/
    SUPER_ADMIN (defense-in-depth on top of the permission).

### Permission

`students.managePortalAccount` — granted to ORG_ADMIN / SUPER_ADMIN (via their
permission wildcard); **not** SECRETARY/TEACHER. Viewing the card only needs
`students.read` (the page's gate), so a secretary sees status but no action
buttons (`canManage` is false). Run `db:seed` after pulling — runtime permissions
come from the DB `RolePermission` table.

### Invite link exposure

The one-time invite URL is shown in the card **only** immediately after a
successful create/resend (held in component state, not persisted) and only to
users who can manage. It is never rendered for low-privilege viewers.

### Audit events

`student.portal_user_provisioned` (create/link), `student_portal_account.invite_resent`,
`student_portal_account.unlinked`. Tokens and passwords are never logged.

## Notifications

`student.portal_account_created` is sent via the plain `createNotification`
path (guaranteed in-app delivery, no dependency on per-org notification rules).
The invite URL travels in `actionUrl`. Email delivery of the invite depends on
the Notifications Center email pipeline being configured for the org.

## Known limitations / future work

- `TEMP_PASSWORD` has no UI surface to reveal the generated password yet (the
  admin card surfaces the INVITE_LINK URL, not temp passwords).
- Invite emails rely on the (separate) notification email delivery pipeline.
- `invite.sentAt` / `usedAt` are approximate/absent — the invite is stored as a
  standard `VerificationToken` (no `createdAt`/`usedAt`); a richer invite model
  could track these precisely.
