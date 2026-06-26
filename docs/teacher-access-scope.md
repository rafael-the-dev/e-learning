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
| `/grades` | Results for **my own subjects** — `assessmentEvent.teacherId = me` OR (`enrollment.classGroup.teacherId = me` AND `subjectId ∈ my subjects`) | Early-return **"Minhas Notas"** workspace; `listGradeResults({ teacherId, ownedSubjectIds })` + `getTeacherGradeKPIs` |
| `/student-progress` | Students in my class groups; subject KPIs only for **my own subjects** (`levelSubject.subjectId ∈ my subjects`) | Early-return **"Progresso dos Meus Alunos"** workspace; `listProgressForDashboard({ teacherId })` + `getTeacherProgressKPIs({ ownedSubjectIds })` |
| `/notifications` | Already scoped by `recipientUserId` (unchanged) | Existing notifications module |

For the dashboard pages above (class-groups, students, attendance/sessions, assessments, grades, student-progress), the teacher gets an **early-return scoped view**: a `PageHeader` + teacher-scoped KPIs + the scoped table only. The org-wide KPI cards, trend charts, distribution donuts, watchlists, and per-teacher comparisons — whose underlying services have no teacher-scope parameter — are **not fetched and not rendered** for a teacher-scoped request. The admin code path below the early return is untouched.

#### Scoped academic workspaces — `/grades` & `/student-progress`

Both branch on `resolveDataAccessScope(context)`: `type === "teacher"` renders the scoped workspace and returns early; `type === "organization"` falls through to the existing executive dashboard (ORG_ADMIN / SUPER_ADMIN / SECRETARY unchanged).

- **`/grades` → "Minhas Notas".** KPIs: *Avaliações por Corrigir* (DRAFT+SUBMITTED), *Resultados Lançados* (GRADED), *Média das Minhas Avaliações* (avg normalized grade), *Alunos em Risco* (distinct students FAILED in **my** subjects). Table: *Resultados por Lançar / Corrigir*, filterable by class group / subject / status / search — the subject dropdown lists **only the teacher's own subjects**. Empty state: *"Não existem avaliações por corrigir."*
- **`/student-progress` → "Progresso dos Meus Alunos".** Student/course-level KPIs (scoped to students in my class groups): *Alunos em Curso*, *Bloqueados*, *Em Recuperação*. Subject-level KPIs (scoped to **my own subjects**): *Disciplinas Aprovadas*, *Disciplinas Reprovadas*, *Baixa Frequência* (`attendancePercentage < 75`), *Sem Avaliação* (`NOT_STARTED`), *Elegíveis para Intervenção* (distinct at-risk students — blocked ∪ my-failed-subject ∪ my-low-attendance). The course-progress table reuses `StudentProgressDashboardTable` (rows link to `/enrollments/[id]`, itself ownership-guarded). Empty state: *"Não existem alunos associados às suas turmas."*

#### Two-tier ownership — class group controls *students*, subject controls *grades/progress*

A class group has a single homeroom `teacherId`, but **different teachers may teach different subjects within it**. So class-group ownership alone would let a homeroom teacher see a co-teacher's subject grades. These two surfaces therefore use a **two-tier** model:

- **Class-group ownership** (`classGroup.teacherId = me`) controls which **students/classes** are visible — `/students`, `/class-groups`, the `/student-progress` course-progress table, attendance.
- **Subject ownership** controls which **grades / subject-progress** are visible. A teacher's owned subjects come from `getTeacherOwnedSubjectIds(orgId, teacherId)` = `TeacherSubject.subjectId` (the canonical assignment) **∪** the subjects of assessments they authored (`Assessment.teacherId = me`).

