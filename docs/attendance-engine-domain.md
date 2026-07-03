# Attendance Engine — Domain Model (design, pre-implementation)

> Status: **domain-modelling only**. No commands/services/UI are proposed for
> build here. Schema blocks below are **design artifacts**, not applied
> migrations. "Exists" means code is in the repo today; everything else is
> proposed.

Core principle (confirmed against the existing calculator): attendance is
computed **per `Enrollment` + `LevelSubject`**, aggregated over the
`AttendanceSession`s of the enrolment's `ClassGroup`. Never globally per course.

---

> **Phase 1 (schema foundation) is built.** See
> [`attendance-engine.md`](./attendance-engine.md) for what shipped:
> `AttendancePolicy`, the two summary read-models, `LevelSubject.attendancePolicyId`,
> the `AttendanceRecord.enrollmentId` index (still nullable), permissions, and the
> migration. No academic behaviour changed; `INCOMPLETE` remains inactive.

## 0. Decisões aprovadas

As oito decisões de arquitectura estão **fechadas**. Substituem a antiga lista de
open decisions (agora "Resolved decisions", §13). São a base para o
`backend-lead` e mandam sobre qualquer texto exploratório noutras secções.

| # | Decisão (fechada) | Behaviour-neutral | Exige migration | Muda resultado académico |
|---|-------------------|:-----------------:|:---------------:|:------------------------:|
| 1 | `minimumAttendancePercentage` **e** `maxAbsences` permanecem no `LevelSubject`. | ✅ | — | — |
| 2 | `AttendancePolicy` controla **apenas interpretação** da presença, org-wide com override opcional por `LevelSubject`. | ✅ | ✅ (nova tabela + `LevelSubject.attendancePolicyId?`) | — |
| 3 | `AttendanceRecord.enrollmentId` será **NOT NULL em duas fases**: backfill primeiro, constraint depois. | ✅ | ✅ (backfill + NOT NULL) | — |
| 4 | `EXCUSED` deixa de ser fonte primária; passa a **efeito de justificação aprovada**. Mantém **compatibilidade transitória** (marca manual continua válida, deprecada). | ✅ (transição) | — | — |
| 5 | `PARTIAL` **não** será adicionado; parcialidade continua por `LATE` + `minutesAttended`/`lateMinutes`. | ✅ | — | — |
| 6 | `AttendanceSession` mantém status **`COMPLETED`**, não `CLOSED`. | ✅ | — | — |
| 7 | `INCOMPLETE` **não** será activado globalmente agora; infra será implementada, **gate opt-in** por policy/threshold. | — | — | ⚠️ **SIM** (quando activado) |
| 8 | `StudentSubjectAttendanceSummary` será **persistido** como read-model **single-writer**. | ✅ | ✅ (nova tabela) | — |

Dependências entre decisões: #4 depende de #2 (a policy decide o efeito do
excused); #8 é o que torna #7 tecnicamente possível; #3 é pré-requisito de #8;
#7 é a **única** decisão que altera resultados académicos e por isso é a única
que fica atrás de gate + revisão QA/Security antes de deploy.

---

## 1. Existing model analysis (ground truth)

A real Attendance module already ships. This is an **extend/refactor**, not a
greenfield build.

### 1.1 Persisted models that EXIST

| Model | Table | Notes |
|-------|-------|-------|
| `AttendanceSession` | `attendance_sessions` | Full FK set (org, branch, academicYear, academicTerm?, classGroup, course, courseLevel, **subject + levelSubject both**, teacher?, classroom?, scheduleSlot?). `durationMinutes Int`. Soft-delete. |
| `AttendanceRecord` | `attendance_records` | `@@unique([attendanceSessionId, studentId])`. `enrollmentId String?` **(nullable — problem, see §5)**. `minutesAttended`, `lateMinutes?`, `checkInAt/checkOutAt`. |
| `AttendanceJustification` | `attendance_justifications` | 1 record → many justifications. `status PENDING/APPROVED/REJECTED`, `attachmentUrl?`, review fields. |

Live status vocabularies (**differ from the brief**):

- `AttendanceSessionStatus`: `DRAFT | OPEN | COMPLETED | CANCELLED | ARCHIVED`
  — brief said `CLOSED`; live term is **`COMPLETED`** (+ an extra `ARCHIVED`).
