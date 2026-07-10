# ADR-014 — Exam → Grade Component Binding (Phase 11B)

- **Status:** **Accepted** (after implementation validation)
- **Date:** 2026-07-10
- **Scope:** Examination Engine ↔ Grade Engine integration boundary (E-13)
- **Builds on:** [ADR-013](./ADR-013-examination-engine.md) (Examination Engine),
  [ADR-001](./ADR-001-academic-core-freeze.md) (Academic Core). Activates the
  write-gated integration scaffold delivered in Phase 11.

> **Related:** [Examination Engine — Domain Design](../examination-engine.md) §Phase 11 / 11B.

## Context

Phase 11 delivered the complete, one-way anti-corruption integration boundary that pushes an
official **PUBLISHED** exam result into the Grade Engine (the single grade writer, E-13) and
lets the Grade mutation cascade into the Progression Engine (the single progression owner). It
shipped **write-gated** because two structural links did not exist:

1. **No canonical grade target.** An `ExamResult` / `ExamSession` keys on `levelSubjectId`, but
   the Grade Engine keys a grade on `assessmentComponentId`. There was no mapping from an exam
   to the assessment component its score feeds.
2. **No `EXAMINATION` grade source.** `GRADE_CHANGE_SOURCE` had no value representing an
   examination-originated grade write.

The Phase 11 doc note recorded a **hard prohibition**: the gap must never be "solved" by a
heuristic (first `EXAM` component / highest weight / last component / name inference), because
that would make the Examination Engine decide a Grade-domain fact and break E-13.

## Decision

**The canonical grade target is explicitly configured, never inferred.**

1. **Binding model (chosen over `ExamSession.assessmentComponentId`).** A new
   `ExamGradeComponentBinding` model records, per session, which `assessmentComponentId` its
   results integrate into. Rationale for the model over a nullable column on `ExamSession`:
   - **Rebindable + provenance:** a binding is created/archived with an actor + audit trail;
     a bare column mutated in place loses history.
   - **Soft-delete + one-active invariant:** `deletedAt` + a filtered-unique index give
     "at most one active binding per session" while preserving archived bindings.
   - **Future multi-component mappings** (e.g. an exam feeding more than one component) extend
     the model without a further `ExamSession` migration.
   Only one design is implemented (the binding model); the column alternative is rejected.

2. **String-pointer references (ADR-013 bounded-context convention).** `assessmentComponentId`
   and `createdById` are **plain columns with no foreign key** — the exam schema does not
   hard-couple to Grade / User internals; the bind command validates the component against the
   real `AssessmentComponent` (and its `AssessmentPolicy.levelSubjectId`) at write time. Only
   `organizationId` and `examSessionId` are real `NoAction` FKs. This mirrors how `ExamResult`
   references `studentId` / `enrollmentId` / `levelSubjectId` as pointers.

3. **`GRADE_CHANGE_SOURCE.EXAMINATION`** is added (additive; all existing sources unchanged),
   so the canonical Grade mutation service accepts an examination-originated write. Grade-side
   idempotency remains the natural-key upsert `(enrollmentId, assessmentComponentId)`; the
   Examination side additionally tracks `officialVersion` staleness via the append-only
   ExamEvent ledger (Phase 11). No `sourceId` / `sourceVersion` columns are added to the Grade
   Engine — that would be a Grade redesign, out of scope.

4. **No heuristic fallback — ever.** The resolver returns the bound component or a typed
   `EXAM_RESULT_INTEGRATION_UNSUPPORTED`. It must never inspect component name, weight, order,
   or type. This prohibition is normative and repeated in `production-ports.ts` and the engine
   doc.

## Ownership (unchanged)

| Concern | Owner |
|---|---|
| Which component an exam feeds | Examination (explicit binding only) |
| Grade calculation, weighting, normalization, pass/fail, grade persistence | **Grade Engine** |
| Progression recalculation | **Progression Engine** (cascaded by the Grade mutation) |
| Transcript / Certificate | Their own engines, downstream, never written by Examination |

## Supported outcome matrix

| Exam `resultCode` | Grade integration |
|---|---|
| `SCORED` | **Supported** — score + maxScore written via the canonical Grade mutation once the session is bound. |
| `ABSENT` | **Unsupported** — the canonical `StudentAssessmentResult` cannot represent a non-numeric outcome (only a deprecated participation sidecar can). → `EXAM_RESULT_INTEGRATION_UNSUPPORTED`. |
| `EXCUSED` | **Unsupported** (no explicit Grade contract). |
| `DISQUALIFIED` | **Unsupported** (no Grade representation). |

A non-scored outcome is **never** converted to score `0`.

## Consequences

- A SCORED result of a bound session integrates end-to-end; unbound → `EXAM_RESULT_INTEGRATION_UNSUPPORTED`.
- A binding **cannot be changed or archived once any result of the session has been integrated**
  (`EXAM_GRADE_BINDING_ALREADY_CONSUMED`), and a consumed publication cannot be retracted
  (`PUBLICATION_ALREADY_CONSUMED`, Phase 11) — an integrated result never silently moves component.
- Reconciliation (Phase 11) still repairs a revised `officialVersion` through the same canonical
  Grade path; the revision → grade → progression → transcript → certificate chain is unchanged.
- Non-scored outcome support remains a future decision requiring an explicit Grade Engine contract.

## Review triggers

Revisit this ADR if: the Grade Engine gains a first-class non-scored/absence outcome; an exam
must feed multiple components; or a formal integrated-result migration/rebind workflow is needed.