**`/grades` ownership predicate** (`teacherGradeScopeAnd`): a result is the teacher's iff
`assessmentEvent.teacherId = me` **OR** (`enrollment.classGroup.teacherId = me` **AND** `subjectId ∈ ownedSubjectIds`).
The event branch lets a teacher's authored-event results appear even in another teacher's class group; the AND branch stops a homeroom teacher from seeing a co-teacher's subject grades in a shared class group **and** stops a teacher from seeing their subject in a class group they don't teach (the class-group bound is required, not optional). Query-param filters (`classGroupId`, `subjectId`, `status`, `search`) are **ANDed on top**, so they can only narrow — never widen — and a forged `subjectId` for a subject the teacher doesn't own returns nothing (only their own authored-event rows, if any).

**`/student-progress` subject KPIs** (`subjectProgressScope`) require **both** `enrollment.classGroup.teacherId = me` **and** `levelSubject.subjectId ∈ ownedSubjectIds` — *"meus alunos, nas minhas disciplinas"*. A teacher never counts their subject's progress for students in a class group they don't teach. Student/course-level KPIs (in-progress, blocked, recovery) stay class-group scoped only.

**Fail-closed — no fallback.** When `getTeacherOwnedSubjectIds` returns **empty** (no `TeacherSubject` assignment *and* no authored assessment — no subject-ownership signal at all), the system **cannot prove academic ownership**, so it fails closed:
- `/grades` — branch B is disabled; only authored-event results are visible (a teacher who authored assessments still sees those). There is **no** fallback to bare class-group access, so a homeroom teacher with no subject signal sees **no** co-teacher grades.
- `/student-progress` — every subject-level KPI is **0** and no `StudentSubjectProgress` query runs; the subject filter dropdown is empty. Student/class-level KPIs (students in my class groups) still render.

`getTeacherOwnedSubjectIds` = `TeacherSubject.subjectId` ∪ subjects of the teacher's **non-cancelled, non-archived** authored assessments. `teacherId` and `ownedSubjectIds` are **always** resolved server-side from `currentUser.id`, never from the request. No finance data, no org-wide KPIs, no other teachers' students or per-teacher comparisons are fetched on these paths.

Single-record / action pages reached *from* these surfaces are **not** blocked wholesale, but they must **enforce ownership** — a permission gate alone is not enough, because a teacher holds the same `*.view`/`*.mark`/`*.grade` permissions org-wide and could otherwise open another teacher's record by replaying its id (IDOR). Ownership is asserted server-side from the resolved `teacherId`; it never relies on the id being unguessable. See **Detail & write-path ownership** below.

### Blocked — redirect to `/teacher`

These render org-wide KPIs/charts/watchlists/reports with no teacher-scope parameter, so rather than half-scope them (which would leave aggregate leaks) they redirect teacher-scoped users to their Portal:

`/enrollments`, `/grades/entry`, `/courses`, `/level-progression`, `/subjects`, `/lessons`, `/schedules`, `/classroom-bookings`, `/academic-calendar`, `/attendance/reports`, `/attendance/justifications`, `/classrooms`, `/assessment-policies`, `/assessment-periods`.

Each calls `await redirectIfTeacherScoped(context)` immediately after its permission guard. (`/attendance` itself redirects teacher-scoped users straight to `/attendance/sessions`, their scoped list.)

`/grades/entry`, `/attendance/reports` and `/attendance/justifications` are org-wide over *student* data (not just config) — they were the highest-impact leaks closed by this policy. `/classrooms`, `/assessment-policies`, `/assessment-periods` are org-wide *reference/config* pages; under the strict policy teachers are redirected from them too.

**`/level-progression` stays blocked — by design.** Even though the teacher holds `LEVEL_PROGRESSION_VIEW`, level progression is an **academic/administrative decision** (promoting a student between course levels, approving progression requests), not teacher-owned operational work. Unlike grades and subject-progress — which a teacher *produces and acts on daily for their own students* — progression is owned by the secretariat/administration. It is therefore deliberately **not** given a scoped teacher view; teacher-scoped users are redirected to `/teacher`.

### Detail & write-path ownership — `src/server/auth/teacher-access.ts`

