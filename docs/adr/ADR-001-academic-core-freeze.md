# ADR-001 — Academic Core Architecture Freeze v1.0

- **Status:** Accepted
- **Date:** 2026-07-07
- **Freeze Version:** v1.0

> **Related documents**
> - [Academic Core — System Design & Architecture](../academic-core-architecture.md) (the frozen architecture; see its *Academic Core Status* freeze banner)
> - [Grade Engine](../grade-engine.md)
> - [Attendance Engine](../attendance-engine.md)
> - [Academic Progression (Subject Eligibility + Level Progression)](../academic-progression.md)
> - [Course Completion Engine](../course-completion-engine.md)
> - [Academic Transcript Engine](../academic-transcript-engine.md)

---

## Context

The platform now has a set of mature academic engines that together own the full
academic lifecycle — from grading a single assessment component to producing an official,
immutable academic record:

- **Grade Engine** — owns component grades and subject final grade/status.
- **Recovery Lifecycle** — the `RECOVERY_REQUIRED → recovered / failed-after-recovery` path, expressed within the grade cascade.
- **Attendance Engine** — owns attendance percentages/status and their gated academic impact.
- **Subject Eligibility Engine** — owns prerequisite/eligibility decisions.
- **Level Progression Engine** — owns level pass/fail/eligibility and promotion.
- **Course Completion Engine** — owns course status and stable `completedAt`.
- **Academic Transcript Engine** — owns official, versioned, immutable snapshots (Phase 5 lifecycle closed).

These engines share one architecture: a single source of truth per academic concept,
downward-only dependencies, transition-only events, transactional cascades, append-only
history, and snapshot-over-recalculation for official records.

## Problem

As the platform grows, future modules (certificates, diplomas, portals, exports, public
verification, analytics) will be tempted to **bypass the Academic Core** and recalculate
grades, attendance, progression, completion, or transcript data directly from raw inputs.
Any such duplication produces a second implementation of an academic rule that will drift
from the owner, yielding divergent answers to the same question and undermining
auditability and the legal integrity of official records.

## Decision

**Freeze the Academic Core Architecture at v1.0.**

The architecture described in [academic-core-architecture.md](../academic-core-architecture.md)
is closed. The following rules are binding:

- **The Academic Core owns all academic decisions.** Consumers copy Core outputs; they never recompute them.
- **Grade Engine owns grades.** Nothing else computes `finalGrade` or subject grade/status.
- **Attendance Engine owns attendance interpretation.** It measures attendance and, only when enforcement is enabled, feeds the grade cascade through a defined seam — it never computes grades.
- **Progression Engine owns progression.** Subject eligibility and level progression/promotion are decided only there.
- **Course Completion Engine owns course completion.** Course status and `completedAt` are decided only there.
- **Transcript Engine owns official snapshots.** It snapshots Core outputs and never recalculates academic state.
- **Certificate and Diploma engines must consume the Transcript,** not the Grade or Attendance engines directly. The official record is always read through the immutable, versioned snapshot.
- **Portals must consume approved read models and official snapshots** (issued Transcript versions), never live calculation inputs, and must respect published-grade masking and visibility flags.
- **No duplicated academic calculations.** One implementation of each derivation, in its owner.
- **Any structural change to the Academic Core requires a new ADR.**

## Consequences

### Positive

- **Stable architecture** — a fixed, well-understood contract for every downstream module.
- **Fewer duplicated rules** — one owner per academic concept; no drifting second implementations.
- **Easier onboarding** — a single authoritative mental model, backed by the freeze banner and Status Matrix.
- **Safer certificate/diploma implementation** — they build on immutable, versioned snapshots rather than volatile live state.
- **Stronger auditability** — append-only history and single-source-of-truth make every academic decision reconstructable and defensible.

### Negative

- **Changes require more discipline** — a structural change is a governed decision (a new ADR), not a quick edit.
- **Quick shortcuts are forbidden** — reaching past the Core to recompute a value is a design defect, even when convenient.
- **Some features must wait for the proper engine output** — a downstream capability that needs data the Core does not yet expose must wait for the Core to expose it (via a new ADR), rather than recompute it locally.

## Review

This ADR must be revisited **only** if:

- a new academic engine is introduced;
- a source-of-truth changes;
- a downstream module needs a capability not exposed by the Core;
- regulation requires a different official record model.

Any such revision is recorded as a **new ADR** that supersedes or amends this one; this
document is not edited in place once Accepted.