- `AttendanceRecordStatus`: `PRESENT | ABSENT | LATE | EXCUSED | REMOTE`
  — brief said `PARTIAL`; live model has **no `PARTIAL`**, has **`REMOTE`**.
- `AttendanceJustificationStatus`: `PENDING | APPROVED | REJECTED` — matches.

Supporting code that EXISTS: `commands/` (create/update/cancel/complete session,
mark, bulk-mark, update record, create/approve/reject justification),
`repositories/` (session, record, justification), `services/`
(`attendance-calculator`, `attendance-risk`, `attendance` form-options),
`actions/`, `components/` (tables, columns, mark form, reports view),
permissions, domain-event types, and PT-PT labels/colors.

### 1.2 Attendance configuration that EXISTS (on `LevelSubject`)

```
minimumAttendancePercentage Decimal? @db.Decimal(5,2)
maxAbsences                 Int?
```

There is **no `AttendancePolicy` model**. Behavioural knobs from the brief
(`countExcusedAsPresent`, `lateAfterMinutes`, `autoCloseSessions`, …) do **not
exist** anywhere. The at-risk buffer is a hard-coded `AT_RISK_BUFFER = 5` in the
calculator.

### 1.3 Summary layer — computed on-read, NOT persisted

`attendance-calculator.service.ts` computes `StudentSubjectAttendance` live on
every read:

```
attendancePercentage = totalMinutesAttended / totalCompletedSessionMinutes * 100
  PRESENT / REMOTE → full durationMinutes
  LATE             → minutesAttended, else durationMinutes − lateMinutes
  EXCUSED          → 0 (counted absent for %), tracked separately as excused
  ABSENT           → 0
```

- Only `status = COMPLETED` sessions count (`findCompletedSessionsForLevelSubject`).
- Risk status `OK | AT_RISK | BELOW_REQUIRED` derived vs `min` and `min + 5`.
- **No** `StudentSubjectAttendanceSummary` / `StudentPeriodAttendanceSummary`
  models exist. `AttendanceAlert` does **not** exist — risk is emitted as
  transient domain events only.

Known defects in the current calculator (to fix on refactor, not carry
forward): a first loop computes counts with `sessionMinutes = 0` then **throws
the work away** and re-queries `attendanceRecord` a second time (dead code +
extra round-trip); `EXCUSED` is silently treated as absent for the percentage.

### 1.4 Academic-core hook — wired but DORMANT (stub)

- `StudentSubjectProgress.attendancePercentage Decimal?` **column exists**.
- The subject cascade **deliberately writes `null`**
  (`subject-progress-cascade.service.ts` / `recalculate-student-subject-progress.command.ts`):
  > "ATTENDANCE GATING IS INTENTIONALLY INACTIVE … pass `attendancePercentage: null`
  > so the INCOMPLETE (frequência abaixo do mínimo) branch stays dormant."
- `GradeCalculationService` already **accepts** `attendancePercentage` +
  `minimumAttendancePercentage` and has an `INCOMPLETE` branch — it just never
  fires because the input is `null`.
- `course-completion.strategy.ts` has `requireAttendance: false` (stub gate) and
  a reserved `PENDING_ATTENDANCE` completion reason.

**Conclusion:** the Academic Core already reserves the exact seam this engine
must fill. Activating attendance = feed a real per-enrolment percentage into the
existing subject cascade. No new cascade wiring is needed downstream.

### 1.5 Reuse / refactor / new — verdict

| Action | Items |
|--------|-------|
| **Reuse as-is** | `AttendanceSession`, `AttendanceJustification`, session/record/justification commands + repos, permissions, event types, scheduleSlot linkage. |
| **Refactor** | `AttendanceRecord.enrollmentId` → **required**; add duplicate-session unique constraint; replace on-read calculator with a persisted-summary reader; resolve `EXCUSED` semantics; extract `AT_RISK_BUFFER` into policy. |
| **New (models)** | `AttendancePolicy`, `StudentSubjectAttendanceSummary`, `StudentPeriodAttendanceSummary`, (optional) `AttendanceAlert`. |
| **New (wiring)** | Attendance→`StudentSubjectProgress.attendancePercentage` write + subject→level→course cascade trigger (transactional). |

---

## 2. Proposed final domain model

