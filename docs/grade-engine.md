# Grade Engine

## Overview

The Grade Engine enables direct per-component grading of students enrolled in subjects. Unlike the Assessment Engine (which uses scheduled assessment events tied to `LevelSubject`), the Grade Engine works directly with `Subject` and records one `StudentAssessmentResult` per student per grading component.

Results feed into the shared `StudentSubjectProgress` table used by both engines, providing a unified view of academic standing.

---

## Architecture

```
src/modules/grades/
  types/index.ts                        — domain types, status constants, display labels
  schemas/grade.schema.ts               — Zod validation for all commands
  repositories/
    subject-assessment-policy.repository.ts
    subject-assessment-component.repository.ts
    student-assessment-result.repository.ts
  services/
    grade-calculation.service.ts        — GradeCalculationService singleton
  commands/                             — 11 BaseCommand implementations
  actions/grade.actions.ts              — "use server" wrappers
  components/                           — React client components
```

---

## Domain Models

### SubjectAssessmentPolicy

One policy per subject at a time. Defines how the final grade is calculated.

| Field | Type | Description |
|---|---|---|
| `subjectId` | String | Subject this policy belongs to |
| `calculationMethod` | String | `WEIGHTED_AVERAGE` or `SIMPLE_AVERAGE` |
| `roundingMethod` | String | `NONE`, `ROUND`, `FLOOR`, or `CEIL` |
| `minimumPassingGrade` | Decimal | Fallback minimum (0–100) if LevelSubject has none |
| `allowRecovery` | Boolean | Whether recovery components are permitted |
| `status` | String | `DRAFT` → `ACTIVE` → `ARCHIVED` |

**Rules:**
- Only one `ACTIVE` policy per subject at a time.
- A policy in `ARCHIVED` status cannot be edited.
- Activating a `WEIGHTED_AVERAGE` policy requires total component weight = 100%.

### SubjectAssessmentComponent

A grading instrument within a policy (test, exam, project, etc.).

| Field | Type | Description |
|---|---|---|
| `assessmentPolicyId` | String | Parent policy |
| `type` | String | `TEST`, `EXAM`, `PROJECT`, `ASSIGNMENT`, `PRACTICAL`, `ORAL`, `PARTICIPATION`, `RECOVERY` |
| `weight` | Decimal | Percentage weight (0–100). Must sum to 100 for WEIGHTED_AVERAGE |
| `maxGrade` | Decimal | Maximum raw grade value |
| `order` | Int | Display/calculation order |
| `isRequired` | Boolean | Whether this component must be graded |
| `status` | String | `DRAFT`, `ACTIVE`, or `ARCHIVED` |

### StudentAssessmentResult

One record per student per component. Unique on `(enrollmentId, assessmentComponentId)`.

| Field | Type | Description |
|---|---|---|
| `enrollmentId` | String | The student's enrollment |
| `studentId` | String | Denormalized for efficient querying |
| `subjectId` | String | Denormalized for filtering |
| `assessmentComponentId` | String | The component being graded |
| `grade` | Decimal | Raw grade entered |
| `maxGrade` | Decimal | Max grade at time of recording |
| `normalizedGrade` | Decimal | `grade / maxGrade × 100` |
| `status` | String | `DRAFT`, `SUBMITTED`, `GRADED`, or `CANCELLED` |
| `gradedBy` | String? | User ID who graded |
| `gradedAt` | DateTime? | When graded |

---

## Calculation Methods

### WEIGHTED_AVERAGE

```
finalGrade = Σ(normalizedGrade_i × weight_i) / Σ(weight_i)
```

Uses only components with `status = GRADED`. Component weights must sum to 100 before the policy can be activated.

### SIMPLE_AVERAGE

```
finalGrade = Σ(normalizedGrade_i) / count(graded_components)
```

Weight is ignored. The average is taken over all graded components.

---

## Rounding Methods

Applied to the calculated `finalGrade` before comparison with the minimum passing grade:

