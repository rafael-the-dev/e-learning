# Attendance Engine

Implementation companion to [`attendance-engine-domain.md`](./attendance-engine-domain.md)
(the approved domain model). This file tracks what is **built**, phase by phase.

The engine ships in the sequence fixed by §15 of the domain doc. Only **Phase 5**
(gated academic wiring) changes academic outcomes; every other phase is
behaviour-neutral.

---

## Phase 1 — Schema Foundation ✅ (built)

Structural foundation only. **No academic behaviour changed**, `INCOMPLETE`
stays inactive, and nothing yet writes `StudentSubjectProgress.attendancePercentage`.
Existing attendance flows (sessions, records, justifications, the on-read
calculator, risk events) are untouched.

### New models

| Model | Table | Purpose |
|-------|-------|---------|
| `AttendancePolicy` | `attendance_policies` | Interpretation-only config (never thresholds). |
| `StudentSubjectAttendanceSummary` | `student_subject_attendance_summaries` | Persisted read-model per enrolment+subject. **Unwritten until Phase 4.** |
| `StudentPeriodAttendanceSummary` | `student_period_attendance_summaries` | Persisted reporting read-model per enrolment+year+term. **Unwritten until Phase 6.** |

`AttendancePolicy` fields: `countExcusedAsPresent`, `countRemoteAsPresent`,
`countLateAsPartial`, `lateAfterMinutes`, `absenceAfterMinutes`,
`atRiskBufferPercentage` (replaces the hard-coded `AT_RISK_BUFFER = 5` once wired),
`allowJustification`, `requireJustificationApproval`, `justificationWindowDays`,
`autoCloseSessions`, `isDefault`, `status`, timestamps + `deletedAt`.