```
AttendancePolicy                 [NEW]  behavioural interpretation, org-wide + optional scope
AttendanceSession                [EXISTS] one attendance-taking event
AttendanceRecord                 [EXISTS, refactor] one student's mark in one session
AttendanceJustification          [EXISTS] justify an absence/lateness
StudentSubjectAttendanceSummary  [NEW]  academic read-model per enrollment+levelSubject
StudentPeriodAttendanceSummary   [NEW]  reporting read-model per enrollment+year+term
AttendanceAlert                  [NEW, optional/phase-2] persisted risk lifecycle
```

`AttendanceDashboard` = DTO only, never persisted (assembled from the two
summaries + counts). Confirmed as the brief requested.

---

## 3. Relationship diagram

```
Organization ─┬─ AttendancePolicy
              ├─ AttendanceSession ── AttendanceRecord ── AttendanceJustification
              ├─ StudentSubjectAttendanceSummary
              ├─ StudentPeriodAttendanceSummary
              └─ AttendanceAlert (opt)

ClassGroup    ── AttendanceSession
LevelSubject  ─┬─ AttendanceSession
              └─ StudentSubjectAttendanceSummary
AcademicYear/Term ── AttendanceSession, StudentPeriodAttendanceSummary

Enrollment ─┬─ AttendanceRecord (via session context; enrollmentId REQUIRED)
            ├─ StudentSubjectAttendanceSummary  (1 per levelSubject)
            └─ StudentPeriodAttendanceSummary   (1 per year+term)

StudentSubjectAttendanceSummary ──writes──▶ StudentSubjectProgress.attendancePercentage
                                              └─▶ subject → level → course cascade
```

Policy resolution (proposed): `LevelSubject.attendancePolicyId?` →
`CourseLevel`/`Course` (future) → **org default**. Academic thresholds
(`minimumAttendancePercentage`, `maxAbsences`) stay on `LevelSubject` as the
authoritative per-subject requirement; policy only governs *interpretation*.

---

## 4. Field-by-field specification

### 4.1 AttendancePolicy [NEW]

```prisma
model AttendancePolicy {
  id                        String   @id @default(cuid())
  organizationId            String
  name                      String
  isDefault                 Boolean  @default(false)   // one default per org (see §13)
  // interpretation knobs
  countExcusedAsPresent     Boolean  @default(false)
  countLateAsPartial        Boolean  @default(true)
  countRemoteAsPresent      Boolean  @default(true)
  lateAfterMinutes          Int      @default(10)
  absenceAfterMinutes       Int      @default(30)
  atRiskBufferPercentage    Decimal  @default(5) @db.Decimal(5,2)  // replaces hard-coded 5
  // justification workflow
  allowJustification        Boolean  @default(true)
  requireJustificationApproval Boolean @default(true)
  justificationWindowDays   Int?                       // submit-within-N-days, null = no limit
  // session lifecycle
  autoCloseSessions         Boolean  @default(false)
  // AttendancePolicyStatus: ACTIVE | INACTIVE | ARCHIVED
  status                    String   @default("ACTIVE")
  createdAt/updatedAt/deletedAt/createdBy
  @@index([organizationId, status])
}
```

Decision #1 (closed): `minimumAttendancePercentage` and `maxAbsences` **stay on
`LevelSubject`** — they are academic requirements, subject-specific, already used
by the grade engine. `AttendancePolicy` never stores thresholds.

### 4.2 AttendanceSession [EXISTS]

Keep current fields. **No new columns required** for the core model. Optional
additions to evaluate: `attendancePolicyId String?` (snapshot the policy used —
see §3/§13), `openedAt/closedAt/cancelledAt` (brief asked; currently only
`createdAt/updatedAt/deletedAt` + status). Confirm `subjectId` **and**
`levelSubjectId` both stay (denormalised for query convenience) — yes, keep;
`levelSubjectId` is the academic key, `subjectId` is convenience.

Answers to the brief's session questions:
- Must every session belong to a `LevelSubject`? **Yes** — `levelSubjectId` is
  non-null today; attendance is meaningless academically without it.
- Can a session exist without a `ClassGroup`? **No** — `classGroupId` is
  non-null; roster derivation depends on it.
- Auto-created from schedule? Not today; `scheduleSlotId?` exists to enable it
  later. Keep as future (governed by `autoCloseSessions`/a generator job).