Single-record pages and the commands behind them enforce ownership with the
`assertTeacherCanAccess*` guards. Each is a **no-op** for ORG_ADMIN / SUPER_ADMIN
/ SECRETARY (anyone not teacher-scoped), and throws `AuthorizationError` for a
teacher-scoped caller who doesn't own the record (a teacher-scoped account with
no linked profile owns nothing, so it always throws). Ownership is resolved
server-side from the `teacherId`; **no reliance on id secrecy**.

| Guard | Owns when… |
|---|---|
| `assertTeacherCanAccessStudent` | student has an enrollment (`deletedAt: null`) in a class group I teach — mirrors the `/students` list filter exactly |
| `assertTeacherCanAccessClassGroup` | `classGroup.teacherId = me` |
| `assertTeacherCanAccessEnrollment` | enrollment is in a class group I teach (`classGroup.teacherId = me`) |
| `assertTeacherCanAccessAttendanceSession` | `session.teacherId = me` **OR** `session.classGroup.teacherId = me` |
| `assertTeacherCanAccessAssessment` | `assessment.teacherId = me` **OR** `assessment.classGroup.teacherId = me` |

**classGroup ownership is the source of truth.** Sessions and assessments carry a
*nullable* `teacherId`, so the guards (and the `/attendance/sessions` + `/assessments`
list scoping — see M1 below) accept *either* the record's own `teacherId` *or* the
owning class group's `teacherId`. This means a record for a class group I teach is
mine even if its `teacherId` was never set.

**Read pages** translate the thrown `AuthorizationError` into `notFound()` (404,
not 403) so they don't disclose that the record exists:

| Route | Guard |
|---|---|
| `/students/[studentId]` · `/students/[studentId]/timeline` | `assertTeacherCanAccessStudent` |
| `/class-groups/[classGroupId]` | `assertTeacherCanAccessClassGroup` |
| `/enrollments/[enrollmentId]` | `assertTeacherCanAccessEnrollment` |
| `/attendance/sessions/[sessionId]` · `…/mark` | `assertTeacherCanAccessAttendanceSession` |
| `/assessments/[assessmentId]` · `…/grade` | `assertTeacherCanAccessAssessment` |

**Write commands** call the same guards in `authorize()` (defense-in-depth, since
a server action can be invoked directly, bypassing the page): mark / bulk-mark /
complete / cancel attendance session (`assertTeacherCanAccessAttendanceSession`),
bulk-grade / update / publish assessment (`assertTeacherCanAccessAssessment`), and
per-enrollment grade entry (`assertTeacherCanAccessEnrollment`).

**Create-time class-group targeting is also scoped.** When a teacher-scoped user
creates an assessment (`CreateAssessmentCommand`) or attendance session
(`CreateAttendanceSessionCommand`), `authorize()` runs
`assertTeacherCanAccessClassGroup(context, input.classGroupId)` — so they can only
create records for a class group they teach, and a client-supplied `input.teacherId`
cannot widen that (ownership is the server-resolved `teacherId`). The create-form
class-group dropdowns are likewise scoped: `/assessments/new` filters its
`getFormDeps` class-group query, and `/attendance/sessions/new` passes the resolved
`teacherId` to `getSessionFormOptions`, so a teacher only ever sees their own groups
(an unlinked teacher sees none, via a sentinel id that matches nothing).

