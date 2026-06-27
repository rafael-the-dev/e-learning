# Student Portal

The **Student Portal** (`/student`) is the self-service daily workspace for a
user with the `STUDENT` role. It answers, for the logged-in student only: *What
is my academic status? My course and level? What classes and assessments do I
have? Which grades are published? How is my attendance? Do I owe anything? Any
notifications or documents?*

## Student Portal vs Student 360

| | Student Portal (`/student`) | Student 360 (`/students/[studentId]`) |
|---|---|---|
| Audience | The student themselves | Secretary / admin staff |
| Permission | `studentPortal.view` | `students.read` |
| Scope | Always the current user's own data | Any student in the org |
| Identity | Resolved server-side from `currentUser.id` | `studentId` from the URL |
| Purpose | Self-service overview | Administrative case file |

They are **distinct surfaces** — the Portal is not a re-skin of 360. The Portal
reuses 360's read services (it must never duplicate the aggregation engine), but
its route, permission, and identity model are independent.

## Route

- `src/app/(org)/student/page.tsx` — the page (server component)
- `src/app/(org)/student/loading.tsx` — skeleton
- `src/app/(org)/student/error.tsx` — error boundary

The route takes **no `studentId`** in the URL or query string. The student is
resolved as `currentUser.id → Student.userId` (see *Self-scoping*). Passing any
id is impossible by construction — there is no parameter to pass.

## Permission & access control

`STUDENT_PORTAL_VIEW` (`studentPortal.view`):

| Role | Access |
|---|---|
| `STUDENT` | ✅ their own Portal |
| `ORG_ADMIN` / `SUPER_ADMIN` | ✅ via permission wildcard (preview/support) |
| `SECRETARY` | ❌ |
| `TEACHER` | ❌ |

The page guards with `requirePermissionOrRedirect(PERMISSIONS.STUDENT_PORTAL_VIEW)`
(redirects to `/forbidden` for anyone else).

## Self-scoping

`src/server/auth/student-scope.ts` is the single source of truth for "is this
request student-scoped, and to which studentId" — mirroring `teacher-scope.ts`.

- `isStudentScopedRoles(roles)` — pure role test. True for `STUDENT` who is not
  also `ORG_ADMIN`/`SUPER_ADMIN`.
- `resolveStudentScope(context)` — resolves `studentId` from `Student.userId`
  (org-scoped lookup, never client input).
- `resolveStudentDataAccessScope(context)` — discriminated `StudentDataAccessScope`
  for list services; throws `AuthorizationError` when student-scoped but unlinked.
- `redirectIfStudentScoped(context, to = "/student")` — page guard that bounces
  a student-scoped user away from org-wide pages.

`Student.userId` was added to the schema (nullable, unique) to link a student
record to a platform login — most students are managed administratively and have
no login, so the column is nullable with a **filtered** unique index (SQL Server
treats all NULLs as equal under a plain UNIQUE). Migrations:
`20260626120000_add_student_user_link_step1` (ADD COLUMN) and `…_step2`
(filtered unique index + FK) — split because SQL Server cannot reference a
column added earlier in the same batch.

### Lock-down (org-wide pages)

A `STUDENT` holds view permissions for several org-wide list pages
(`/grades`, `/student-progress`, `/attendance`, `/enrollments`, `/lessons`,
`/classroom-bookings`, `/academic-calendar`, `/invoices`, `/payments`,
`/receipts`). Each of those pages calls `redirectIfStudentScoped(context)` right
after resolving the auth context, so a student typing the URL is sent to
`/student` instead of seeing **all** students' data. The sidebar mirrors this via
`STUDENT_NAV_ALLOWLIST` in `nav-links.tsx` (only `/student` + `/notifications`),
and `STUDENT_ONLY_HREFS` hides `/student` from non-students (admins hold the
permission via wildcard). Post-login, `getPostLoginRedirect()` sends students to
`/student`.

## Data sources (reuse map)