| Method | Behavior |
|---|---|
| `NONE` | Two decimal places, no rounding |
| `ROUND` | `Math.round` |
| `FLOOR` | `Math.floor` |
| `CEIL` | `Math.ceil` |

---

## Minimum Passing Grade

Priority chain (highest wins):

```
levelSubject.minimumPassingGrade ?? policy.minimumPassingGrade ?? 50
```

The `LevelSubject` setting always takes precedence, allowing different passing thresholds per course level even when subjects share a policy.

---

## Progress Status

`GradeCalculationService.calculateFinalGrade` returns one of:

| Status | Condition |
|---|---|
| `IN_PROGRESS` | Not all required components are graded |
| `PASSED` | `finalGrade >= minimumPassingGrade` |
| `RECOVERY_REQUIRED` | Failed but `allowRecovery = true` |
| `FAILED` | Failed and `allowRecovery = false` |
| `BLOCKED` | Policy or components missing |

`RECOVERY_REQUIRED` is **preserved** as a real, non-terminal `StudentSubjectProgress`
status — it is **not** mapped to `FAILED` (see *Recovery Lifecycle* below).

---

## StudentSubjectProgress Bridge

The Grade Engine writes into the same `StudentSubjectProgress` table used by the Assessment Engine, enabling a unified academic progress view.

Resolution of `levelSubjectId`:

```ts
db.levelSubject.findFirst({
  where: { subjectId, courseLevelId: enrollment.courseLevelId }
})
```

If no `LevelSubject` record exists for the enrollment's course level + subject combination, progress is computed but not persisted (returned as an in-memory object).

---

## Commands

| Command | Permission |
|---|---|
| `CreateAssessmentPolicyCommand` | `gradePolicies.create` |
| `UpdateAssessmentPolicyCommand` | `gradePolicies.update` |
| `ArchiveAssessmentPolicyCommand` | `gradePolicies.archive` |
| `ActivateAssessmentPolicyCommand` | `gradePolicies.update` |
| `CreateAssessmentComponentCommand` | `gradeComponents.create` |
| `UpdateAssessmentComponentCommand` | `gradeComponents.update` |
| `DeleteAssessmentComponentCommand` | `gradeComponents.delete` |
| `CreateStudentAssessmentResultCommand` | `grades.create` |
| `UpdateStudentAssessmentResultCommand` | `grades.update` |
| `CancelStudentAssessmentResultCommand` | `grades.cancel` |
| `RecalculateStudentSubjectProgressCommand` | `assessmentResults.grade` |
| `RecalculateSubjectGradesCommand` | `studentProgress.calculate` |

> The former `CalculateStudentSubjectProgressCommand` (non-cascading) was **removed**.
> Subject-progress recalculation is now unified under the single cascading path —
> see *Single Source of Truth & Grade Mutation Flow* below.

---

## Permissions

| Role | Policies | Components | Grade Results | Calculate |
|---|---|---|---|---|
| `ORG_ADMIN` | full | full | full | yes |
| `TEACHER` | view+create+update+archive | full | full | yes |
| `SECRETARY` | view | view | view | — |
| `STUDENT` | — | — | view (own) | — |

Tenant isolation is enforced on every query via `organizationId`.

---

## Audit Trail

All mutation commands emit an audit event via `AuditService`:

- `GRADE_POLICY_CREATED`, `GRADE_POLICY_UPDATED`, `GRADE_POLICY_ARCHIVED`, `GRADE_POLICY_ACTIVATED`
- `GRADE_COMPONENT_CREATED`, `GRADE_COMPONENT_UPDATED`, `GRADE_COMPONENT_DELETED`
- `GRADE_RESULT_CREATED`, `GRADE_RESULT_UPDATED`, `GRADE_RESULT_CANCELLED`
- `STUDENT_SUBJECT_PROGRESS_CALCULATED`

---

## Domain Events

The subject-progress cascade (`recalculateSubjectProgressCascade`) emits:

- `STUDENT_SUBJECT_PASSED` — when final status is `PASSED`
- `STUDENT_SUBJECT_FAILED` — when final status is `FAILED` or `RECOVERY_REQUIRED`

These events are consumed by the Student Timeline module to create timeline entries.

---

## UI Entry Points

| Route / Location | Purpose |
|---|---|
| `/subjects/[subjectId]?tab=policy` | Create/manage policies and components |
| `/grades` | View all grade results with filters |
| `/grades/entry` | Bulk grade entry per class group + component |
| `/students/[studentId]` (Notas section) | View student grades grouped by subject |
| `/enrollments/[enrollmentId]` (Progresso Académico) | View enrollment grades per subject |

---

## Tenant Isolation

Every database query includes `organizationId` in the `where` clause. Commands validate that all referenced entities (subject, enrollment, component) belong to the same organization before executing.

---

## Single Source of Truth & Grade Mutation Flow

As of the Grade Engine Final Sprint (2026-07-01) the engine is single-sourced,
auditable and cascade-safe.

### Source of truth

**`StudentAssessmentResult` is the only canonical grade record.** It owns
`grade`, `maxGrade`, `normalizedGrade`, `sourceType`, `status`,
`assessmentComponentId`, `enrollmentId`, `studentId`, `levelSubjectId`,
`subjectId` and the optional `assessmentEventId`.

- Continuous grading writes it with `sourceType = CONTINUOUS`.
- Scheduled-exam grading (Assessment Engine, `bulk-grade`) writes it with
  `sourceType = SCHEDULED_EVENT` and `assessmentEventId`.
- Recovery/retake write-back writes it with `sourceType = RECOVERY`.

**`AssessmentResult` is a participation/event sidecar only** (status +
feedback for a scheduled event). Its `score` / `normalizedScore` columns are
**deprecated** — always written `null`, never read by the grade engine. Do not
treat `AssessmentResult` as a grade source.

### Mutation flow (every write path)

```
GradeMutated (create | update | cancel | invalidate | recovery | bulk)
   └─ db.$transaction  ── one atomic boundary ──────────────────────────┐
        ├─ canonical StudentAssessmentResult write                      │
        └─ GradeMutationService.handleGradeMutation(client = tx)        │
             ├─ createGradeChangeLog   (immutable audit of the change)  │
             └─ recalculateSubjectProgressCascade                       │
                  └─ StudentSubjectProgress                             │
                       └─ recalculateStudentLevelProgress → StudentLevelProgress
                            └─ evaluateCourseCompletion   → StudentCourseProgress
   ┘  (commit)
   → publish collected domain events   (only AFTER the commit)
```

`recalculateSubjectProgressCascade` (`services/subject-progress-cascade.service.ts`)
is the **single, always-cascading** recalculation path. It reads only the
canonical `StudentAssessmentResult` rows (`CANCELLED` results are excluded, so an
invalidated/cancelled grade correctly drops out of the calculation). Batch
recalculation (`RecalculateSubjectGradesCommand`) and scheduled-exam grading
(`bulk-grade`) use this same path — there is no non-cascading variant.

### Transactional cascade (atomicity)

**Every grade mutation is atomic.** The command opens a single interactive
transaction (`db.$transaction`) and threads its client through the canonical
write, the `GradeChangeLog` and the *entire* derived cascade
(`StudentSubjectProgress → StudentLevelProgress → StudentCourseProgress`), so:

- Either **everything commits** — the canonical grade, its change log and all
  derived progress — **or nothing does**. A failure mid-cascade rolls the
  canonical grade back to its previous value; no partial derived progress and no
  orphan `GradeChangeLog` can remain.
- **Domain events are published only after the transaction commits.** The cascade
  *collects* event payloads (via the `CascadeContext.events` buffer in
  `src/shared/lib/cascade.ts`) instead of publishing them inline; the command
  publishes them once the transaction has committed. No event is ever emitted for
  a rolled-back change.
- The course-completion **audit** row joins the same transaction (written through
  the tx client); the course-completion **event** is buffered and published after
  commit, like every other cascade event.

