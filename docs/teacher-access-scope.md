# Teacher Access Scope

## Principle

A user with the **TEACHER** role (who is **not** also ORG_ADMIN/SUPER_ADMIN) only ever sees data tied to their own linked Teacher profile — on **every** page, not just the Teacher Portal (`/teacher`). The Teacher Portal is the richest scoped surface, but it is *not* the only one: the handful of operational list pages a teacher can still reach are scoped too, and every other (org) page is blocked for them.

This is enforced **server-side**, in the data layer and page guards — never by UI filters, and never by trusting a client-supplied `teacherId`.

## How `teacherId` is resolved

Always: `currentUser.id → Teacher.userId → Teacher.id`, via `getTeacherByUserId(organizationId, userId)`. `teacherId` is **never** read from a URL segment, query string, or form field. There is no code path where a teacher-scoped page accepts a `teacherId` parameter — the scoped pages' `searchParams` types don't even include one.

`organizationId` always comes from the active-org context (`requireOrganization()` / `requirePermissionOrRedirect()`), as everywhere else in the app.

## The central helper — `src/server/auth/teacher-scope.ts`

| Export | Purpose |
|---|---|
| `type DataAccessScope` | Discriminated union: `{ type: "organization"; organizationId }` \| `{ type: "teacher"; organizationId; teacherId }`. The thing a list page passes down. |
| `isTeacherScopedRoles(roles)` | Pure role test (no DB). `false` for ORG_ADMIN/SUPER_ADMIN (even if they also hold TEACHER) and for SECRETARY/STUDENT; `true` for anyone else holding TEACHER. Used by the nav server component and tests. |
| `resolveTeacherScope(context)` | Resolves `{ isTeacherScoped, teacherId?, userId, organizationId }`. `teacherId` is `undefined` when teacher-scoped but no Teacher profile is linked. |
| `resolveDataAccessScope(context)` | Returns a `DataAccessScope` for list pages. **Throws `AuthorizationError`** when teacher-scoped with no linked profile — a list page must never silently fall back to org-wide data. |
| `redirectIfTeacherScoped(context, to = "/teacher")` | Page guard for org-wide pages a teacher must not reach — redirects them to their Portal. No-op for everyone else. |

### Why ORG_ADMIN/SUPER_ADMIN are never scoped

They're trusted with org-wide data by definition. If an admin happens to also hold the TEACHER role, they are treated as an admin (not scoped) — `isTeacherScopedRoles` checks for an admin role first. SUPER_ADMIN typically isn't a member of the active org's roles at all, so they naturally fall through to "not scoped."

## What happens when no Teacher profile is linked

- **Scoped list pages** (`resolveDataAccessScope`): throw `AuthorizationError` → surfaces as `/forbidden`, never org-wide data.
- **Blocked pages** (`redirectIfTeacherScoped`): redirect to `/teacher`.
- **Teacher Portal** (`/teacher`): shows its own "Esta conta ainda não está vinculada a um perfil de professor." blocked card (see `docs/teacher-portal.md`).

## Page-by-page policy

A teacher-scoped user may reach only the **scoped surfaces** below; every other `(org)` page redirects them to `/teacher`.

### Allowed — scoped surfaces (in the teacher sidebar)

| Route | Scoping | Mechanism |
|---|---|---|
| `/teacher` | The teacher's own portal | Resolves teacher from `userId`; see `docs/teacher-portal.md` |
| `/class-groups` | Only class groups where `teacherId = me` | Early-return minimal table; `getClassGroupsByOrganization({ teacherId })` |
| `/students` | Only students enrolled in a class group I teach | Early-return minimal table; `findManyByOrganization({ teacherId })` → `enrollments.some.classGroup.teacherId` |
| `/attendance` | Redirects to `/attendance/sessions` (hub shows org-wide stats) | `redirectIfTeacherScoped(context, "/attendance/sessions")`-style redirect |
| `/attendance/sessions` | Only sessions where `teacherId = me`; class-group filter limited to my groups | Early-return minimal table; `getAttendanceSessionsByOrganization({ teacherId })` |
| `/assessments` | Only assessments where `teacherId = me` | Early-return minimal table; `listAssessmentsForDashboard({ teacherId })` |
| `/notifications` | Already scoped by `recipientUserId` (unchanged) | Existing notifications module |