- Multiple sessions same classGroup+levelSubject+date+time? Must be **prevented**
  for *active* sessions (see §13).
- `COMPLETED` immutable except admin correction? **Recommend yes** — records
  editable after completion only via an explicit correction path that requires a
  reason (see §5) and re-triggers recalculation.

### 4.3 AttendanceRecord [EXISTS — refactor]

Change `enrollmentId String?` → **`enrollmentId String` (required)** + relation
+ `@@index`. Per-enrollment calculation (the core principle) is unsafe while
this is nullable. Add relation to `Enrollment`.

Add for correction traceability (brief asked `updatedBy`/reason): `updatedByUserId String?`,
and record post-close edits through the audit log with a reason.

Answers:
- One record per active student in the class group? **Yes** — bulk-mark seeds a
  row per enrolled student (default `ABSENT`); confirmed by current default.
- Update after `COMPLETED`? Allowed **only** via correction path, reason
  required, re-runs summary + cascade.
- `minutesAttended` derived or entered? **Derived from status + policy** for
  PRESENT/REMOTE/LATE; manual entry only where status genuinely partial.
- LATE requires `lateMinutes`? **Yes** (validation). PARTIAL — **not a status**
  here; partiality is expressed via LATE + `lateMinutes`/`minutesAttended`.
  (Decision: do **not** add `PARTIAL`; keep the live 5-value set. See §12.)

### 4.4 AttendanceJustification [EXISTS]

Keep. Enforce **one active PENDING justification per record** (partial unique
index, §13). Approval effect — see §6/§12: **do not overwrite** the original
record status; apply the excused effect in the summary calculation.

### 4.5 StudentSubjectAttendanceSummary [NEW — persisted read-model]

```prisma
model StudentSubjectAttendanceSummary {
  id                     String   @id @default(cuid())
  organizationId         String
  enrollmentId           String
  studentId              String
  levelSubjectId         String
  totalSessions          Int      @default(0)
  totalScheduledMinutes  Int      @default(0)
  totalPresentMinutes    Int      @default(0)
  totalAbsentMinutes     Int      @default(0)
  totalLateMinutes       Int      @default(0)
  totalExcusedMinutes    Int      @default(0)
  presentCount           Int      @default(0)
  absentCount            Int      @default(0)
  lateCount              Int      @default(0)
  excusedCount           Int      @default(0)
  remoteCount            Int      @default(0)
  attendancePercentage   Decimal? @db.Decimal(5,2)
  // Status: NOT_STARTED | SUFFICIENT | AT_RISK | BELOW_REQUIRED
  status                 String   @default("NOT_STARTED")
  calculatedAt           DateTime
  @@unique([enrollmentId, levelSubjectId])
  @@index([organizationId, status])
}
```

Persist as read-model; recalc **transactionally** after relevant mutations
(§7/§11). This is the value fed to `StudentSubjectProgress.attendancePercentage`.
Note: added `AT_RISK` to the brief's 3-value set to preserve the live
three-tier risk semantics.

### 4.6 StudentPeriodAttendanceSummary [NEW — persisted reporting model]

```prisma
model StudentPeriodAttendanceSummary {
  id                    String   @id @default(cuid())
  organizationId        String
  academicYearId        String
  academicTermId        String?           // nullable → filtered-unique strategy (§10)
  enrollmentId          String
  studentId             String
  courseId              String
  courseLevelId         String?
  classGroupId          String?
  totalSessions         Int      @default(0)
  presentCount          Int      @default(0)
  absentCount           Int      @default(0)
  lateCount             Int      @default(0)
  excusedCount          Int      @default(0)
  remoteCount           Int      @default(0)  // brief said partialCount; use remoteCount
  totalScheduledMinutes Int      @default(0)
  totalPresentMinutes   Int      @default(0)
  attendancePercentage  Decimal? @db.Decimal(5,2)
  // Status: GOOD | AT_RISK | BELOW_REQUIRED
  status                String   @default("GOOD")
  calculatedAt          DateTime
}
```

Reporting/dashboard only; **not** an academic source. Subject summary remains the
academic truth.

### 4.7 AttendanceAlert [NEW — optional, phase 2]

Only if notifications need durable, dismissible alerts. Otherwise keep the
current event-only approach.