`getStudentPortalData(studentId, studentName, userId, organizationId)` in
`src/modules/student-portal/services/student-portal.service.ts` aggregates:

| Section | Source |
|---|---|
| Academic overview, finance, wallet, progress, attendance subjects | `getStudent360Core` (reused wholesale) |
| Current level | `resolveCurrentEnrollmentLevel` (reused — see below) |
| Upcoming classes | `findStudentUpcomingClasses` (AttendanceSession, next 7 days, own class groups) |
| Assessments | `findStudentAssessments` (own class groups; score masked unless published) |
| Published grades | `findStudentPublishedGrades` (own results; PUBLISHED publications only) |
| Attendance KPIs / trend | `findStudentAttendanceForStats` + `buildStudentAttendanceKpis`/`Trend` |
| Attendance session rows | `findAttendanceRecordsByStudent` (Student 360 repo) |
| Notifications | `getUnreadCount` / `getLatestForUser` (by `recipientUserId`) |
| Documents | `getStudentDocuments` (Student Documents module) |

Every portal-specific query lives in `student-portal.repository.ts` and is bound
to `organizationId` plus either `studentId` or the student's own active class
group ids — never trusting the caller to pre-filter.

### Current level resolution

`currentLevelId ?? courseLevelId` (via `resolveCurrentEnrollmentLevel`). The
level-progression engine only ever writes `currentLevelId` on promotion;
`courseLevelId` stays frozen at the enrollment level. This avoids the old
Student 360 bug of showing the original level after a promotion.

## Finance visibility

For v1, a student sees **their own** finance (outstanding balance, unpaid/overdue
invoices, payment history, wallet balance) — never org finance KPIs or other
students. If a school later wants finance hidden from students by policy, gate
the payments panel behind a configurable org setting; the data layer is already
self-scoped so only the render needs gating.

## Published grades only

Grades are surfaced through two paths, both of which **only ever expose published
results**:

- The **Grades panel** queries `AssessmentResult` filtered at the DB level to
  `assessment.publication.publicationStatus = "PUBLISHED"`.
- The **Assessments panel** may list an as-yet-unpublished assessment (so the
  student knows it exists), but the score is **masked to `null`** unless its
  publication is `PUBLISHED`.

DRAFT/unpublished results can never leak.

## Blocked state

If the user has the `STUDENT` role but:

- **no linked Student profile** → "Esta conta ainda não está vinculada a um
  perfil de aluno."
- **linked to a non-ACTIVE student** (PENDING/SUSPENDED/COMPLETED/DROPPED) →
  "Este perfil de aluno não está activo."

`resolveStudentPortalBlockedReason(student)` is the pure gate (`NOT_LINKED` |
`INACTIVE` | `null`).

## Account provisioning

Students get their Portal login automatically when their enrollment becomes
ACTIVE — see [student-user-provisioning.md](./student-user-provisioning.md).
`Student.userId` linking is no longer a manual step in normal cases.

## Known limitations / future work

- **Detail pages**: v1 deliberately ships no student-facing detail routes
  (invoice/assessment/document detail). The Portal links only to in-page anchors
  and `/notifications`. Before adding any detail page, add the ownership guards
  sketched in the spec (`assertStudentCanAccessInvoice`, `…Assessment`,
  `…Document`, `…Enrollment`) to prevent IDOR — a `STUDENT` still technically
  holds some view permissions, so a hand-typed detail URL is not yet guarded
  per-record.
- **Attendance justified vs unjustified** is derived from record status
  (`EXCUSED` = justified, `ABSENT` = unjustified); it does not yet reflect the
  `AttendanceJustification` approval workflow.
- **Attendance trend / stats** read up to the most recent 1000 of the student's
  own records (a hard cap; a single student is far below it in practice).
- **Service split**: the spec listed several fine-grained service files; the
  implementation consolidates them into `student-portal.service.ts` (orchestrator
  + builders) and `student-portal-attendance.service.ts` (pure aggregation) plus
  the repository, to avoid one-function files. Behaviour is unchanged.
