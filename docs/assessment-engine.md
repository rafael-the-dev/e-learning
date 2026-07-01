# Assessment Engine

## Overview

The Assessment Engine evaluates student academic performance per `LevelSubject` — the intersection of a subject within a course level. It supports weighted and simple average calculation, retakes, result publication with domain event emission, and automatic student timeline updates.

---

## Architecture

```
src/modules/assessments/
  types/index.ts              — domain types, status constants, display labels
  schemas/assessment.schema.ts — Zod validation for all 20 commands
  repositories/               — DB access (8 files, one per aggregate)
  commands/                   — 20 BaseCommand implementations
  actions/assessment.actions.ts — "use server" wrappers
  components/                 — React client components (tables, drawers, forms)
```

---

## Data Model

### AssessmentPolicy
Defines the evaluation rules for one `LevelSubject`. Only one ACTIVE policy per LevelSubject is allowed.

| Field | Description |
|---|---|
| levelSubjectId | The LevelSubject this policy governs |
| calculationMethod | `WEIGHTED_AVERAGE` or `SIMPLE_AVERAGE` |
| roundingMethod | `NONE`, `ROUND`, `CEIL`, `FLOOR` |
| minimumPassingGrade | Grade (0–100) required to pass |
| allowRetake | Whether retakes are permitted |
| maxRetakes | Maximum retake attempts |

### AssessmentComponent
A named evaluation component within a policy (e.g., "Teste 1", "Trabalho Final").

| Field | Description |
|---|---|
| componentType | `TEST`, `QUIZ`, `EXAM`, `ASSIGNMENT`, `PROJECT`, `ORAL`, `PRACTICAL`, `PARTICIPATION`, `FINAL_EXAM`, `OTHER` |
| weight | Weight for WEIGHTED_AVERAGE (sum across active components must ≤ 100) |
| isRequired | If true, missing this component blocks passing |
| maxScore | Maximum raw score for assessments using this component |

### AssessmentPeriod
A named time window (e.g., "1.º Trimestre 2025", code `T1-2025`). Code is unique per organization.

### Assessment
One concrete evaluation event.

| Field | Description |
|---|---|
| assessmentPolicyId | The governing policy |
| assessmentComponentId | Which component this fulfils |
| assessmentPeriodId | The period this belongs to |
| classGroupId, teacherId | Who sits the assessment |
| maxScore | Raw maximum score |
| status | `DRAFT → SCHEDULED → OPEN → GRADED → ARCHIVED` or `CANCELLED` |

> `courseId`, `courseLevelId`, `subjectId`, `levelSubjectId` are plain String fields (no Prisma relation), following the same pattern as `AttendanceSession`.

### AssessmentResult
One student's result for one Assessment. Created automatically when grading.

Statuses: `PENDING → GRADED`, or `MISSING`, `EXCUSED`, `INVALIDATED`.

### AssessmentPublication
Records when an Assessment's results were published. Created by `PublishAssessmentResults` command.

### StudentSubjectProgress
Aggregated per-student, per-LevelSubject outcome. Recalculated via `RecalculateStudentSubjectProgress` command.

Statuses: `NOT_STARTED`, `IN_PROGRESS`, `PASSED`, `FAILED`, `INCOMPLETE`, `BLOCKED`.

Uniqueness: `@@unique([enrollmentId, levelSubjectId])` — upserted on recalculation.

### AssessmentRetake
A student's request to retake a failed/missing assessment. Requires policy `allowRetake = true`.

Flow: `REQUESTED → APPROVED → GRADED` or `REJECTED`.

---

## Grade Calculation

`GradeCalculationService` (`@/modules/grades/services/grade-calculation.service`,
singleton `gradeCalculationService`) computes `StudentSubjectProgress.finalGrade`
from the canonical `StudentAssessmentResult` rows. It is the **single** calculator;
the former `assessments/services/grade-calculator.service.ts` was removed.

> Grades are single-sourced in `StudentAssessmentResult`. `AssessmentResult` is a
> participation/event sidecar only (its `score`/`normalizedScore` are deprecated and
> unused). Grading, invalidation and retakes all funnel through
> `GradeMutationService` → `recalculateSubjectProgressCascade`. See
> [grade-engine.md](./grade-engine.md) → *Single Source of Truth & Grade Mutation Flow*.

### Normalized Score
```
normalizedScore = (rawScore / maxScore) * 100
```