Mechanism: repository, service and engine helpers accept an optional
`PrismaClientOrTx` (`src/server/db`). When present they use it; when absent they
fall back to the global client, so read-only/standalone callers are unchanged.

- **Recovery** (`GradeAssessmentRetakeCommand`) and **invalidation**
  (`InvalidateAssessmentResultCommand`) follow the same boundary: the retake grade
  / sidecar invalidation, the canonical write and the cascade commit together.
- **Bulk grading** (`BulkGradeAssessmentCommand`) uses one **all-or-nothing**
  transaction for the whole batch (chosen over per-row atomicity for academic
  consistency — a partially graded assessment is never persisted). Each row
  targets a distinct enrollment, so there is no redundant re-cascade; the
  transaction timeout is raised because a large class runs many per-student
  cascades inside the single transaction.
- The two repair commands (`RecalculateSubjectGradesCommand`,
  `RecalculateStudentSubjectProgressCommand`) recompute derived progress inside a
  transaction too. The single-enrollment recompute is one transaction; the
  batch repair sweep uses **one transaction per enrollment** (atomic per student)
  so a single failing student is skipped without rolling back the others.

Covered by `grade-cascade-transaction.test.ts` (mid-cascade failure → rollback +
no events, for create / update / invalidate / retake / bulk, plus the
all-or-nothing bulk contract).

### Stable `completedAt`

`completedAt` on `StudentSubjectProgress`, `StudentLevelProgress` and
`StudentCourseProgress` means **the first time the unit reached its current
completion state**, and it is **stable across recalculations** — re-running the
cascade on an already-completed unit never moves the date forward.

A single pure helper, `resolveStableCompletedAt` (`src/shared/lib/completed-at.ts`),
decides the value for all three layers, so the rule can never diverge. It takes
two status sets:

- **terminal** — statuses that carry a `completedAt` at all;
- **completion** — the subset that means *positive* completion.

| Transition | `completedAt` |
|------------|---------------|
| non-terminal → terminal completion | `now` |
| status unchanged (terminal) | **preserved** (idempotent recalc) |
| terminal → non-terminal | `null` |
| non-terminal → non-terminal | `null` |
| between different terminals, into a positive completion (e.g. FAILED → PASSED) | `now` |
| positive completion → terminal non-completion (e.g. PASSED → FAILED) | `null` |

Per layer:

- **Subject** — terminal `{PASSED, FAILED}`, completion `{PASSED}`. A subject that
  goes `FAILED → PASSED` (e.g. after recovery) is stamped `now`; `PASSED → FAILED`
  clears the date; `PASSED → PASSED` / `FAILED → FAILED` preserve it.
- **Level** — terminal `{PASSED, FAILED, PROMOTED, COMPLETED}`, completion
  `{PASSED, PROMOTED, COMPLETED}`. **`PROMOTED_WITH_PENDING_SUBJECTS` is NOT a
  completion** (a level advanced carrying pending subjects is not academically
  complete) and carries no `completedAt`; `ELIGIBLE_TO_PROGRESS`, `BLOCKED`,
  `IN_PROGRESS`, `RECOVERY_REQUIRED` are non-terminal.
- **Course** — `StudentCourseProgress` already followed this principle
  (`persistCourseCompletion`); the helper generalises that logic.

The prior row is read **inside the same cascade transaction** (the tx client), so
the resolution is transactional and deterministic. The manual-approval path
(`review-progression-request.service.ts`) uses the same helper for the origin
level, so it never stamps a completion date on `PROMOTED_WITH_PENDING_SUBJECTS`.

Covered by `shared/lib/completed-at.test.ts` (full transition matrix) and the
subject/level service tests.

### GradeChangeLog

Every mutation records a `GradeChangeLog` row: `oldGrade` / `newGrade`,
`oldNormalizedGrade` / `newNormalizedGrade`, `oldStatus` / `newStatus`,
`source` (`CREATE | UPDATE | CANCEL | INVALIDATE | RECOVERY | BULK`), `reason`
and `changedBy`. A reason is **required** for post-submission edits
(update-after-graded, cancellation, invalidation, recovery override, regrade).