For the four dashboard pages above (class-groups, students, attendance/sessions, assessments), the teacher gets an **early-return minimal scoped view**: a `PageHeader` + the scoped table only. The org-wide KPI cards, trend charts, distribution donuts, and watchlists — whose underlying services have no teacher-scope parameter — are **not fetched and not rendered** for a teacher-scoped request. The admin code path below the early return is untouched.

Single-record / action pages reached *from* these surfaces (e.g. `/attendance/sessions/[id]/mark`, `/assessments/[id]/grade`, `/class-groups/[id]`, `/students/[id]`, the teacher's own `/teachers/[teacherId]`) are intentionally **not** blocked: each operates on one record that already belongs to the teacher (or their class), and each has its own permission gate. Only the org-wide *list/dashboard* surfaces are the leak risk.

### Blocked — redirect to `/teacher`

These render org-wide KPIs/charts/watchlists with no teacher-scope parameter, so rather than half-scope them (which would leave aggregate leaks) they redirect teacher-scoped users to their Portal:

`/enrollments`, `/grades`, `/student-progress`, `/courses`, `/level-progression`, `/subjects`, `/lessons`, `/schedules`, `/classroom-bookings`, `/academic-calendar`.

Each calls `await redirectIfTeacherScoped(context)` immediately after its permission guard.

### Forbidden — finance & admin (already unreachable)

TEACHER holds **zero** finance permissions (`invoices.*`, `payments.*`, `receipts.*`, `wallets.*`, `paymentPlans.*`, `refunds.*`, `feeDefinitions.*`, `billingPolicies.*`, `discountRules.*`, `taxRules.*`, `financialReports.*`) — verified by a unit test. Finance, Reports, Settings, Users, and the org Executive Dashboard (`/dashboard`, ORG_ADMIN-role-gated) were already unreachable via their existing permission/role guards; this change adds nothing there.

## Sidebar navigation

`NavLinks` (`src/app/(org)/_components/nav-links.tsx`) filters the menu by permission as before, then — when `isTeacherScopedRoles(ctx.roles)` is true — intersects with a `TEACHER_NAV_ALLOWLIST` (`/teacher`, `/class-groups`, `/students`, `/attendance`, `/assessments`, `/notifications`). A teacher therefore sees only the scoped surfaces in their sidebar, mirroring the page-level guards. ("Minhas Turmas"/"Meus Alunos" in the spec map to the scoped `/class-groups` and `/students`; the existing nav labels are kept.)

## Adding a new TEACHER-reachable page later

1. Add a `teacherId`/`scope` filter to its list repository (or reuse an existing `teacherId` param).
2. In the page, after the permission guard, `const scope = await resolveDataAccessScope(context)` and early-return a scoped view when `scope.type === "teacher"` (skip org-wide widgets).
3. Add the route to `TEACHER_NAV_ALLOWLIST`.
4. If it can't be safely scoped yet, instead call `await redirectIfTeacherScoped(context)` and leave it off the allowlist.

## Known limitations / trade-offs

- **Lock-down over retrofit.** The 8 heavy executive dashboards aren't individually re-scoped (their ~40 KPI/trend/distribution/watchlist services have no scope param). Teachers get a minimal scoped table on the 4 kept surfaces and are redirected away from the rest. Re-scoping a blocked page's full dashboard for teachers is a future enhancement, not a security gap.
- **Lesson authoring, subjects, calendar, schedules** are currently blocked for teachers under the minimal-nav policy. If teachers need a scoped version of any of these, add it per the steps above.
- **"My students" = enrolled in any class group I teach.** A student in two teachers' class groups appears for both — the intended definition of "my students."
- **`canViewOrgWide` proxy** (used by the Teacher Portal's Quick Actions, see `docs/teacher-portal.md`) and this module's `isTeacherScopedRoles` are two sides of the same role test; both treat ORG_ADMIN/SUPER_ADMIN as unrestricted.
