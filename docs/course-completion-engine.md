# Course Completion Engine

Derives a student's **course-level** outcome (`StudentCourseProgress`) from their
per-level progress. It is the top of the academic cascade:

```
Grade mutation
  → StudentAssessmentResult (canonical grades)
  → StudentSubjectProgress
  → StudentLevelProgress
  → CourseCompletionEngine        ← this document
      → StudentCourseProgress
      → domain events
```

## Design principles

- **Derives only from `StudentLevelProgress`.** Never reads grades directly.
- **Never mutates grades.** Read-only over the level layer.
- **Never touches the `Enrollment` lifecycle.** Marking an enrollment `COMPLETED`
  is a separate, explicit `CompleteEnrollmentCommand` decision.
- **Single writer.** All persistence goes through `persistCourseCompletion`, used
  by both the async wrapper and the transactional promotion path, so `completedAt`
  semantics and the transition signal can never diverge.

## Architecture

```
CourseCompletionEngine        (IO, persistence, logging, events)
        │
        ▼
CourseCompletionStrategy      (the decision: status / grade / reason / completed)
        │
        ▼
CourseCompletionPolicy        (configuration + which strategy / grade mode)
        │
        ▼
CourseFinalGradePolicy        (grade rollup mode: how level grades combine)
        │
        ▼
StudentCourseProgress         (persisted projection)
        │
        ▼
Domain events                 (student_course.completed / .reopened / …)
```

Files:

- `src/modules/prerequisites/engines/course-completion.strategy.ts` — strategy,
  policy, grade policy, reasons, level-status classification.
- `src/modules/prerequisites/engines/course-completion.engine.ts` — IO wrapper
  (`evaluateCourseCompletion`), single writer (`persistCourseCompletion`),
  side-effect emitter (`emitCourseCompletionSideEffects`), structured log.
- `src/modules/prerequisites/services/review-progression-request.service.ts` —
  transactional path (`recalculateCourseProgressTx`) reusing the same helpers.

## Completion strategy

`CourseCompletionStrategy.decide({ courseLevels, levelProgress, policy })` returns
the `CourseCompletionDecision`. Only **STANDARD** is implemented; it reproduces the
historical rules exactly.

| Strategy name        | Status  | Notes |
|----------------------|---------|-------|
| `STANDARD`           | ✅ live | All active levels must be done. |
| `CREDIT_BASED`       | future  | Complete once enough credits earned. |
| `COMPETENCY_BASED`   | future  | Complete once competencies met. |
| `MANUAL_APPROVAL`    | future  | Requires an explicit human completion step. |

Unimplemented strategies throw from `getCourseCompletionStrategy` — they are never
silently downgraded.

### STANDARD rules

A course is `COMPLETED` only when **every** active level is `PASSED`, `PROMOTED`,
or `COMPLETED`. Otherwise:

| Condition                                             | Course status | `completionReason` |
|-------------------------------------------------------|---------------|--------------------|
| No levels / no progress                               | `NOT_STARTED` | `NOT_STARTED` |
| All levels done                                       | `COMPLETED`   | `ALL_LEVELS_COMPLETED` |
| A `FAILED` level and nothing in progress              | `FAILED`      | `FAILED_REQUIRED_LEVEL` |
| Any `RECOVERY_REQUIRED` level (unresolved)            | `RECOVERY_REQUIRED` | `PENDING_RECOVERY` |
| Any `ELIGIBLE_TO_PROGRESS` / `PROMOTED_WITH_PENDING_SUBJECTS` | `IN_PROGRESS` | `PENDING_MANUAL_APPROVAL` |
| Otherwise in progress / not started levels            | `IN_PROGRESS` | `LEVEL_IN_PROGRESS` |
| Unknown/unmapped level status                         | `IN_PROGRESS` | `LEVEL_IN_PROGRESS` (fail-safe: never auto-completes) |

A pending recovery **dominates**: `RECOVERY_REQUIRED` is evaluated before the
`FAILED` rule, so a course with both a recovering level and a failed level stays
`RECOVERY_REQUIRED` (never definitively `FAILED`) until recovery is resolved or
exhausted. See the *Recovery Lifecycle* in [`grade-engine.md`](./grade-engine.md).

`completionReason` is **derived, not persisted** (current scope). It is surfaced on
the in-memory decision, structured logs, and domain-event payloads for dashboards
and debugging. Reserved reasons `PENDING_ATTENDANCE`, `PENDING_FINANCIAL_CLEARANCE`,
`PENDING_CERTIFICATE_REQUIREMENTS` are declared but never produced yet — they
activate when their policy gates and owning services exist.

## Final-grade policy

`computeCourseFinalGrade(graded, mode)` — only graded levels contribute.

