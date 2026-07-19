# ADR-018 — Teacher Examination Portal Product Freeze

- **Status:** **Accepted** · Portal **frozen v1.0.0** · Lifecycle **Maintenance** (2026-07-19)
- **Date:** 2026-07-19
- **Scope:** Teacher Examination Portal (`/teacher/examinations`)
- **Builds on:** [ADR-017](./ADR-017-assignment-scoped-teacher-execution.md) (assignment-
  scoped teacher execution — the enabling engine hardening), [ADR-013](./ADR-013-examination-engine.md)
  (Examination Engine), [ADR-015](./ADR-015-examination-portal-freeze.md) (admin portal
  freeze), [ADR-016](./ADR-016-student-examination-portal-freeze.md) (student portal freeze).

> **Related:** [Architecture & Product Closure v1.0.0](../teacher-examination-portal-v1.0-closure.md),
> [Release Notes](../releases/teacher-examination-portal-v1.0.0.md).

## Context

The Examination Engine is frozen (ADR-013); the admin (ADR-015) and student (ADR-016)
portals are frozen. The third portal on the same engine is the **teacher/examiner
operational surface**: a teacher runs their assigned sessions — attendance → results →
submission — without the admin portal. A Phase-0 investigation confirmed the engine had
**deferred** teacher assignment-scoped writes; ADR-017 implemented that as additive
hardening (a new permission + an in-transaction assignment+role gate). This ADR records
the portal decisions and freezes it.

## Decisions

### 1. An independent, teacher-scoped module

- **Context.** The teacher view could reuse admin/student read services/DTOs, but admin
  DTOs carry lifecycle `allowedActions` and reviewer/approver internals a teacher must
  never see, and the student module is a different bounded experience.
- **Decision.** A self-contained `src/modules/teacher-examinations` with its own DTOs,
  repository, and service; no import of admin `types/portal.ts`, admin read services, or
  the student module.
- **Consequences.** The three portals evolve independently; no cross-leak of contracts.

### 2. Visibility & write authority derive ONLY from explicit assignment

- **Context.** "Teaches the subject/class" is too broad and would leak unassigned sessions.
- **Decision.** Every read is filtered by `organizationId` AND `invigilators.some.teacherId`;
  every write is authorized by the hardened command's in-tx assignment+role gate. `teacherId`
  is resolved server-side, never from the URL/input.
- **Consequences.** IDOR-safe by construction; a teacher never sees or acts on a session
  they are not assigned to.

### 3. The engine command is the write authority — endpoints are thin shells

- **Context.** Duplicating authorization in the endpoint/UI risks drift and holes.
- **Decision.** Teacher endpoints delegate to the ADR-017-hardened Mark/Correct/Create/
  Update/Submit (+ bulk) commands, which re-check org + active assignment + authorizing role
  **inside the mutation transaction**. The endpoint adds no authorization and accepts no
  `teacherId`/`reviewerId`/`approverId`/`markerId`.
- **Consequences.** One authorization path for both this portal and the admin endpoints;
  no check-then-mutate window; capability flags in the UI are hints only.

### 4. The teacher write ceiling is `SUBMITTED`

- **Context.** Separation of duties: the marker is not the reviewer/approver/publisher.
- **Decision.** The teacher can create → update-draft → submit. No review/approve/publish/
  integrate/appeals/operations is exposed, and TEACHER holds none of those permissions.
- **Consequences.** The official downstream (review → approve → publish → integrate) stays
  with the secretariat/admin; the engine's authorship + marker≠reviewer≠approver separation
  is preserved.

### 5. Portal-own capabilities, engine-faithful semantics

- **Context.** The UI needs to gate actions and explain blocks without admin `allowedActions`,
  and must not invent domain rules.
- **Decision.** Capabilities are derived in the service from `role + session state +
  candidate/attendance/result state + engine rules`, with per-block reasons. The
  attendance→result relationship follows the engine exactly (reuses `resultCodeForAttendance`):
  PRESENT/LATE→SCORED (numeric), ABSENT/EXCUSED→code-only, DISQUALIFIED→code+reason; the code
  is derived from attendance, never a free choice; **no PASSED/FAILED**.
- **Consequences.** The UI never presents a guarantee the domain can't back; the command
  remains the final authority (capability flags are advisory).

### 6. Fail-closed, no DTO leakage

- **Decision.** A non-assigned/missing/other-org session returns null → `notFound()` (404),
  never a 403/500 that leaks existence. Teacher DTOs never expose reviewer/approver/publisher
  ids, `decisionReason`, `markerId`, audit, integration payloads, admin `allowedActions`, or
  the raw eligibility snapshot.

## Consequences (overall)

**Positive.** A safe, isolated, engine-faithful teacher portal: assignment-scoped and
IDOR-safe, command-enforced writes, fail-closed, ceiling at `SUBMITTED`, zero further engine
change. It completes the exam ecosystem (admin + student + teacher, all frozen).

**Negative.** Some read logic is re-expressed rather than shared (accepted for isolation).
A11y and a few UX polish items are deferred to v1.1 (documented; non-blocking).

## Freeze decision

UX Audit Overall **8.4/10**, **0 Critical / 0 High**, verdict **GO**. The before-freeze UX
fixes (filtered-list empty state, `aria-current`, search `aria-label`) are applied. Security
Review passed. **Teacher Examination Portal is frozen at v1.0.0 · Production Ready ·
Maintenance.** The Examination Engine is unchanged after ADR-017.

## Backlog (v1.1) & Review

v1.1: back-link filter preservation, dialog descriptions, badge theme-tokens/dark-mode,
role-blocked scaffold hiding, dormant-label cleanup, keyboard shortcuts, tablet/mobile
polish, autosave, export/printable attendance, granular loading, browser-back nav, analytics.

Revisit this ADR if: teachers must gain any downstream authority (review/approve/publish —
a separation-of-duties change); the assignment model changes (e.g. a separate examiner
entity, or `ExamInvigilatorAssignment` gains soft-delete); or the engine contract changes.
Any such change is a new ADR — this document is not edited in place once Accepted.