> **Threshold ownership (Decision #1):** `minimumAttendancePercentage` and
> `maxAbsences` remain on `LevelSubject`. `AttendancePolicy` stores **no**
> thresholds — interpretation only.

### `LevelSubject.attendancePolicyId` (optional override)

Added as a nullable FK. `null` → the organization's default policy applies. This
is the per-`LevelSubject` override from Decision #2. Indexed
(`level_subjects_organizationId_attendancePolicyId_idx`).

### `AttendanceRecord.enrollmentId` — Phase-2 backfill prep

**Stays NULLABLE in Phase 1** (Decision #3, two-phase). Existing rows may lack an
enrolment, so we do not force `NOT NULL` yet. Phase 1 only adds the index
`attendance_records_organizationId_enrollmentId_idx`.

**Phase 2 — now built.** The backfill resolves `enrollmentId` per record via a
3-tier priority (course + classGroup → course + currentLevel → course +
initialLevel), fills only unambiguous matches, and reports the rest. The
`NOT NULL` + FK step is prepared but not applied until the data is clean. See the
**Phase 2** section below for the algorithm, safety properties, and the
operational checklist. (This supersedes the earlier `sessionDate`-based sketch;
the shipped resolver keys on the session's course/class/level, not the date.)

Per-enrolment attendance calculation (the engine's core principle) is unsafe
until this column is `NOT NULL`; Phase 4 must not assume it is populated for
legacy rows.

### Constraints & indexes

- **One default active policy per org** — filtered unique
  `attendance_policies_org_default_key` on `(organizationId)`
  `WHERE isDefault = 1 AND deletedAt IS NULL`.
- **Subject summary uniqueness** — `@@unique([enrollmentId, levelSubjectId])`.
- **Period summary nullable-term uniqueness** — SQL Server rejects multiple NULLs
  under a plain UNIQUE, so uniqueness is split into two filtered indexes:
  - `student_period_attendance_summaries_term_key` on
    `(enrollmentId, academicYearId, academicTermId)` `WHERE academicTermId IS NOT NULL`
  - `student_period_attendance_summaries_noterm_key` on
    `(enrollmentId, academicYearId)` `WHERE academicTermId IS NULL`
- Read/scoping indexes on both summaries cover `organizationId`, `studentId`,
  `levelSubjectId` / `academicYearId` / `academicTermId` / `classGroupId`,
  `status`, and `calculatedAt`.

All FKs are `ON DELETE NO ACTION ON UPDATE NO ACTION` (SQL Server forbids
multiple cascade paths).

### Migration

`prisma/migrations/20260702120000_attendance_engine_phase1_schema_foundation/`.
Hand-written transactional SQL Server DDL. Table/column/index/FK names match
Prisma's own `migrate diff` output exactly; the three filtered unique indexes are
hand-authored (Prisma `@@unique` cannot carry a predicate), following the
established `guardian_students_active_link_key` pattern.

### Permissions

New (in `src/server/auth/permissions.ts`):
`attendancePolicies.view|create|update|archive`, `attendanceSummaries.view`,
`attendanceReports.view`.

| Role | Grant |
|------|-------|
| `SUPER_ADMIN` / `ORG_ADMIN` | all (inherited via `Object.values(PERMISSIONS)`) |
| `SECRETARY` | policies view + summaries view + reports view |
| `TEACHER` | summaries view (row-scoped to assigned classes/subjects by the teacher-scope layer) |
| `STUDENT` | summaries view (row-scoped to own by the student-scope layer) |
| `GUARDIAN` | none of these coarse perms — attendance visibility rides on `GuardianStudent.canViewAttendance` + server-side aggregation, per the guardian pattern |

Coarse permissions gate *whether* a role can see summaries at all; **row-level
scoping is enforced by the scope layer**, not by these permissions.

### What Phase 1 explicitly does NOT do

- Does not write either summary table (no service yet).
- Does not populate `StudentSubjectProgress.attendancePercentage` (still `null`).
- Does not activate the `INCOMPLETE` gate.
- Does not change the existing on-read calculator, risk service, or any command.
- Does not add commands, actions, or UI.

---

## Phase 2 — `enrollmentId` Backfill ✅ (built; NOT NULL still pending data)

Two-phase promotion of `AttendanceRecord.enrollmentId` (Decision #3). Phase 2
**resolves and fills** the legacy NULLs and ships everything needed to enforce
`NOT NULL` later; the constraint itself is deliberately **not** applied until the
data is proven clean. **Behaviour-neutral**: it only ever writes `enrollmentId`.
Nothing writes `StudentSubjectProgress.attendancePercentage`, touches the
summaries, or activates `INCOMPLETE`.

### Resolution algorithm (highest confidence first)

A record is anchored to a course/class/level through its `AttendanceSession`.
For each record with `enrollmentId IS NULL`, candidate enrolments are the
student's **non-cancelled, non-deleted** enrolments in the **same organization**.
Only same-`courseId` candidates are eligible. Then, in order:

1. **Tier 1** — candidate `classGroupId` == `session.classGroupId`.
2. **Tier 2** — candidate `currentLevelId` == `session.courseLevelId`.
3. **Tier 3** — candidate `initialLevelId` == `session.courseLevelId`.

Exactly one match in a tier → **resolved** (record updated). More than one match
in a tier → **ambiguous** (skipped, reported). No candidate matches any tier →
**unresolved** (skipped, reported). The resolver is **conservative**: it never
falls back to "the only enrolment for the course" — unmatched rows are surfaced
for an operator, never guessed. Logic lives in the **pure** resolver
[`attendance-enrollment-backfill.resolver.ts`](../src/modules/attendance/services/attendance-enrollment-backfill.resolver.ts)
so the report and the backfill share one implementation.

### What shipped

| Artifact | Path | Role |
|----------|------|------|
| Pure resolver | `services/attendance-enrollment-backfill.resolver.ts` | Deterministic tier logic (no I/O). |
| Repository | `repositories/attendance-enrollment-backfill.repository.ts` | Only Prisma layer; org-scoped counts, id-cursor batch fetch, candidate load, **guarded** update. |
| Scan + report | `services/attendance-enrollment-backfill-report.service.ts` | `scanAttendanceEnrollmentBackfill` (apply optional) + read-only `getAttendanceEnrollmentBackfillReport` (Step 3). |
| Command | `commands/backfill-attendance-record-enrollment-id.command.ts` | `BackfillAttendanceRecordEnrollmentIdCommand` — RBAC-guarded, `dryRun` (default **true**), `batchSize`, audited. |
| Runner | `prisma/backfill-attendance-enrollment-id.ts` | Operator CLI: `pnpm db:backfill-attendance-enrollment-id`. |
| Permission | `attendanceRecords.backfillEnrollment` | Admin-only (auto-granted to SUPER_ADMIN/ORG_ADMIN via `Object.values`). |
| Planned migration | `prisma/planned-migrations/attendance_engine_phase2b_enrollment_not_null.sql` | NOT NULL + FK; **not** a live migration yet. |

### Safety properties

- **Guarded update** — `updateRecordEnrollmentIdIfNull` uses `updateMany` with
  `WHERE enrollmentId IS NULL`, so a non-null value is **never** overwritten and
  re-runs are **idempotent** (a second apply updates 0 rows).
- **Dry run** — the command defaults to `dryRun: true`; the CLI reports only until
  `--apply` is passed.
- **Org isolation** — every query is scoped by `organizationId`; a candidate
  enrolment from another tenant can never resolve a record.
- **Termination** — batches page by an **id cursor**, so ambiguous/unresolved
  rows (which stay NULL) can't cause an infinite loop.
- **Audit** — a real run that actually changed rows logs
  `attendance_record.enrollment_backfilled` with the counts; dry runs and no-ops
  are silent (mirrors the engine's "emit only on real change" rule).

### Data-quality report (Step 3)

`getAttendanceEnrollmentBackfillReport(organizationId)` returns
`totalAttendanceRecords`, `filledEnrollmentRecords`, `nullableEnrollmentRecords`,
`resolvableRecords`, `ambiguousRecords`, `unresolvedRecords`, plus capped
`sampleAmbiguousRows` / `sampleUnresolvedRows`. Invariant:
`resolvable + ambiguous + unresolved == nullable`.

### Operational checklist — before enforcing NOT NULL

1. `pnpm db:backfill-attendance-enrollment-id` — dry-run report across all orgs.
2. Inspect ambiguous/unresolved samples; fix the underlying enrolment data
   (e.g. cancel a duplicate enrolment, set a missing `classGroupId`).
3. `pnpm db:backfill-attendance-enrollment-id -- --apply` — fill unambiguous rows.
4. Repeat 1–3 until **needing backfill = 0, ambiguous = 0, unresolved = 0** for
   **every** organization. Also confirm no **soft-deleted** row has a NULL
   `enrollmentId` (the constraint applies to every physical row — the backfill
   only touches non-deleted rows, so any soft-deleted NULLs must be resolved or
   hard-deleted separately).
5. Promote `prisma/planned-migrations/attendance_engine_phase2b_enrollment_not_null.sql`
   to a dated `prisma/migrations/` folder, drop the `?` on
   `AttendanceRecord.enrollmentId` + add the `Enrollment` relation in the schema,
   then `pnpm prisma migrate deploy` + `pnpm prisma generate`. The migration's
   own guard aborts if any NULL remains.

### Rollback

The backfill is additive (fills NULLs) — there is nothing to undo functionally,
but the values are auditable and were only written for unambiguous matches. The
NOT NULL migration, if applied, is reversible before dependent code relies on it
(drop FK → `ALTER COLUMN ... NULL` → revert the schema `?`); see the SQL header.

---

## Phase 3 — StudentSubjectAttendanceSummary Engine ✅ (built)

Collapses domain-plan steps **3 (EXCUSED semantics)** and **4 (summary
recalculation)** into one shippable phase: it calculates and **persists** the
per-enrolment+subject attendance read-model. **Behaviour-neutral** — it writes
ONLY `StudentSubjectAttendanceSummary`. It does **not** write
`StudentSubjectProgress.attendancePercentage`, run the grade/level/course
cascade, or activate `INCOMPLETE`. The legacy on-read calculator is left in place
and still coexists (existing UI keeps using it).

### Calculation engine (pure)

[`attendance-calculation.engine.ts`](../src/modules/attendance/services/attendance-calculation.engine.ts)
— `calculateAttendanceSummary({ sessions, records, policy, minimumAttendancePercentage })`,
no I/O, exhaustively unit-tested.

- **Only `COMPLETED` sessions count.** DRAFT / OPEN / CANCELLED / ARCHIVED are
  excluded by the loader; dangling records for non-counted sessions are ignored.
- `attendancePercentage = totalPresentMinutes / totalScheduledMinutes × 100`
  (2-dp), where `totalScheduledMinutes = Σ` counted-session durations.
- Present-equivalent weighting (the numerator):
  - `PRESENT` → full duration
  - `REMOTE` → full IF `policy.countRemoteAsPresent`, else 0
  - `LATE` → partial (`minutesAttended`, else `duration − lateMinutes`) IF
    `policy.countLateAsPartial`; otherwise counted full present
  - `ABSENT` → 0
  - `EXCUSED` / approved-justification effect → full IF
    `policy.countExcusedAsPresent`, else 0 (tracked in `totalExcusedMinutes`)
- **Status** (3-value set): `NOT_STARTED` when no counted sessions (percentage
  `null`); else `SUFFICIENT` when `pct ≥ minimum` (or no minimum set),
  `BELOW_REQUIRED` when `pct < minimum`. `AT_RISK` is reserved but not emitted
  this phase.

### EXCUSED / justification semantics (transitional — Decision #4)

`EXCUSED` is handled as an **effect**, not a primary truth. A record is treated as
excused when it is an explicit (deprecated) `EXCUSED` mark **or** an
`ABSENT`/`LATE` mark carrying an **approved** justification. The policy's
`countExcusedAsPresent` then decides whether those minutes count toward
attendance (default **false** → tracked separately, percentage unaffected). This
is the one intentional divergence from the legacy calculator, which ignored
justifications and always scored `EXCUSED` as 0.

### Policy resolution

[`attendance-policy.resolver.ts`](../src/modules/attendance/services/attendance-policy.resolver.ts):
1. `LevelSubject.attendancePolicyId` (per-subject override, if ACTIVE),
2. the org's default active `AttendancePolicy`,
3. the deterministic `DEFAULT_ATTENDANCE_POLICY` fallback (`countExcusedAsPresent
   false`, `countRemoteAsPresent true`, `countLateAsPartial true`,
   `atRiskBufferPercentage 5`, justification allowed + approval required).

Calculation **never fails** for lack of a policy.

### Single-writer service + transaction shape

[`student-subject-attendance-summary.service.ts`](../src/modules/attendance/services/student-subject-attendance-summary.service.ts)
is the **only** writer of the summary. It loads inputs, resolves the policy,
runs the pure engine, then in **one transaction**: reads the previous summary →
`upsert` → audits — and publishes domain events **only after commit** (mirrors
the Grade Engine). **Idempotent**: an identical recompute writes nothing at all
(no upsert, no audit, no event; `calculatedAt` stays put) — verified against the
live DB.

### Recalculation triggers (best-effort, behaviour-neutral)

Recalc is appended **after** each attendance mutation as a fire-and-forget call
(mirrors the existing `evaluateAttendanceRiskForSession` pattern) so a summary
failure can **never** roll back the underlying mark/justification:

| Mutation command | Trigger |
|------------------|---------|
| complete / cancel session | `triggerAttendanceSummaryRecalcForSession` (fan-out over enrolments marked in the session) |
| mark / bulk-mark / update record | per-record recalc (mark & bulk-mark also now fill `enrollmentId` on new rows) |
| approve / reject justification | per-record recalc |

> **Design note (transactionality vs behaviour-neutrality):** the brief's
> "mutation → summary in the same transaction" is intentionally **relaxed** to a
> post-commit best-effort call here, because folding recalc into the mutation's
> own transaction would let a summary error roll back the mark — a behaviour
> change this phase forbids. The **standalone/batch commands provide the
> transactional, idempotent path** for explicit recomputes and repair.

### Commands + permission

- `RecalculateStudentSubjectAttendanceSummaryCommand` — one `(enrollment, levelSubject)`.
- `RecalculateAttendanceSummariesCommand` — batch sweep over a `classGroupId` /
  `levelSubjectId` / `enrollmentId` scope (refuses an unbounded org-wide run).
- Both gated by the new `attendanceSummaries.recalculate` permission (admin-only
  via `Object.values`).

### Read-only reporting (§9)

`findSubjectAttendanceSummaryByEnrollment`, `findSubjectAttendanceSummariesByStudent`,
`findSubjectAttendanceSummariesByClassGroup`, `findStudentsBelowRequiredAttendance`
— all org-scoped, no UI added.

### Audit + domain events

- Audit `attendance_summary.recalculated` (prev/new percentage + status +
  `calculatedAt`) and `attendance_summary.batch_recalculated`. **No audit on an
  unchanged summary** (spam avoidance).
- Post-commit events: `attendance.summary_recalculated` on any percentage/status
  change; `attendance.student_below_required` / `attendance.student_recovered_attendance`
  **only** on an actual `SUFFICIENT ⇄ BELOW_REQUIRED` crossing. **No
  notifications wired yet.**

### Parity with the legacy calculator

Under the default policy the **percentage matches** the legacy on-read calculator
(PRESENT/REMOTE full, LATE partial, EXCUSED 0; same denominator + rounding) —
covered by a parity test. Documented intentional differences: empty scheduled
minutes → `null` + `NOT_STARTED` (legacy `0` + `OK`); approved justifications
honoured; 3-value status vocabulary.

---

## Phase 4 — StudentPeriodAttendanceSummary ✅ (built)

Domain-plan step **6**, shipped ahead of the gated academic wiring (step 5) — it
is independently shippable and behaviour-neutral. Persists **period/year**
attendance rollups per `(enrollment, academicYear, academicTerm?)` for
**reporting & dashboards** (student / guardian / executive). It is **NOT** the
academic source — `StudentSubjectAttendanceSummary` (Phase 3) remains that. It
does **not** write `attendancePercentage`, run the cascade, or activate
`INCOMPLETE`.

### Granularity

Two rows per enrolment per year: the **year rollup** (`academicTermId = null`,
aggregates all terms) and one row **per term** (`academicTermId` set). The
nullable-term uniqueness is enforced by the two Phase-1 filtered unique indexes
(`…_term_key` / `…_noterm_key`); since there is no Prisma compound `@@unique`, the
write path is a **manual `findFirst → update/create`** (verified on the live DB
that a year row and a term row coexist).

### Calculation ([attendance-period-calculation.engine.ts](../src/modules/attendance/services/attendance-period-calculation.engine.ts), pure)

- Only `COMPLETED` sessions count (the loader filters `status = COMPLETED`).
- Minutes weighting reuses the **shared** [attendance-weighting.ts](../src/modules/attendance/services/attendance-weighting.ts)
  helper (extracted this phase; Phase 3 now uses it too → single source of truth),
  applied **per record** with **that record's levelSubject policy** (a period
  spans many subjects, each of which may carry an override), then totalled.
- **Counts are a reporting overlay, not a partition:** PRESENT/ABSENT/LATE/REMOTE
  increment their raw count; a manual `EXCUSED` increments `excusedCount`; an
  `ABSENT`/`LATE` **with an approved justification** increments `excusedCount`
  **in addition** to its raw count (original status preserved, per the brief).
- `attendancePercentage = totalPresentMinutes / totalScheduledMinutes × 100`
  (null when no scheduled minutes; "not started" is represented by null).
- **Weighted baseline** for status: `Σ(subjectMin × subjectScheduledMinutes) ÷
  Σ(scheduledMinutes)` over subjects that declare a `minimumAttendancePercentage`.
  Fallbacks: no subject threshold → baseline `null` → status `GOOD`. Buffer for
  `AT_RISK` comes from the org-default policy's `atRiskBufferPercentage` (else the
  fallback 5). **Status**: `GOOD` (≥ baseline / no baseline / null pct),
  `AT_RISK` (baseline − buffer ≤ pct < baseline), `BELOW_REQUIRED` (below that).

### Single-writer service + triggers

[student-period-attendance-summary.service.ts](../src/modules/attendance/services/student-period-attendance-summary.service.ts)
is the only writer — same transaction shape as Phase 3 (read → upsert → audit in
one tx; events post-commit), idempotent (identical recompute writes nothing),
and supports **`dryRun`**. Recalc is triggered **fire-and-forget** (post-commit,
behaviour-neutral — never rolls back the mark) on the same 7 mutation commands as
Phase 3, alongside the subject trigger. A record/session trigger recomputes the
**year rollup and** (when the session has a term) the **term** row.

### Commands + permission

- `RecalculateStudentPeriodAttendanceSummaryCommand` — one `(enrollment, year, term?)`, `dryRun`.
- `RecalculatePeriodAttendanceSummariesCommand` — batch over `academicYearId`
  (required) + optional `academicTermId` / `classGroupId` / `courseId`, `dryRun`.
- Both reuse the `attendanceSummaries.recalculate` permission (admin-only via
  `Object.values`; secretary access is a later scoping decision).

### Read queries + DTOs (§10/§11)

[repository](../src/modules/attendance/repositories/student-period-attendance-summary.repository.ts):
`findPeriodAttendanceSummaryByEnrollment`, `…ByStudent`, `…ByClassGroup`,
`…ByCourse`, `findStudentsBelowRequiredPeriodAttendance`.
[report service](../src/modules/attendance/services/attendance-period-report.service.ts):
`findAttendanceOverviewByAcademicYear` / `…Term` → `AttendancePeriodOverviewDto`,
and `buildStudentAttendanceDashboard` → `StudentAttendanceDashboardDto` (both
read-only DTOs, never persisted). **No UI added.**

### Audit + domain events

- Audit `attendance_period_summary.recalculated` / `…batch_recalculated`; **none
  on an unchanged summary**.
- Post-commit events: `attendance.period_summary_recalculated` on any
  percentage/status change; `attendance.period_below_required` /
  `attendance.period_at_risk` / `attendance.period_recovered` **only** on an
  actual status change. **No notifications wired yet.**

---

## Phase 5 — Gated Academic Wiring ✅ (built) ⚠️ only outcome-changing phase

The first phase that **can** change academic outcomes — but **only when explicitly
enabled**. Off by default, so deploy is behaviour-neutral (verified on the live DB:
0 policies enable it, fallback is safe-off, 0 attendance-driven `INCOMPLETE` rows).

### The gate (opt-in, three conditions)

A subject can become `INCOMPLETE` from attendance **only** when ALL hold:
1. `AttendancePolicy.enforceAttendanceForProgress = true` (new flag, default **false**);
2. `LevelSubject.minimumAttendancePercentage` is defined (the **threshold stays on
   LevelSubject** — the policy only *enables* enforcement, never stores thresholds);
3. a persisted `StudentSubjectAttendanceSummary.attendancePercentage` exists.

Otherwise the cascade feeds `attendancePercentage: null` and the (already-existing)
`INCOMPLETE` branch in `GradeCalculationService` stays dormant — a subject passes on
grade alone. **No attendance value is ever fabricated.**

### The seam ([subject-progress-cascade.service.ts](../src/modules/grades/services/subject-progress-cascade.service.ts))

The cascade — the single canonical `subject → level → course` recalculation — now
resolves the effective policy (`loadEffectiveAttendancePolicy`) and, when the gate
is on, reads the persisted summary and feeds the real percentage into the grade
calc, persisting the **same** value on `StudentSubjectProgress.attendancePercentage`
(null when off — no accidental `INCOMPLETE`, no stale informational value). This
replaces the former hard-coded `null`. Because the *cascade* owns the decision,
grade-driven and attendance-driven recalculations always agree.

### INCOMPLETE is non-terminal (unresolved, never FAILED)

- Subject: `INCOMPLETE`, `completedAt = null` (grade preserved).
- Level ([recalculate-level-progress.service.ts](../src/modules/prerequisites/services/recalculate-level-progress.service.ts)):
  a required `INCOMPLETE` subject keeps the level **IN_PROGRESS** (explicit branch) —
  never `FAILED` solely because of it, never `PASSED`. A genuinely `FAILED` required
  subject still fails the level (INCOMPLETE never masks a real failure).
- Course: derives from level status → stays **IN_PROGRESS** (never `COMPLETED`,
  never `FAILED` solely due to `INCOMPLETE`). Recovers to `PASSED` when attendance recovers.

### Wiring service + triggers ([attendance-academic-wiring.service.ts](../src/modules/attendance/services/attendance-academic-wiring.service.ts))

`applyAttendanceAcademicImpact` runs the cascade **transactionally** (subject/level/
course atomic; events post-commit), emits precise transition audit + events, and
supports `dryRun` (runs the cascade in a rolled-back tx — previews without writing).
It runs when enforcement is on **or** to clear a stale impact after enforcement is
turned off. It is invoked **post-commit** from the Phase 3 summary recalc, gated by
`policy.enforceAttendanceForProgress` and only when the summary changed; a wiring
failure never corrupts the (already-committed) summary — the **repair command** is
the recovery path (retry/repair).

### Repair command

`RecalculateAttendanceAcademicImpactCommand` (admin-only) — inputs
`enrollmentId?/levelSubjectId?/academicYearId?/classGroupId?/dryRun?` (≥1 scope
required). Real run: recompute summary → apply impact (fires even when the summary
is unchanged, e.g. right after enabling the gate). `dryRun`: preview only.
Idempotent, tenant-scoped.

### Audit + domain events (only on real transitions)

- Audit: `student_subject_progress.marked_incomplete`,
  `…recovered_from_incomplete`, `…attendance_applied`, `…attendance_impact_batch`.
- Events: `attendance.subject_marked_incomplete`,
  `attendance.subject_recovered_from_incomplete`,
  `attendance.academic_impact_applied`, plus `attendance.academic_gate_enabled`
  (reserved for the future policy-toggle path). **No notifications wired.**

### Enabling (no policy UI yet)

There is no AttendancePolicy CRUD/UI, so enabling is a deliberate data change:
set `enforceAttendanceForProgress = true` on the target `AttendancePolicy` (org
default or a `LevelSubject` override), ensure the subjects have
`minimumAttendancePercentage`, then run the repair command to apply. See the
**rollout checklist** and **rollback** below.

### Rollout checklist (before enabling)

1. Phase 2 backfill report clean (every `enrollmentId` resolved).
2. `StudentSubjectAttendanceSummary` parity validated vs the legacy calculator.
3. `AttendancePolicy` exists and reviewed; thresholds on `LevelSubject` reviewed.
4. QA validates sample students; Security/RBAC verified.
5. Enable for **one** org / class / course first (policy override), monitor
   `INCOMPLETE` transitions, then roll out gradually.

### Rollback

Set `enforceAttendanceForProgress = false` and run the repair command for the
scope: the cascade recomputes with `attendancePercentage: null`, clearing any
attendance-driven `INCOMPLETE` back to its grade-only status. The flag column can
also be dropped (reverse of the Phase 5 migration) if fully abandoning the gate.

---

## Phase 6–7 — planned

See [`attendance-engine-domain.md` §15](./attendance-engine-domain.md) for the
full dependency-ordered plan (numbering follows the domain doc):

7. Alerts / reports.
