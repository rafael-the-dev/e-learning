# Teacher 360 Profile

## Purpose

`/teachers/[teacherId]` is the single operational view of a teacher, consolidating profile, schedule, class groups, subjects, assessments, attendance execution, academic performance, documents, and history into one page. It answers:

- Who is this teacher?
- What subjects do they teach? What class groups are they assigned to?
- What is their workload?
- What assessments are pending grading/publication?
- How are their students performing?
- Are there risks or delays?
- What is the full history of this teacher's record?

It is a composition layer — almost every figure on the page is computed by an existing module service (class groups, assessments, attendance, schedules, prerequisites/progress). The only genuinely new module is Documents, plus a thin `teacher-360` aggregation layer for figures no other module already exposes (workload, weekly hours, distinct active students, pass rate scoped to a single teacher).

---

## Layout

| Section | Component | Always loaded? |
|---|---|---|
| Header (name, code, status, contact, quick actions) | `Teacher360Header` | yes |
| Health score | `TeacherHealthCard` | yes |
| Alerts | `TeacherAlertsPanel` | yes |
| KPI summary cards (×8) | `TeacherSummaryCards` | yes |
| Tabs nav | `Teacher360TabsNav` | yes |
| Active tab content | one of the 9 tab components below | only the active tab |

Header quick actions: Editar Professor, Atribuir Disciplina (jumps to the Subjects tab, where the actual assign UI lives), Atribuir Turma (links to `/class-groups/new`), Ver Horário (jumps to the Schedule tab), Contactar (mailto/tel dropdown — there is no notification-send pipeline that can target a teacher without a linked user account, so this mirrors Student 360's "Contactar" action rather than inventing one), Imprimir (browser print). Suspend/Archive reuse the existing `TeacherDetailActions` component unchanged.

---

## Tabs

| Key | Component | Gating permission | Data source |
|---|---|---|---|
| `overview` | `TeacherOverviewTab` | always visible | core data (below) |
| `schedule` | `TeacherScheduleTab` | `TEACHERS_VIEW_SCHEDULE` | `findTeacherScheduleRows` |
| `classGroups` | `TeacherClassGroupsTab` | `CLASS_GROUPS_READ` (existing) | `class-group.repository.ts` + new `teacherId` filter, paginated (table rows only — KPIs below) |
| `subjects` | `TeacherSubjectsTab` | `SUBJECTS_VIEW` (existing) | `core.teacher.teacherSubjects` + `findTeacherSubjectsTabRows` |
| `assessments` | `TeacherAssessmentsTab` | `ASSESSMENTS_VIEW` (existing) | `assessment.repository.ts` + new `teacherId` filter, paginated |
| `attendance` | `TeacherAttendanceTab` | `ATTENDANCE_SESSIONS_VIEW` (existing) | `findTeacherAttendanceKPIs/MonthlyTrend/SessionRows` |
| `performance` | `TeacherPerformanceTab` | `TEACHERS_VIEW_PERFORMANCE` | `findTeacherSubjectPassRates/GradeTrend`, `findOrganizationAveragePassRate` |
| `timeline` | `TeacherTimelineTab` | always visible | `findTeacherTimelineFeed` |
| `documents` | `TeacherDocumentsTab` | `TEACHER_DOCUMENTS_VIEW` | new `teacher-documents` module |

A tab the caller lacks permission for is not rendered as a trigger at all (same pattern as `/students/[studentId]`). If `?tab=` requests a tab the user can't see, the page falls back to `overview` (`resolveActiveTeacher360Tab`). Four tabs (`classGroups`, `subjects`, `assessments`, `attendance`) are deliberately gated by the permission that *already* governs that module's data — `CLASS_GROUPS_READ`, `SUBJECTS_VIEW`, `ASSESSMENTS_VIEW`, `ATTENDANCE_SESSIONS_VIEW` — instead of inventing one new permission per tab, mirroring how Student 360 gates Enrollments/Finance/Attendance/Grades by `ENROLLMENTS_VIEW`/`INVOICES_VIEW`/etc.

**Class Groups tab KPIs are never derived from the paginated table rows.** "Turmas Ativas," "Total de Alunos," and "Ocupação Média" come from `Teacher360Core` (`core.counts.activeClassGroupCount`, `core.workload.distinctActiveStudentCount`, `core.workload.avgOccupancyPercent` — the last computed as `SUM(currentCount) / SUM(capacity)` across every ACTIVE class group, not an average of per-group ratios) and are passed into `TeacherClassGroupsTab` as props. Only "Total de Turmas" (`classGroups.total`, from the paginated result's count) and the table body itself change between pages.

---

## Access control: own-profile vs. any-profile

Unlike Student 360 (which never restricts a role to "their own" record — see that module's Known Limitations), Teacher 360 introduces real self-scoping because the spec explicitly requires it:

- `TEACHERS_VIEW_360` — can open **any** teacher's 360 page. Granted to SUPER_ADMIN/ORG_ADMIN (wildcard) and SECRETARY.
- `TEACHERS_VIEW_OWN_360` — can open **only** the page for the `Teacher` record linked to the caller (`Teacher.userId === context.userId`). Granted to TEACHER.
- `canViewTeacher360(can, isOwner)` (`teacher-360-access.service.ts`) — pure function: `can(TEACHERS_VIEW_360) || (isOwner && can(TEACHERS_VIEW_OWN_360))`. The page resolves `isOwner` via a lightweight `getTeacherById()` lookup **before** calling `getTeacher360Core()`, and redirects to `/forbidden` if `canViewTeacher360` returns false — the full 7-query core aggregate is never fetched for a request that's going to be denied. Mirrors Student 360's `requirePermissionOrRedirect()`-before-`getStudent360Core()` ordering; the only difference is Teacher 360 needs one extra cheap lookup first to resolve ownership.

This required a schema change: `Teacher.userId String? @unique` (nullable — most teachers have no login) linking to `User`. SQL Server treats all `NULL`s as duplicates under a plain `UNIQUE` constraint, so the DB enforces this with a **filtered unique index** (`WHERE [userId] IS NOT NULL`) instead — see migration `20260624160001_add_teacher_360_step2`. Linking is manual: an ORG_ADMIN/SECRETARY picks a TEACHER-role user from a dropdown on the teacher edit form (`findUsersByOrganization(organizationId, { role: "TEACHER" })`, minus users already linked elsewhere). There is no automatic email-matching or self-service linking flow.

Tab-level permissions (`TEACHERS_VIEW_SCHEDULE`, `TEACHERS_VIEW_PERFORMANCE`, `TEACHER_DOCUMENTS_VIEW`) are granted to the TEACHER role directly — they only matter once the route-level gate above has already confirmed *which* teacher the caller may view, so granting them doesn't widen access to other teachers' data.

---

## Health Score

`calculateTeacherHealthScore()` in `teacher-health.service.ts` is a pure function (no I/O), weighted 0–100 per the spec's four named categories:

| Category | Weight | Formula |
|---|---|---|
| Execução (assiduidade/aulas) | 30% | 100; **20** if the teacher has ≥1 ACTIVE class group and 0 `AttendanceSession{COMPLETED}` in the last 30 days; else **60** if <80% of those completed sessions have any `AttendanceRecord`; else 100 |
| Entrega académica | 30% | `100 − min(40, 15×overdueOpenCount) − min(30, 10×pendingGradingOpenCount) − min(20, 10×readyNotPublishedCount)`, clamped |
| Carga de trabalho | 20% | 100 if ≤4 ACTIVE class groups; 70 if 5–6; 40 if ≥7 (same thresholds already codified in `teacher-watchlist.service.ts`, reused for consistency) |
| Qualidade académica | 20% | `0.6×passRate + 0.4×avgStudentAttendance` over `StudentSubjectProgress` rows whose `levelSubjectId` is among this teacher's taught level-subjects (derived from distinct `Assessment.levelSubjectId` where `teacherId` matches); defaults to 100 when there's no graded data yet, so a brand-new teacher isn't punished |

Labels: 90–100 Excelente, 75–89 Saudável, 50–74 Atenção, 0–49 Crítico (same thresholds as Student 360). `topReasons` = the 3 deductions with the largest weighted impact. `recommendedAction` is derived from whichever category scored lowest.

**This is a v1 formula**, like Student 360's — the spec gave weight buckets and deduction *reasons* but not exact coefficients. Tune them here (and in `teacher-health.service.test.ts`) if the business wants different sensitivity.

---

## Alerts

`computeTeacherAlerts()` in `teacher-alerts.service.ts` covers all four severity tiers the spec asked for (Student 360 only needed three):

| Severity | Rule |
|---|---|
| CRITICAL | OPEN assessment overdue >14 days · 0 completed sessions in the last 30 days while ACTIVE class groups exist · ≥9 ACTIVE class groups |
| HIGH | >20 results pending grading across the teacher's assessments · OPEN assessment overdue ≤14 days · 7–8 ACTIVE class groups |
| MEDIUM | 0 subjects assigned (ACTIVE teacher) · 0 ACTIVE class groups while subjects exist · results `READY` but not `PUBLISHED` |
| LOW | Assessment `SCHEDULED`/`OPEN` with `assessmentDate` within the next 7 days |

Each alert is `{ id, severity, title, description, actionUrl }` — `actionUrl` is a `?tab=` deep link rendered via the shared `DashboardInsightRow` component (reused from the Executive Dashboard, same as Student 360's alerts panel).

---

## Timeline — synthesized, not event-sourced

Student Timeline is event-sourced (a `StudentTimelineEvent` table fed by a `StudentTimelineEventHandler` subscribed to the domain event bus). Teacher Timeline deliberately is **not** — it's a read-time merge in `findTeacherTimelineFeed()` (`teacher-360.repository.ts`) over data that already has timestamps:

- `Teacher.createdAt` → "Professor criado" (one synthetic entry)
- `TeacherSubject.assignedAt` → "Disciplina atribuída"
- `ClassGroup.createdAt` (where `teacherId` matches) → "Turma atribuída" (approximation — there's no dedicated assignment-date field)
- `Assessment.createdAt` → "Avaliação criada"
- `AssessmentPublication.publishedAt` (`publicationStatus = PUBLISHED`) → "Avaliação publicada"
- `AttendanceSession.sessionDate` (`status = COMPLETED`) → "Presenças registadas"
- `TeacherDocument.createdAt` → "Documento carregado"

This avoided adding new `DomainEventType` entries and event-emit calls to ~6 commands in unrelated modules (assign-subject, class-group create/update, assessment create/publish, attendance complete-session, document upload) just for this feature. The Overview tab's "Atividade Recente" reuses the same function (first page, 10 items) rather than maintaining a second "recent activity" implementation.

**Known bound:** each source query is capped at 100 rows before the in-memory merge+sort+paginate. For a teacher with genuinely thousands of historical events this could under-page deep into the feed; not a concern at realistic per-teacher cardinality.

---

## Documents (new module)

No file-storage backend exists anywhere in this app — `src/modules/teacher-documents/` follows the same metadata/URL-only convention as `StudentDocument`/`LessonAttachment`. Field names follow the spec's literal list (`type`, `name`, `url`, `mimeType`, `size`, `uploadedById`) rather than `StudentDocument`'s naming — intentional, the spec was explicit here. No verification workflow (no `status`/`verifiedBy` fields) — just `CreateTeacherDocumentCommand` and `DeleteTeacherDocumentCommand` (soft delete).

---

## Permissions

| Permission | Constant | Used for |
|---|---|---|
| `teachers.view360` | `TEACHERS_VIEW_360` | Open any teacher's 360 page |
| `teachers.viewOwn360` | `TEACHERS_VIEW_OWN_360` | Open only the caller's own linked 360 page |
| `teachers.viewSchedule` | `TEACHERS_VIEW_SCHEDULE` | Schedule tab |
| `teachers.viewPerformance` | `TEACHERS_VIEW_PERFORMANCE` | Performance tab |
| `teacherDocuments.view` | `TEACHER_DOCUMENTS_VIEW` | Documents tab visibility + read |
| `teacherDocuments.upload` | `TEACHER_DOCUMENTS_UPLOAD` | Upload quick action + drawer |
| `teacherDocuments.delete` | `TEACHER_DOCUMENTS_DELETE` | Delete a document |

Default role assignments: ORG_ADMIN/SUPER_ADMIN get everything via the existing wildcard. SECRETARY gets `TEACHERS_VIEW_360`, `TEACHERS_VIEW_SCHEDULE`, `TEACHERS_VIEW_PERFORMANCE`, `TEACHER_DOCUMENTS_VIEW/UPLOAD` (no delete — mirrors how SECRETARY gets `STUDENT_DOCUMENTS_VIEW/UPLOAD` but not delete). TEACHER gets `TEACHERS_VIEW_OWN_360`, `TEACHERS_VIEW_SCHEDULE`, `TEACHERS_VIEW_PERFORMANCE`, `TEACHER_DOCUMENTS_VIEW` (their own profile only). STUDENT gets nothing, per spec. `classGroups`/`subjects`/`assessments`/`attendance` tabs reuse permissions ORG_ADMIN/SECRETARY/TEACHER already held before this feature.

The pure RBAC gate lives in `teacher-360-access.service.ts` (`getTeacher360TabAccess`, `resolveActiveTeacher360Tab`, `canViewTeacher360`) — same shape as `student-360-access.service.ts`, unit-tested without a real `Ability`.

---

## Tenant Isolation

Every query in `teacher-360.repository.ts` and `teacher-document.repository.ts` filters by `organizationId` explicitly — including queries whose id lists (`classGroupId`/`subjectId`/`sessionId` `in` filters) were already derived from an org-scoped lookup earlier in the same function. That second filter is deliberate defense-in-depth, not redundancy: every model that has an `organizationId` column gets it in the `where` clause, even when the upstream ids couldn't plausibly cross a tenant boundary today. The only exception is `TeacherSubject`, which has no `organizationId` column at all (it's scoped transitively through `teacherId`) — those queries filter by `teacherId` only, as appropriate for that model.

`organizationId` always comes from `requireOrganization()`'s server-side `AuthContext`, never the client or the route param. The page resolves and authorizes the teacher (via `getTeacherById`, org-scoped) before calling `getTeacher360Core(teacherId, context.organizationId)` — see "Access control" above. A teacher belonging to a different organization throws `NotFoundError` at the very first lookup, resolved into a 404 via `notFound()`.

---

## Performance

- Core data (`getTeacher360Core`) is one batch of parallel queries (`Promise.all`) — counts, assessment metrics, attendance execution, workload, document count, timeline preview, taught level-subjects — followed by one more query (quality raw) that depends on the level-subject list.
- Heavy, genuinely unbounded lists (class groups, assessments, attendance sessions, timeline) use real server-side `skip/take` pagination.
- Attendance/performance aggregates use `groupBy`/`aggregate`, never a raw per-record dump into JS for KPI computation — the per-page session/record detail tables are the only place individual rows are fetched, and those are already paginated.
- Tabs that aren't active are never queried — `ActiveTabPanel` in the page component calls exactly one tab-data fetcher per request.

---

## Module Structure

```
src/modules/teachers/teacher-360/
├── types/index.ts                          Health score, alerts, summary cards, tab keys, schedule/timeline rows
├── repositories/
│   └── teacher-360.repository.ts           Every teacher-scoped aggregate not already exposed by another module
├── services/
│   ├── teacher-360.service.ts              Core data orchestration + per-tab data fetchers
│   ├── teacher-health.service.ts           calculateTeacherHealthScore() — pure
│   ├── teacher-alerts.service.ts           computeTeacherAlerts() — pure
│   └── teacher-360-access.service.ts        Pure RBAC tab gate + canViewTeacher360 self-scope check
├── components/
│   ├── teacher-360-header.tsx
│   ├── teacher-quick-actions.tsx
│   ├── upload-teacher-document-drawer.tsx
│   ├── teacher-health-card.tsx
│   ├── teacher-alerts-panel.tsx
│   ├── teacher-summary-cards.tsx
│   ├── teacher-360-tabs-nav.tsx
│   └── tabs/
│       ├── teacher-overview-tab.tsx
│       ├── teacher-schedule-tab.tsx
│       ├── teacher-class-groups-tab.tsx
│       ├── teacher-subjects-tab.tsx
│       ├── teacher-subjects-manager.tsx     Client assign/remove controls (reuses existing AssignTeacherSubjectCommand)
│       ├── teacher-assessments-tab.tsx
│       ├── teacher-attendance-tab.tsx
│       ├── teacher-performance-tab.tsx
│       ├── teacher-timeline-tab.tsx
│       └── teacher-documents-tab.tsx
└── __tests__/

src/modules/teacher-documents/               New module (see "Documents" above)
```

Route: `src/app/(org)/teachers/[teacherId]/page.tsx` (existing route, rewritten in place — no new route, same approach as Student 360). `loading.tsx`/`error.tsx` added alongside it.

---

## Known Limitations

- **Schedule tab subject resolution is an approximation.** `ClassGroupSchedule` carries no direct subject FK — a class group's weekly slots aren't tied to a specific subject, only to a course+level. The Schedule tab resolves "which subject(s)" via `LevelSubject` (course+level ↔ subject), so if a teacher teaches multiple subjects within the same course/level, all are listed together for every slot of that class group — it cannot disambiguate by time slot. Documented, not fixed, because the underlying schema doesn't carry that information at all.
- **Schedule tab has no "Sala" (room) column**, for the same reason — room assignment exists per actual `AttendanceSession`, not on the recurring `ClassGroupSchedule` template.
- **Teacher-user linking is manual and admin-driven.** There is no invite flow, no email-matching, no self-service "claim my profile." An ORG_ADMIN/SECRETARY must explicitly pick the right user from a dropdown on the teacher edit form.
- **No notification-send pipeline can target a teacher without a linked user account** (the Notifications module requires a `recipientUserId`). "Contactar" is a plain mailto/tel dropdown, identical to Student 360's — not a tracked, in-app notification.
- **Performance tab's grade-distribution histogram was deferred.** Pass-rate-by-subject, grade-trend-by-month, and professor-vs-org comparison are implemented; a fourth visual (grade distribution buckets) from the spec was cut to keep this already-large feature shippable. Not load-bearing for the health score or alerts.
- **Performance tab does not show "Avaliações concluídas no prazo" (assessments completed on time).** Deliberately omitted in this pass rather than silently dropped — it would need a new aggregate (grading completed before/after the assessment's due date) that doesn't exist yet. Tracked here rather than implemented, to avoid adding a new visible indicator outside the scope of the current fix pass.
- **Timeline merge is bounded, not a true cursor.** Each of the 6 dynamic sources is capped at 100 rows before merge+sort+paginate (see "Timeline" above) — correct at realistic per-teacher volume, not exact at extreme depth.
- **Subjects tab's "Turmas Associadas"/"Alunos" counts share the same LevelSubject-based approximation** as the Schedule tab, for the same underlying reason (`TeacherSubject` has no direct course/level link).
- **Health-score coefficients are a v1 judgment call**, not a contractually specified formula — see "Health Score" above.