```prisma
model AttendanceAlert {
  id, organizationId, studentId, enrollmentId, levelSubjectId?
  // Type: STUDENT_AT_RISK | STUDENT_BELOW_REQUIRED | CONSECUTIVE_ABSENCES
  //     | EXCESSIVE_LATENESS | LOW_CLASS_ATTENDANCE | STUDENT_RECOVERED_ATTENDANCE
  type      String
  // Status: OPEN | RESOLVED | DISMISSED
  status    String @default("OPEN")
  detail    String? @db.NVarChar(Max)
  raisedAt, resolvedAt?, resolvedByUserId?
  @@unique([organizationId, enrollmentId, levelSubjectId, type, status])  // dedup OPEN
}
```

---

## 5. Constraints & indexes (proposed)

- `AttendanceRecord`: keep `@@unique([attendanceSessionId, studentId])`; **add**
  `enrollmentId` (required) + `@@index([organizationId, enrollmentId])`. (A
  `(session, enrollment)` unique would also hold once enrollmentId is required;
  keep the studentId unique as the operational key.)
- `AttendanceSession` duplicate prevention: filtered unique index on
  `(classGroupId, levelSubjectId, sessionDate, startTime, endTime)` **WHERE
  `status NOT IN (CANCELLED, ARCHIVED)` AND `deletedAt IS NULL`** (§10 — raw SQL,
  Prisma can't express a filtered unique).
- `StudentSubjectAttendanceSummary`: `@@unique([enrollmentId, levelSubjectId])`.
- `StudentPeriodAttendanceSummary`: nullable-term uniqueness via **two filtered
  indexes** (§10).
- Existing supporting indexes already present:
  `student_subject_progress_org_attendance_idx`,
  `attendance_sessions_org_status_sessiondate_idx`.

---

## 6. Justification & EXCUSED semantics (the key correctness decision)

Current behaviour: `EXCUSED` is a **record status** that the calculator counts as
**0 minutes** (i.e. absent for %). Approving a justification does **not** flip the
record today. This conflates "excused" with "present" incorrectly and loses the
original mark.

**Proposed model:**
1. Original `AttendanceRecord.status` is **immutable evidence** (what happened:
   PRESENT/ABSENT/LATE/REMOTE). `EXCUSED` should **not** be a primary mark going
   forward — it's an *effect* of an approved justification over an `ABSENT`/`LATE`.
2. Justification approval sets `justification.status = APPROVED`; the summary
   calculator then applies the policy: if `countExcusedAsPresent` → excused
   minutes count toward attendance; else tracked separately (current behaviour).
3. **Decision #4 (approved):** the live enum lists `EXCUSED` as a record status
   and the UI uses it. Transitional compatibility is retained — manual `EXCUSED`
   stays valid but **deprecated**, and an approved justification is the
   authoritative excuse signal. No hard data migration of existing `EXCUSED`
   rows; the effect is applied at calculation time.

Answers: multiple justifications per record — **yes** historically, but only one
`PENDING` at a time. Rejected can be resubmitted (new row). Submitters:
student/guardian/secretary. Approvers: org-admin/secretary/teacher (per existing
permissions).

---

## 7. Summary strategy

- **Persist both summaries** as read-models (not on-read). Retire the on-read
  calculator's dual-query defect.
- `StudentSubjectAttendanceSummary` recalculated **transactionally** on:
  session `COMPLETED`, record marked/updated/corrected, justification
  approved/rejected. Same enrolment+levelSubject scope.
- Recalculation writes the summary **and** `StudentSubjectProgress.attendancePercentage`
  in the **same transaction**, then triggers the subject→level→course cascade
  (§11), reusing the established transactional cascade + deferred-event pattern.
- `StudentPeriodAttendanceSummary` recalculated in the same transaction (cheap
  aggregate) or via a debounced job for dashboards — see §13 (resolved: same-tx
  for the subject summary; period summary may be debounced).
- Drift avoidance: single writer per summary; recalc is idempotent (derived
  purely from records + completed sessions + policy).

---

## 8. Integration with the Academic Core

| Question | Answer |
|----------|--------|
| How does attendance update `StudentSubjectProgress.attendancePercentage`? | The subject-summary recalc writes it (today it's forced `null`). |
| Which service owns the write? | A new attendance recalculation service **calls into the existing grade/subject cascade** — it does not write progress directly except the attendance field; recommend it hands `attendancePercentage` to `recalculate-student-subject-progress` so the grade engine owns the row. |
| Same transactional cascade? | **Yes** — reuse `CascadeContext` (tx client + deferred events); attendance mutation + summary + subject/level/course recalc commit atomically; events publish post-commit. |
| How does `INCOMPLETE` propagate? | `GradeCalculationService` already emits `INCOMPLETE` when `attendancePercentage < minimum`; it then flows through subject→level (`recalculateStudentLevelProgress`)→course exactly like any other subject status. No new propagation code. |
| Affects `SubjectEligibilityEngine`? | Indirectly — a subject stuck `INCOMPLETE` isn't `PASSED`, so it can't satisfy prerequisites. No direct attendance read in the engine (confirmed: no attendance refs in prerequisites except the course-completion stub). |
| Affects `LevelProgressionEngine`? | Only via subject status; no direct read. |
| Affects `CourseCompletionEngine`? | `requireAttendance` gate exists (`false`) + `PENDING_ATTENDANCE` reserved reason. Activating it is a **later** policy decision, out of this model's scope. |

**Required rule (confirmed feasible):** attendance mutation → subject → level →
course recalculation, atomically.

---

## 9. Status semantics

- **Session** `DRAFT`(not counted) `OPEN`(in progress, not counted) `COMPLETED`
  (counted in summaries) `CANCELLED`/`ARCHIVED`(excluded). Vocabulary is
  `COMPLETED`, not `CLOSED` (Decision #6).
- **Record** `PRESENT`/`REMOTE`(full) `LATE`(partial via minutes) `ABSENT`(0)
  `EXCUSED`(effect, policy-dependent). **No `PARTIAL`** — partiality via LATE.
- **Justification** `PENDING`/`APPROVED`/`REJECTED`.
- **Subject summary** `NOT_STARTED`/`SUFFICIENT`/`AT_RISK`/`BELOW_REQUIRED`
  (kept 3-tier risk from live calculator).
- **Period summary** `GOOD`/`AT_RISK`/`BELOW_REQUIRED`.

Clarifications the brief asked:
- Is `EXCUSED` a status or a justification effect? **Effect** (going forward,
  §6). Can it coexist with original `ABSENT`? **Yes** — original mark preserved,
  excuse applied in calculation.
- `BELOW_REQUIRED` before subject/course completion? It's an **advisory
  projection** on current data; it only becomes an academic gate (`INCOMPLETE`)
  through the grade engine when the subject actually resolves. Attendance % alone
  never sets a terminal academic status.

---

## 10. SQL Server considerations

- **Nullable `academicTermId` uniqueness** (`StudentPeriodAttendanceSummary`):
  SQL Server treats a single `NULL` as unique but rejects multiple NULLs under a
  plain unique. Use **two filtered unique indexes** (raw SQL in the migration —
  matches prior project experience with nullable `@unique`):
  ```sql
  CREATE UNIQUE INDEX ux_period_term
    ON student_period_attendance_summary(enrollmentId, academicYearId, academicTermId)
    WHERE academicTermId IS NOT NULL;
  CREATE UNIQUE INDEX ux_period_noterm
    ON student_period_attendance_summary(enrollmentId, academicYearId)
    WHERE academicTermId IS NULL;
  ```
- **Duplicate-session prevention** needs a filtered unique (status/deletedAt
  predicate) — also raw SQL, not a Prisma `@@unique`.
- Keep `@db.NVarChar(Max)` for long text (`notes`, `reason`, `reviewNotes`) as
  the codebase already does.
- Hand-written migrations: split `ALTER ADD COLUMN` from same-batch references;
  making `AttendanceRecord.enrollmentId` NOT NULL requires a **backfill** first
  (existing rows with null enrollment must be resolved) — this is a real data
  migration, flag as a risk (§14).
- `Decimal(5,2)` consistent with `minimumAttendancePercentage`.

---

## 11. Multi-tenant & security rules

- `organizationId` **never** from client; derived from session context, enforced
  in every repository query (existing pattern). All FK ids validated against the
  active org.
- Teacher: may manage sessions/records only for **assigned** classes/subjects —
  enforce via `resolveDataAccessScope` (`@/server/auth/teacher-scope`), the
  existing central scope.
- Student: view/submit **own** records/justifications only (`student-scope`).
- Guardian: view **linked** students only, gated by
  `GuardianStudent.canViewAttendance` (that flag already exists).
- Secretary/Admin: per existing `attendanceSessions.*` / `attendanceRecords.*` /
  `attendanceJustifications.*` permissions (already defined).
- Enforcement layers: command `validate()`+`authorize()`, repository org-scoping,
  server action guards, nav allowlist. New summaries need **read** permissions +
  scope filters mirroring `StudentSubjectProgress`.

---

## 12. Auditability

Audit (write audit rows / domain events):
- session created / opened / **completed** / cancelled / archived
- attendance marked / updated / **corrected after completion (reason required)**
- justification submitted / approved / rejected (events already exist)
- summary crossing `AT_RISK` / `BELOW_REQUIRED` / recovered (existing risk events
  — extend with a `recovered` transition)
- `attendancePercentage`-driven subject status change (flows through existing
  grade-change audit)

Do **not** audit: passive dashboard/summary reads, every idempotent recalc that
produces no status transition (mirror the grade-engine "emit only on boundary
crossing" rule).

---

## 13. Resolved decisions

All eight core decisions are **closed** (see §0). This section records the
resolution of the remaining sub-questions raised during design; none is open.

1. **Threshold ownership — RESOLVED (Decision #1).** `minimumAttendancePercentage`
   and `maxAbsences` stay on `LevelSubject`. `AttendancePolicy` never stores
   thresholds; it stores interpretation only (Decision #2). *Behaviour-neutral.*
2. **One default policy per org — RESOLVED.** Exactly one `isDefault = true` per
   org, enforced by a filtered unique index (`WHERE isDefault = 1`). *Requires
   migration (new table).*
3. **Policy snapshotting — RESOLVED.** A `COMPLETED` session freezes the policy
   used via `AttendanceSession.attendancePolicyId` so historical percentages stay
   audit-stable. *Requires migration (new nullable column).*
4. **`EXCUSED` — RESOLVED (Decision #4).** No hard migration of existing rows.
   Manual `EXCUSED` stays valid but deprecated; the approved justification is the
   authoritative excuse and the effect is applied at calculation time.
   *Behaviour-neutral (transitional).*
5. **Period-summary freshness — RESOLVED.** The subject summary recalculates in
   the same transaction as the attendance mutation (it feeds the academic
   cascade); the period summary may be updated in the same tx or via a debounced
   job — it is reporting-only and never gates academics.
6. **`AttendanceAlert` — RESOLVED.** Deferred to the alerts/reports step (§15.7);
   until then risk stays as transient events. *Optional; migration only if built.*
7. **`enrollmentId` backfill — RESOLVED (Decision #3).** Two-phase: add/verify the
   column, backfill by resolving (student, classGroup, session date) → enrolment,
   then apply `NOT NULL`. *Requires migration (backfill + constraint).*
8. **Activate `requireAttendance` on `CourseCompletionEngine` — RESOLVED.** Out of
   scope for this engine; sequenced strictly after gated academic wiring (§15.5)
   and treated as a separate product decision. Related to Decision #7, which is
   the **only** change that alters academic results.

---

## 14. Risks

- **`enrollmentId` NOT NULL migration** on `attendance_records` — existing null
  rows must be backfilled by resolving (student, classGroup, session date) →
  enrolment. Ambiguity risk (a student re-enrolled). **High** — data migration.
- **Behavioural change** activating the dormant `INCOMPLETE` gate: subjects that
  currently pass on grade alone may become `INCOMPLETE` once real % flows in.
  Must be **opt-in** (policy/threshold present) and communicated. **High.**
- Calculator rewrite must preserve the existing weight rules
  (PRESENT/REMOTE full, LATE partial, EXCUSED per policy) or grades shift silently.
- Recalculation fan-out: completing a session recalculates every enrolled
  student's summary + subject cascade in one tx — watch transaction size/timeout
  (grade engine uses `{ timeout: 120_000, maxWait: 15_000 }` for bulk).
- SQL Server filtered-index migrations are hand-written → test on a real
  instance, not just `prisma migrate dev`.
- Status vocabulary is fixed to the live terms `COMPLETED`/`REMOTE` (Decisions #6,
  #5); `CLOSED`/`PARTIAL` are rejected. Keep docs and downstream consumers aligned
  to the live terms.

---

## 15. Implementation order (dependency-driven)

Ordered by the approved decisions and their dependencies (#3 → #8; #2 → #4;
#8 → #7). Each label marks whether the step is behaviour-neutral, needs a
migration, and whether it changes academic results.

1. **Policy + summary schema** — add `AttendancePolicy` (org default via filtered
   unique on `isDefault`), `AttendanceSession.attendancePolicyId?` (snapshot),
   `StudentSubjectAttendanceSummary`, and the duplicate-session filtered unique.
   *Migration. Behaviour-neutral (tables/columns only, nothing reads them yet).*
2. **`enrollmentId` backfill** — **✅ built** (the resolve+fill half). Backfill
   resolves `(student, session.course/classGroup/level)` → enrolment via a
   3-tier priority resolver, fills only unambiguous matches, and reports
   ambiguous/unresolved rows. `NOT NULL` + FK are **prepared but not applied**
   (`prisma/planned-migrations/attendance_engine_phase2b_enrollment_not_null.sql`)
   until the report shows zero nullable rows. See
   [`attendance-engine.md`](./attendance-engine.md) → *Phase 2*. (Decision #3,
   two-phase.) *Migration + data backfill. Behaviour-neutral.*
3. **EXCUSED semantics** — **✅ built** (shipped with step 4 as "Phase 3"). The
   calculation engine treats `EXCUSED` and approved justifications as a
   policy-driven *effect* (`countExcusedAsPresent`); manual `EXCUSED` stays valid
   but deprecated (Decision #4). *Behaviour-neutral (transitional); no data migration.*
4. **Summary recalculation** — **✅ built** (shipped as "Phase 3"). Single-writer
   `StudentSubjectAttendanceSummaryService` persists `StudentSubjectAttendanceSummary`
   transactionally + idempotently; pure `calculateAttendanceSummary` reproduces
   the legacy percentage under the default policy (parity-tested). Best-effort
   recalc triggers on every attendance mutation; standalone + batch commands for
   explicit repair. See [`attendance-engine.md`](./attendance-engine.md) → *Phase 3*.
   *No migration. Behaviour-neutral — no academic write yet.*
5. **Gated academic wiring** — **✅ built.** The cascade
   ([subject-progress-cascade.service.ts](../src/modules/grades/services/subject-progress-cascade.service.ts))
   resolves the effective policy + persisted summary and writes
   `StudentSubjectProgress.attendancePercentage`, driving the transactional
   subject→level→course cascade; the `INCOMPLETE` gate fires **only** when
   `AttendancePolicy.enforceAttendanceForProgress = true` (new flag, default false)
   AND a `LevelSubject.minimumAttendancePercentage` threshold exists (Decision #7).
   `INCOMPLETE` is non-terminal (level → IN_PROGRESS, course never COMPLETED/FAILED
   solely from it). Off by default → deploy is behaviour-neutral. Repair command +
   rollout/rollback documented. ⚠️ **The only step that changes academic results.**
   See [`attendance-engine.md`](./attendance-engine.md) → *Phase 5*.
6. **Period / year summary** — **✅ built** (shipped as "Phase 4", ahead of step 5).
   `StudentPeriodAttendanceSummary` persisted per `(enrollment, year, term?)` for
   reporting/dashboards; per-record policy resolution, weighted baseline, manual
   upsert against the nullable-term filtered indexes, fire-and-forget triggers +
   batch/repair commands, read DTOs. Reporting-only — the subject summary remains
   the academic source. See [`attendance-engine.md`](./attendance-engine.md) →
   *Phase 4*. *No new migration (table shipped in Phase 1). Behaviour-neutral.*
7. **Alerts / reports** — extend risk events and, if needed, add the persisted
   `AttendanceAlert` lifecycle; reporting surfaces. *Migration only if
   `AttendanceAlert` is built. Behaviour-neutral.*

Steps 1–4, 6, 7 are independently shippable and behaviour-neutral. **Only step 5
alters academic outcomes** and is the single gated, review-blocking step.
Activating `CourseCompletionEngine.requireAttendance` (§13.8) is a later, separate
product decision sequenced after step 5.
```