**Assigned teacher is forced to self.** Both create commands' `execute()` resolve
the stamped `teacherId` via `resolveAssignedTeacherId(context, input.teacherId)`:
for a teacher-scoped user it is **always their own** resolved `teacherId` — a
client-supplied value is ignored — so a teacher can never assign a record to another
teacher (a data-quality safeguard on top of the class-group ownership guard).
ORG_ADMIN/SECRETARY keep the teacher they choose. The create forms reflect this:
the assigned-teacher dropdown is scoped to the teacher themselves (so org teacher
names aren't even shipped to the client), and the attendance create form replaces
the selector with read-only text ("Professor atribuído: você") for teacher-scoped
users — but the server override is the real guarantee, not the disabled/hidden field.

> **Still readable (intentional, not IDOR):** curriculum **reference** detail
> (`/courses/[id]`, `/subjects/[id]`, `/lessons/[id]`) — shared org reference data,
> not per-teacher PII.

### M1 — list scoping uses the same OR

`/assessments` and `/attendance/sessions` list scoping now matches the ownership
guards: a teacher sees rows where `record.teacherId = me` **OR**
`record.classGroup.teacherId = me`, so the list and the detail page never diverge.
A `classGroupId` query param is AND-ed with this OR, so it can only *narrow* the
result — it can never widen scope to another teacher's data.

### Forbidden — finance & admin (already unreachable)

TEACHER holds **zero** finance permissions (`invoices.*`, `payments.*`, `receipts.*`, `wallets.*`, `paymentPlans.*`, `refunds.*`, `feeDefinitions.*`, `billingPolicies.*`, `discountRules.*`, `taxRules.*`, `financialReports.*`) — verified by a unit test. Finance, Reports, Settings, Users, and the org Executive Dashboard (`/dashboard`, ORG_ADMIN-role-gated) were already unreachable via their existing permission/role guards; this change adds nothing there.

## Sidebar navigation

`NavLinks` (`src/app/(org)/_components/nav-links.tsx`) filters the menu by permission as before, then — when `isTeacherScopedRoles(ctx.roles)` is true — intersects with a `TEACHER_NAV_ALLOWLIST` (`/teacher`, `/class-groups`, `/students`, `/attendance`, `/assessments`, `/notifications`). A teacher therefore sees only the scoped surfaces in their sidebar, mirroring the page-level guards. ("Minhas Turmas"/"Meus Alunos" in the spec map to the scoped `/class-groups` and `/students`; the existing nav labels are kept.)

## Adding a new TEACHER-reachable page later

**List / dashboard page:**
1. Add a `teacherId`/`scope` filter to its list repository (or reuse an existing `teacherId` param).
2. In the page, after the permission guard, `const scope = await resolveDataAccessScope(context)` and early-return a scoped view when `scope.type === "teacher"` (skip org-wide widgets).
3. Add the route to `TEACHER_NAV_ALLOWLIST`.
4. If it can't be safely scoped yet, instead call `await redirectIfTeacherScoped(context)` and leave it off the allowlist.

**Single-record / write page:** after the permission guard, call the matching
`assertTeacherCanAccess*` (page → translate `AuthorizationError` to `notFound()`;
command → call it in `authorize()`). If no guard fits the entity, add one to
`teacher-access.ts`.

**Regression test.** `src/server/auth/__tests__/teacher-route-guards.test.ts` scans
every `(org)/**/page.tsx`: any page whose entry permission is one a TEACHER holds
*and* that exposes existing student/class/attendance/assessment/grade data must
contain a guard token, or the test fails. So a new unscoped TEACHER-reachable page
breaks the build until it declares scoped or blocked behaviour. A pinned manifest
in the same file also asserts each fixed route keeps its specific guard.

## Known limitations / trade-offs

- **Lock-down over retrofit, then selective re-scoping.** The heavy executive dashboards aren't *individually* re-scoped wholesale (their org-wide KPI/trend/distribution/watchlist services have no scope param). Teachers instead get a purpose-built scoped view on the kept surfaces — `/class-groups`, `/students`, `/attendance/sessions`, `/assessments` (minimal scoped table), plus `/grades` and `/student-progress` (scoped KPIs + table). The remaining org-wide dashboards still redirect. Adding a scoped view to another blocked page is a future enhancement, not a security gap.
- **Lesson authoring, subjects, calendar, schedules** are currently blocked for teachers under the minimal-nav policy. If teachers need a scoped version of any of these, add it per the steps above.
- **"My students" = enrolled in any class group I teach.** A student in two teachers' class groups appears for both — the intended definition of "my students."
- **`canViewOrgWide` proxy** (used by the Teacher Portal's Quick Actions, see `docs/teacher-portal.md`) and this module's `isTeacherScopedRoles` are two sides of the same role test; both treat ORG_ADMIN/SUPER_ADMIN as unrestricted.
