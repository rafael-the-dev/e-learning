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

`RECOVERY_REQUIRED` is mapped to `FAILED` when writing to `StudentSubjectProgress`.

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
   └─ GradeMutationService.handleGradeMutation
        ├─ createGradeChangeLog        (immutable audit of value/status change)
        └─ recalculateSubjectProgressCascade
             └─ StudentSubjectProgress
                  └─ recalculateStudentLevelProgress → StudentLevelProgress
                       └─ evaluateCourseCompletion   → StudentCourseProgress
```

`recalculateSubjectProgressCascade` (`services/subject-progress-cascade.service.ts`)
is the **single, always-cascading** recalculation path. It reads only the
canonical `StudentAssessmentResult` rows (`CANCELLED` results are excluded, so an
invalidated/cancelled grade correctly drops out of the calculation). Batch
recalculation (`RecalculateSubjectGradesCommand`) and scheduled-exam grading
(`bulk-grade`) use this same path — there is no non-cascading variant.

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

### Publication vs calculation

Publication (`AssessmentPublication`) controls **student visibility of
scheduled-exam results only**; it never blocks calculation. Progression always
derives from the canonical grades regardless of publication state. Continuous
grades have no publication gate.

### Normalization

All normalization and final-grade calculation go through the single
`GradeCalculationService`. The legacy `assessments/services/grade-calculator.service.ts`
was **removed**.