### WEIGHTED_AVERAGE
```
finalGrade = Σ(normalizedScore × weight) / Σ(weight)
             for all components that have a result
```

### SIMPLE_AVERAGE
```
finalGrade = mean(all normalizedScores)
```

### Passing Logic
A student **passes** if ALL of:
1. `finalGrade >= minimumPassingGrade`
2. `attendancePercentage >= minimumAttendancePercentage` (if set)
3. All required components (`isRequired = true`) have a non-null score

Otherwise the status is:
- `INCOMPLETE` — required components not yet graded
- `BLOCKED` — required component missing after all assessments graded
- `FAILED` — all graded but below minimum

---

## Commands

| Command | Permission Required |
|---|---|
| CreateAssessmentPolicy | `assessmentPolicies.create` |
| UpdateAssessmentPolicy | `assessmentPolicies.update` |
| ArchiveAssessmentPolicy | `assessmentPolicies.archive` |
| CreateAssessmentComponent | `assessmentComponents.manage` |
| UpdateAssessmentComponent | `assessmentComponents.manage` |
| ArchiveAssessmentComponent | `assessmentComponents.manage` |
| CreateAssessmentPeriod | `assessmentPeriods.create` |
| UpdateAssessmentPeriod | `assessmentPeriods.update` |
| ArchiveAssessmentPeriod | `assessmentPeriods.archive` |
| CreateAssessment | `assessments.create` |
| UpdateAssessment | `assessments.update` |
| CancelAssessment | `assessments.cancel` |
| BulkGradeAssessment | `assessmentResults.grade` |
| InvalidateAssessmentResult | `assessmentResults.invalidate` |
| PublishAssessmentResults | `assessmentPublications.publish` |
| CreateAssessmentRetake | `assessments.create` |
| ApproveAssessmentRetake | `assessments.update` |
| GradeAssessmentRetake | `assessmentResults.grade` |
| RecalculateStudentSubjectProgress | `assessmentResults.grade` |

All commands follow `validate() → authorize() → execute()`. `organizationId` is always sourced from `requireOrganization()` — never from client input.

---

## Domain Events

| Event | Trigger | Handler |
|---|---|---|
| `assessment.results_published` | `PublishAssessmentResults` | Timeline entry + notification per student |
| `student_subject.passed` | `RecalculateStudentSubjectProgress` (PASSED) | Timeline entry + notification |
| `student_subject.failed` | `RecalculateStudentSubjectProgress` (FAILED) | Timeline entry only |

All timeline entries are idempotent via `(sourceEventId, timelineEventType)` uniqueness.

---

## RBAC

| Role | Capabilities |
|---|---|
| ORG_ADMIN | Full access (inherits all permissions) |
| SECRETARY | View-only: policies, periods, assessments, results, progress |
| TEACHER | Create/update assessments, grade results, publish, view progress |
| STUDENT | View published results and own subject progress |

---

## UI Routes

| Route | Description |
|---|---|
| `/assessment-policies` | List and manage assessment policies |
| `/assessment-periods` | List and manage assessment periods |
| `/assessments` | List all assessments with status filters |
| `/assessments/new` | Create a new assessment |
| `/assessments/[id]` | Assessment detail with results list |
| `/assessments/[id]/grade` | Bulk grade entry for enrolled students |
| `/student-progress` | All students' subject progress with recalculate |

---

## Tenant Isolation

Every repository query and command filters by `organizationId` from `requireOrganization()`. No route, action, or component ever accepts `organizationId` from client input.

---

## Key Invariants

- Only one ACTIVE `AssessmentPolicy` per `LevelSubject` at a time
- WEIGHTED_AVERAGE component weights must sum ≤ 100
- An Assessment cannot be cancelled once it has status `GRADED`
- Retakes require `policy.allowRetake = true` and `attemptNumber <= maxRetakes`
- A graded retake writes back a `RECOVERY` `StudentAssessmentResult` (effective grade
  chosen by `GradeResolutionEngine`, default `BEST_SCORE`) and cascades — never a dead-end
- Invalidating a result cancels the canonical `StudentAssessmentResult` and cascades
- `StudentAssessmentResult` is the single source of truth for grades; all progression
  derives from it through the one cascading path (`recalculateSubjectProgressCascade`)
- Grade calculation is deterministic and side-effect free (pure service)