### Invalidation

Invalidating a scheduled-exam result marks the `AssessmentResult` sidecar
`INVALIDATED` **and** cancels the canonical `StudentAssessmentResult`
(`status = CANCELLED`; there is no `INVALIDATED` value in `StudentResultStatus`),
writes a `GradeChangeLog` (`source = INVALIDATE`) and cascades. Invalidation
therefore changes the subject, level and course outcome.

### Recovery / retake

A graded `AssessmentRetake` writes back into the canonical
`StudentAssessmentResult` (`sourceType = RECOVERY`). The effective grade is
decided by the pure **`GradeResolutionEngine`** with strategies `BEST_SCORE`
(safe default), `LAST_SCORE`, `REPLACE` and `AVERAGE`. Recovery is never a
dead-end: after write-back the full cascade runs.

### Recovery Lifecycle

`RECOVERY_REQUIRED` is a **real, non-terminal academic state**, not a synonym for
failure. When the normal evaluation fails (`finalGrade < minimum`) and the policy
allows recovery, the subject is **unresolved**, not failed:

- **Subject** — `StudentSubjectProgress.status = RECOVERY_REQUIRED` (no
  `completedAt`; it is not in the terminal set). It must **not** collapse to
  `FAILED`.
- **Level** — a required subject in `RECOVERY_REQUIRED` makes
  `StudentLevelProgress.status = RECOVERY_REQUIRED` (unresolved, no `completedAt`,
  not eligible for progression). It is **not** counted as a failed subject.
- **Course** — a level in `RECOVERY_REQUIRED` makes
  `StudentCourseProgress.status = RECOVERY_REQUIRED` with
  `completionReason = PENDING_RECOVERY`. The course is **never** `COMPLETED` and
  **never** `FAILED` while recovery is pending.

**Resolution & no double-counting.** There is exactly **one** canonical
`StudentAssessmentResult` per `(enrollmentId, assessmentComponentId)` (DB unique
constraint). The recovery write-back **upserts that same row**, replacing its
grade with the effective grade already resolved by `GradeResolutionEngine`
(original vs recovery) at write time. The cascade reads one row per component, so
original and recovery grades are **never summed** — each component contributes its
single resolved grade. (The prior grade is retained in `GradeChangeLog`
`old→new`, for the transcript.)

**Attempt limits.** Default is **one recovery attempt**: the subject stays
`RECOVERY_REQUIRED` until a `RECOVERY`-sourced result exists; if that result still
fails, the subject becomes terminal `FAILED` (`completedAt` stamped). If it
passes, the subject becomes `PASSED` (`completedAt` stamped). Multi-round recovery
(`policy.maxRetakes > 1`) is a documented future extension — it needs an attempt
count (`AssessmentRetake` / `RECOVERY` change-log rows), which the single canonical
row per component does not track.

**Audit.** Recovery transitions emit dedicated audit actions on
`StudentSubjectProgress`: `student_subject_progress.recovery_required` (entry),
`student_subject_progress.recovered` (→ PASSED),
`student_subject_progress.failed_after_recovery` (→ FAILED). The recovery grade
itself is audited via `assessment_retake.graded` and a `GradeChangeLog` with
`source = RECOVERY`.

**Transcript.** The original grade (from `GradeChangeLog`), the recovery grade
(`sourceType = RECOVERY`), the effective grade and the strategy are all available;
the original failing grade is not hidden.

### Publication vs calculation

Publication (`AssessmentPublication`) controls **student visibility of
scheduled-exam results only**; it never blocks calculation. Progression always
derives from the canonical grades regardless of publication state. Continuous
grades have no publication gate.

### Normalization

All normalization and final-grade calculation go through the single
`GradeCalculationService`. The legacy `assessments/services/grade-calculator.service.ts`
was **removed**.
