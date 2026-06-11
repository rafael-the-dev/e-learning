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
| `CalculateStudentSubjectProgressCommand` | `grades.calculate` |
| `RecalculateSubjectGradesCommand` | `grades.calculate` |

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

`CalculateStudentSubjectProgressCommand` emits:

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