| Mode                  | Status  | Behaviour |
|-----------------------|---------|-----------|
| `SIMPLE_AVERAGE`      | ✅      | Unweighted mean of level grades. |
| `WEIGHTED_BY_HOURS`   | ✅ **default** | Weight by level `totalHours` when every graded level has one; else simple-mean fallback. |
| `WEIGHTED_BY_CREDITS` | future  | Needs `CourseLevel.credits` (not modelled yet). |
| `BEST_LEVEL`          | future  | Best level grade. |
| `CUSTOM`              | future  | Institution-defined. |

The default (`WEIGHTED_BY_HOURS`) matches the pre-refactor behaviour. Unimplemented
modes throw rather than silently changing the grade.

> **TODO** — `CourseLevel` exposes `totalHours` but not `credits`; wire
> `WEIGHTED_BY_CREDITS` once credits are modelled, and consider a per-level
> `LevelSubject` workload sum as an additional fallback.

## Completion policy

`CourseCompletionPolicy` centralises configuration. Current defaults preserve
behaviour: `STANDARD` strategy, `WEIGHTED_BY_HOURS` grade, **all requirement gates
off**. The requirement gates are accepted but **not enforced** yet (documented
stubs) until their owning services exist:

> **Attendance vs `requireAttendance` (Phase 5 clarification).** Attendance
> Engine Phase 5 gates attendance at the **subject** level (a low-attendance
> subject becomes `INCOMPLETE`, which keeps its level `IN_PROGRESS` and therefore
> keeps the course out of `COMPLETED` — never `FAILED` solely from it). That is a
> *derived* effect through level status and needs **no** course-level gate. The
> `requireAttendance` gate below is a **separate, still-inactive** course-level
> clearance check (§13.8 of the domain doc) — a later, distinct product decision.

| Gate | Owning service (future) |
|------|-------------------------|
| `requireAttendance` | AttendanceEngine (course-level clearance; still off — distinct from Phase 5 subject gating) |
| `requireFinancialClearance` | FinancialEligibilityService |
| `requireInternship` | Internship module |
| `requirePracticalLessons` | Lessons module |
| `requireCertificateApproval` | Certificate module |
| `requireManualCompletion` | Manual completion workflow |

## Persistence & `completedAt`

`persistCourseCompletion` is the only writer. `completedAt` is **stable**:

- not completed → completed: stamp `now`
- stays completed: **preserve** the original `completedAt`
- completed → not completed: clear to `null`

It returns `{ progress, previousStatus, transitionedToCompleted, transition,
completionReason }` where `transition` is `COMPLETED` (entered), `REOPENED` (left),
or `null`.

## Domain events

Emitted **only on a status boundary crossing**, and **after** the owning DB
transaction commits (event-bus contract). Passive recalculations do not emit.

| Event | When |
|-------|------|
| `student_course.completed` | not-completed → `COMPLETED` |
| `student_course.reopened`  | `COMPLETED` → not-completed |
| `student_course.invalidated` | reserved — explicit annulment flow (not wired) |
| `student_course.restored`   | reserved — explicit reinstatement flow (not wired) |

An audit row (`course_completion.completed` / `course_completion.reopened`) is
written alongside each event, with `actorId = null` for system-driven cascades.
Future modules (certificates, alumni, CRM, analytics) subscribe to these events.

**Events represent transitions — recalculation is idempotent.** `COMPLETED →
COMPLETED` and any not-completed → not-completed recompute cross no boundary, so
they emit no event and write no audit (`transition = null`). Re-running the
completion evaluation any number of times therefore produces exactly one
`completed`/`reopened` entry per real crossing — no duplicate history for
downstream consumers (Timeline, Transcript, certificates). This mirrors the
subject cascade's transition gating (see grade-engine.md → "Events represent
transitions").

## Observability

Each evaluation logs a structured line via `logCourseCompletionEvaluation`:

```
[course-completion] evaluated {"enrollmentId","courseId","previousStatus",
  "newStatus","completionReason","transition","durationMs","evaluatedLevels"}
```

## Performance

A single evaluation issues a bounded set of reads — enrollment, active course
levels, level progress, and the existing course-progress row — plus one upsert.
There are **no per-level queries** (no N+1); level progress is fetched in one query
and aggregated in memory. The `findFirst` + `upsert` pair in the writer is retained
deliberately: the read supplies `previousStatus` (transition detection) and the
original `completedAt` (stability).

## Extension points (future, not yet implemented)

- **`CourseCompletionSnapshot`** — an immutable record written when a course
  becomes `COMPLETED`, so reports don't depend on the mutable progress table.
- **`CourseCompletionHistory`** — append-only status transitions
  (`previousStatus`, `newStatus`, `changedAt`, `changedBy`, `reason`) for reopen /
  invalidate / restore flows.
- Persisting `completionReason` on `StudentCourseProgress`.
- New strategies and grade modes per the tables above.

Each of these requires a schema migration and is intentionally out of the current
(code-architecture-only) scope.
```
