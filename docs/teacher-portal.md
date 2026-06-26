# Teacher Portal

## Purpose

`/teacher` is the logged-in teacher's daily operational workspace — the first thing a TEACHER sees after login. It answers:

- O que tenho hoje?
- Que turmas tenho?
- Que presenças preciso lançar?
- Que avaliações preciso corrigir?
- Que alunos estão em risco?
- Que notificações recebi?
- Que prazos se aproximam?

## Teacher Portal vs. Teacher 360

These are deliberately separate modules with separate concerns:

| | Teacher Portal (`/teacher`) | Teacher 360 (`/teachers/[teacherId]`) |
|---|---|---|
| Question it answers | "What do I need to do right now?" | "Who is this teacher, historically and structurally?" |
| Scope | Always the current logged-in teacher — no `teacherId` in the URL | Any teacher an admin/secretary looks up, or the teacher's own profile |
| Content | Today's schedule, pending work queues, risk list, notifications, deadlines | Health score, alerts, schedule, class groups, subjects, assessments, attendance history, performance trends, documents, timeline |
| Cadence | Checked every day, action-oriented | Checked occasionally, profile/record-oriented |

The Portal reuses Teacher 360's data layer rather than duplicating it — see "Data sources" below.

## Route

`src/app/(org)/teacher/page.tsx` — matches the existing flat `(org)` routing convention (`/dashboard`, `/teachers`, etc.), not an org-id-prefixed path.

The route accepts no parameters. The teacher is always resolved server-side from the authenticated session:

```
context.userId → Teacher.userId → Teacher
```

There is no way to view another teacher's portal — `teacherId` never appears in the URL, a query string, or any client-editable input.

## Permissions

One new permission: `TEACHER_PORTAL_VIEW` (`teacherPortal.view`).

| Role | Granted? |
|---|---|
| TEACHER | Yes |
| ORG_ADMIN | Yes (wildcard — for preview/support) |
| SUPER_ADMIN | Yes (wildcard) |
| SECRETARY | No |
| STUDENT | No |

The page calls `requirePermissionOrRedirect(PERMISSIONS.TEACHER_PORTAL_VIEW)`, which redirects to `/forbidden` for any role without the permission — mirroring every other page-level gate in the app.

## Blocked state

`resolveTeacherPortalBlockedReason()` (`teacher-portal.service.ts`) is the single pure gate for both blocked cases — a page-level `if (!teacher)` check handles `NOT_LINKED` first (so `teacher` narrows to non-null for the rest of the page), then the resolver is called again to check `INACTIVE`:

- **`NOT_LINKED`** — no `Teacher` record linked via `Teacher.userId` (most commonly: an ORG_ADMIN previewing the route, or a TEACHER-role user an admin hasn't linked yet):
  > "Esta conta ainda não está vinculada a um perfil de professor."
- **`INACTIVE`** — linked, but `Teacher.status !== "ACTIVE"` (SUSPENDED or INACTIVE):
  > "Este perfil de professor não está activo."

Both render the same `EmptyState` card instead of a 403 or 500. Linking is admin-driven (the existing `Teacher.userId` picker on the teacher edit form, from the Teacher 360 work) — there is no self-service claim flow, and no self-service reactivation either.

## Data sources — heavy reuse, one new module

`src/modules/teacher-portal/` holds only the logic that didn't already exist elsewhere:

| Concern | Source |
|---|---|
| Active class group count, subject count | `findTeacherCoreCounts` (Teacher 360 repository) |
| Distinct active student count, active class group IDs | `findTeacherWorkloadMetrics` (Teacher 360 repository) |
| Pending grading / overdue assessment counts | `findTeacherAssessmentMetrics` (Teacher 360 repository) |
| Weekly recurring schedule (for "next class" labels) | `findTeacherScheduleRows` (Teacher 360 repository) |
| My Classes list | `getClassGroupsByOrganization` (class-groups service), filtered by `teacherId` + `status: "ACTIVE"` |
| Unread count / latest notifications | `getUnreadCount` / `getLatestForUser` (notifications service) |
| Notification cards, mark-read/archive | `NotificationCard` + existing server actions (notifications module) — no new notification UI |
| Academic events for deadlines | `findUpcomingEventsByOrganization` (academic-calendar repository) |
| Today's schedule, pending attendance/grading/publish rows, class-group attendance rates, student risk list, assessment/class-group deadlines | New — `teacher-portal.repository.ts` |

The orchestrator (`teacher-portal.service.ts`) fetches everything in two parallel phases: phase 1 covers all teacher-scoped counts/rows that don't depend on each other; phase 2 runs the risk-list query once phase 1 has resolved the teacher's active class group IDs (mirrors the two-phase fetch already used by `getTeacher360Core`).

### Quick Actions / "Ver todas" — no org-wide links for a plain TEACHER

`/class-groups`, `/attendance/sessions`, and `/assessments` are org-wide admin pages with no `teacherId` scoping — a TEACHER navigating there directly would see every other teacher's data, since TEACHER already holds the view permission those pages gate on (`CLASS_GROUPS_READ`, `ATTENDANCE_SESSIONS_VIEW`, `ASSESSMENTS_VIEW`). `buildTeacherQuickActions(teacherId, canViewOrgWide)` (`teacher-quick-actions.tsx`) and `TeacherMyClasses`'s "Ver todas" button both branch on `canViewOrgWide`:

- **`canViewOrgWide = false`** (plain TEACHER) — "Lançar Presença"/"Corrigir Avaliações"/"Ver Turmas" become in-page anchors (`#today-schedule`, `#pending-work`, `#my-classes`) to the equivalent already-teacher-scoped section on this same page; My Classes' "Ver todas" button is hidden entirely (there is no safe "all of my classes beyond the top 8" page to send it to).
- **`canViewOrgWide = true`** (ORG_ADMIN/SUPER_ADMIN previewing) — the real links (`/class-groups`, `/attendance/sessions`, `/assessments`) are restored, since these roles are allowed to see that data anyway.

`canViewOrgWide` is computed once in `page.tsx` as `context.ability.can(PERMISSIONS.TEACHERS_VIEW_360)` — the unscoped "view any teacher's 360" permission, which only ORG_ADMIN/SUPER_ADMIN hold (TEACHER only ever holds `TEACHERS_VIEW_OWN_360`). "Ver Horário" (`/schedules`) and "Ver Notificações" (`/notifications`) are unaffected — neither is org-wide-unsafe for a TEACHER. Per-row deep links ("Abrir" on a My Classes row, "Marcar" on a Today Schedule/Pending Work row, "Abrir Teacher 360") stay as direct single-record links unconditionally, since the underlying record (the teacher's own class group, session, assessment, or profile) is already teacher-scoped by the query that produced it — only the *generic, unfiltered list* pages are unsafe.

## KPIs (8 cards)

| Card | Source |
|---|---|
| Aulas Hoje | `countActiveSessionsToday(todaySchedule)` — today's `AttendanceSession` rows **excluding CANCELLED** |
| Turmas Ativas | `findTeacherCoreCounts` |
| Alunos | `findTeacherWorkloadMetrics` |
| Presenças Pendentes | New count query: `AttendanceSession` with status OPEN/COMPLETED and zero attendance records |
| Avaliações por Corrigir | `countTeacherPendingGradingResults` — see "Avaliações por Corrigir" below |
| Avaliações em Atraso | `findTeacherAssessmentMetrics.overdueOpenCount` |
| Notificações Não Lidas | `getUnreadCount` |
| Alunos em Risco | Distinct student count across the risk list (see below) |

A CANCELLED session still renders in the Today Schedule list (labelled), it just isn't counted as a class happening today — the badge on the Today Overview card and the KPI card always agree, since both are sourced from the same `kpis.classesToday` value (`buildTeacherTodayOverview` takes the already-built `kpis` object rather than re-deriving the count from `todaySchedule.length` itself).

### "Avaliações por Corrigir" — KPI and Pending Work tab share one definition

The KPI counts `AssessmentResult` rows with status PENDING/SUBMITTED **scoped to `assessment.status = "OPEN"`** (`countTeacherPendingGradingResults`) — the exact same filter the Pending Work "Avaliações" tab's rows (`findTeacherAssessmentsToGradeRows`) are built from. A DRAFT/SCHEDULED/GRADED/CANCELLED/ARCHIVED assessment can never inflate this number, even if it has a stray PENDING/SUBMITTED result attached. Previously the KPI reused Teacher 360's broader `pendingGradingResultsCount` (any assessment status), which could disagree with what the tab actually showed — fixed by giving the Portal its own count with the narrower, list-matching definition.

Note the KPI is still the **total** result count across every matching OPEN assessment, while the tab's *rows* are capped at `ROW_LIMIT` (10) assessments for display. A teacher with more than 10 OPEN assessments needing grading will see a KPI number that doesn't visually sum from the 10 visible rows alone — the underlying definition is consistent (same WHERE clause), but the row list itself is still a top-N display, not the full set.

### "Próxima aula" (next session)

`resolveNextSession(todaySchedule, now)` returns the first session that is **not yet finished**: excludes CANCELLED and COMPLETED outright, and otherwise requires `endTime >= now`. A session currently in progress (`startTime <= now <= endTime`) is included and shown as "next" — there's no separate "current session" concept in the UI today. Once every session today has either ended or been cancelled, it returns `null` and the Today Overview card shows "Sem aulas agendadas para hoje." for the rest of the day, not a stale morning class.

## Student risk list

Scoped strictly to students enrolled in the teacher's **active** class groups (`enrollment.classGroupId IN activeClassGroupIds`) — never the whole organization. Criteria:

- **CRITICAL** — `StudentLevelProgress.status = "BLOCKED"`
- **HIGH** — `RECOVERY_REQUIRED` (level or course progress), `StudentSubjectProgress.status = "FAILED"`, or attendance below 75% (`LOW_ATTENDANCE`)
- **MEDIUM** — attendance between 75–85% (`ATTENDANCE_TREND`, a declining-trend warning short of the hard threshold), or `AssessmentResult.status = "MISSING"` on one of the teacher's own assessments (scoped via `assessment.teacherId`, not the class-group list, since a missing result is already teacher-specific)

No financial data (debt, invoices, wallets) is ever queried or exposed here, per spec — the risk repository function only touches academic-progress and assessment models.

**Risk count approach (`distinctStudentCount`, the "Alunos em Risco" KPI):** computed in JS from the already-fetched rows (`new Set(rows.map(r => r.studentId)).size`), not a SQL `COUNT(DISTINCT studentId)` — a deliberate, documented tradeoff, not an oversight. A true SQL count would need a UNION across four different models (`StudentLevelProgress` / `StudentCourseProgress` / `StudentSubjectProgress` / `AssessmentResult`) joined through two different scoping paths (`enrollment.classGroupId` for three of them, `assessment.teacherId` for the fourth) — meaningfully riskier to get right than this module's other raw queries. The approach is safe because the result set is bounded twice over: scoped to the teacher's *active* class groups only (never org-wide), and each of the six source queries in `findTeacherRiskRows` carries its own `RISK_SOURCE_QUERY_LIMIT` (200) safety cap, independent of the 20-row display slice. Revisit with a real SQL UNION/COUNT DISTINCT if a teacher's active roster ever realistically approaches that cap.

## Security constraints

- `organizationId` and the resolved `teacherId` are always derived server-side (`requirePermissionOrRedirect` → `getTeacherByUserId`) and threaded through every query — never accepted from client input.
- The risk list, schedule, pending-work, and class-group queries are all scoped by `teacherId` (or the teacher's own active class group IDs) in their `WHERE` clause — there is no code path that can return another teacher's data.
- No finance models (`Invoice`, `Payment`, `Wallet`, `Installment`) are referenced anywhere in `teacher-portal.repository.ts` or `teacher-portal.service.ts`.

## Performance

- Every list query (pending attendance, assessments to grade, results to publish, deadlines) takes a top-N limit (default 10); each of the six risk source queries carries its own `take: 200` safety cap, and the final risk list is sliced to 20 rows for display — every query in this module has a DB-level bound, none rely solely on the `activeClassGroupIds`/`teacherId` filter to stay small.
- The class-group attendance-rate lookup is one SQL-aggregated raw query (`AVG(...) GROUP BY classGroupId`) instead of one query per class group.
- The risk list query short-circuits to `[]` with zero DB calls when the teacher has no active class groups.

## Upcoming deadlines

`findTeacherUpcomingDeadlines` combines three sources within a 14-day window: assessments (`teacherId`-scoped, status SCHEDULED/OPEN), class-group end dates (`teacherId`-scoped, status ACTIVE), and academic events (org-wide, via `findUpcomingEventsByOrganization`). The academic-events source only enforces `endDate >= now` upstream, so an already-in-progress multi-day event (started yesterday, ends next week) would otherwise show up sorted to the front of the list with a past date — the Portal additionally filters `startDate >= now` before merging, so only events that haven't started yet count as "upcoming."

Filtering downstream of an upstream `take` has its own trap, which this module works around: `findUpcomingEventsByOrganization` sorts by `startDate ASC`, so in-progress events (earlier `startDate`) sort *ahead of* genuinely future ones within whatever limit is requested. Requesting only `DEADLINES_ROWS_PER_TYPE` (10) candidates and filtering afterward could silently drop real future events if 10+ in-progress events exist — they'd fill the entire `take` window before the filter ever sees a future one. The Portal requests a 3x-larger candidate batch (`ACADEMIC_EVENTS_CANDIDATE_LIMIT`, 30) specifically to make this failure mode very unlikely in practice; the final merged-and-sorted deadlines list still isn't capped beyond what the UI displays (`TeacherUpcomingDeadlines` slices to 12).

Assessment and class-group-end deadlines link to single-record pages (`/assessments/[id]`, `/class-groups/[id]`) for records already scoped to this teacher — safe per the Quick Actions rule above. Academic events link to `/academic-calendar` (org-wide, but read-only/non-sensitive calendar data, not gated the same way as class-groups/attendance/assessments).

## Known limitations

- **"Aulas Hoje" / Today Schedule reads `AttendanceSession` instances, not the recurring weekly schedule.** If a session for today hasn't been created yet (some orgs create sessions ahead of time, others on demand), it won't appear in Today's Schedule even though the recurring `ClassGroupSchedule` says there should be a class. "My Classes"' next-class label uses the recurring schedule instead, specifically to avoid this gap for that one field.
- **Attendance Pending only flags sessions with *zero* recorded attendance**, not partially-marked sessions. A session where the teacher marked 5 of 30 students present is not flagged. Documented simplification — re-deriving a real "missing count" per session would require an enrollment count per session rather than the denormalized `ClassGroup.currentCount` proxy currently used for the missing-count display.
- **Attendance-based risk thresholds (75% / 85%) are fixed constants**, not derived from each subject's `LevelSubject.minimumAttendancePercentage`. Mirrors the same simplification already made by the Executive Dashboard's academic watchlist.
- **ORG_ADMIN "preview" access is real but unlinked by default** — an ORG_ADMIN granted `TEACHER_PORTAL_VIEW` who has no `Teacher.userId` link will see the blocked state, not a preview of someone else's portal. There is intentionally no "view as" / impersonation feature here. When an ORG_ADMIN *is* linked (or previewing via `canViewOrgWide`), the Quick Actions/Ver-todas links resolve to the real org-wide pages — see "Quick Actions" above.
- **"Alunos em Risco" is a bounded, in-memory distinct count, not a SQL `COUNT(DISTINCT)`** — see "Risk count approach" above. Each underlying source query is capped at 200 rows.
- **Academic events in deadlines aren't filtered for relevance to the teacher** (branch, event type) — shown org-wide (date-windowed only), matching the Executive Dashboard's own deadlines logic.
- **No "attendance entry deadline" deadline type** — the original spec mentions this as a possible deadline source; there's no such concept anywhere else in the codebase to source it from, so it was left out rather than invented.
- **A teacher's own "Ver todas" link to the full class-groups list is hidden entirely**, not redirected to a safe alternative — there is currently no teacher-scoped "all of my classes beyond the top 8" page. The My Classes card already shows the teacher's 8 most relevant active classes; a teacher with more than 8 active classes has no in-app way to see the rest today.
- **`canViewOrgWide` (`context.ability.can(PERMISSIONS.TEACHERS_VIEW_360)`) is a proxy, not a direct check**, for "is it safe to show this user the real `/class-groups`, `/attendance/sessions`, `/assessments` links." It happens to be exactly right for every role that can reach `/teacher` today (TEACHER never holds it; ORG_ADMIN/SUPER_ADMIN always hold it via their wildcard, alongside the three underlying view permissions). If a future custom role is ever granted `TEACHER_PORTAL_VIEW` together with `TEACHERS_VIEW_360` but *without* one of those three view permissions, the Quick Action link would be shown but the destination page would itself redirect to `/forbidden` (a dead-end, not a leak — the destination page's own gate is still the real enforcement). Revisit this proxy if `TEACHER_PORTAL_VIEW` is ever granted to a role more granular than ORG_ADMIN/SUPER_ADMIN.
- **Risk source queries cap at 200 rows with no `orderBy`** — if a single risk source (e.g. low-attendance) ever exceeds 200 matching rows for one teacher, which row of the 200 gets returned is whatever order the database happens to produce, not "most severe" or "most recent." Acceptable today because a teacher's active-student population is expected to stay well under 200; would need an explicit `orderBy` (and likely a real reason to prioritize one row over another) if that assumption ever breaks.

## Future improvements

- Mark-attendance and grade-assessment quick actions on the Today Schedule / Pending Work rows currently link to the existing full pages (`/attendance/sessions/[id]/mark`, `/assessments/[id]/grade`) rather than offering inline marking/grading on the portal itself.
- Today Schedule could fall back to the recurring weekly schedule when no `AttendanceSession` exists yet for today, with a "Criar sessão" action, closing the gap noted above.
- Per-subject attendance thresholds for the risk list (using `LevelSubject.minimumAttendancePercentage` instead of the fixed 75/85% constants).
- A teacher-scoped, paginated "all my classes" page so My Classes' "Ver todas" has somewhere safe to go instead of being hidden.
- A real SQL UNION/COUNT DISTINCT for the risk count if a teacher's active roster ever approaches the per-source 200-row cap.
