# ADR-016 — Student Examination Portal Freeze

- **Status:** **Accepted** · Portal **frozen v1.0.1** · Lifecycle **Maintenance** (2026-07-18)
- **Date:** 2026-07-18
- **Scope:** Student Examination Portal (the student-facing `/student/examinations` module)
- **Builds on:** [ADR-013](./ADR-013-examination-engine.md) (Examination Engine design
  freeze), [ADR-015](./ADR-015-examination-portal-freeze.md) (Admin portal freeze),
  [ADR-007](./ADR-007-read-write-separation.md) (read/write separation).

> **Naming note.** This record fulfils the Phase 3 "ADR-STUDENT-EXAM-001" deliverable,
> named `ADR-016` to keep the repository's single numeric ADR sequence (ADR-013 = engine,
> ADR-015 = admin portal, ADR-016 = student portal). Content is unaffected by the number.

> **Related:** [Architecture & Product Closure v1.0.1](../student-examination-portal-v1.0-closure.md),
> [Release Notes](../releases/student-examination-portal-v1.0.1.md).

## Context

The Examination Engine is frozen (ADR-013) and the Administration Portal is frozen at
v1.1.0 (ADR-015). The next portal on the same engine is the **student** experience: a
student should be able to see upcoming exams, exam details/eligibility, published
results, file/track/withdraw appeals, and browse history — **without contacting the
secretariat** — with strict per-student data isolation. This ADR records the decisions
that shaped the student portal and freezes it at v1.0.1, so future maintainers (and the
upcoming Teacher/Guardian portals) understand why it is shaped this way.

## Decisions

Each decision: **Context · Decision · Consequences · Alternatives considered.**

### 1. An independent module, not a feature of the admin portal

- **Context.** The student view could reuse the admin read services/DTOs. But admin DTOs
  carry lifecycle `allowedActions`, marker/reviewer/approver internals, and org-wide
  shapes that a student must never see.
- **Decision.** Build a self-contained module (`src/modules/student-examinations`) with
  its own privacy-safe DTOs, its own student-scoped repository, and its own service. No
  import of `types/portal.ts` or `services/admin/*`.
- **Consequences.** The student and admin experiences evolve independently; there is no
  risk of an admin-shaped field leaking into the student surface. Some read logic is
  re-expressed (accepted for isolation and safety).
- **Alternatives.** Reuse admin read services with a student filter — rejected: one
  forgotten field leaks admin internals; the coupling would freeze the two portals
  together.

### 2. studentId is resolved server-side, always; reads are IDOR-safe by construction

- **Context.** A student portal's central risk is a student reading another student's
  exams/results/appeals (IDOR).
- **Decision.** `studentId` is **always** resolved from the session
  (`getStudentByUserId(orgId, userId)`), never from the URL/query. Every repository read
  is filtered by `organizationId` AND `studentId` AND the `resourceId` — a non-owned id
  simply doesn't match.
- **Consequences.** Ownership is a where-clause guarantee, not a post-check that can be
  forgotten. Verified by tests (a non-owned result/appeal returns null).
- **Alternatives.** Resolve the resource then compare ownership in code — rejected: a
  missed comparison is a breach; scoping the query fails closed instead.

### 3. Published-only masking; fail closed to notFound()

- **Context.** Only PUBLISHED results may be visible to a student, and a
  missing/non-owned/unpublished resource must not leak its existence.
- **Decision.** The result-detail read pins `status = "PUBLISHED"`; list/history results
  are masked in the service. Any missing/non-owned/unpublished resource returns `null`,
  and the page calls `notFound()` (404) — never a 403 or 500 for a resource read.
- **Consequences.** A student cannot tell "exists but not yours" from "doesn't exist";
  no draft/under-review result is ever shown. (Mutation endpoints legitimately return
  403/409/422 — that is a separate, correct path and leaks no content.)
- **Alternatives.** Return 403 for non-owned reads — rejected: it confirms existence and
  is a worse student experience than a clean 404.

### 4. Reuse the frozen appeal commands via thin student endpoints

- **Context.** Appeals are the only student mutations. The engine already has
  `CreateExamAppealCommand` / `WithdrawExamAppealCommand` that resolve the acting student
  and enforce ownership + PUBLISHED + single-active-appeal + PENDING-only.
- **Decision.** Add two student-scoped API routes (`POST
  /api/student/examinations/results/[resultId]/appeals` and
  `…/appeals/[appealId]/withdraw`) that are thin shells over those commands and return a
  student-facing DTO. No new domain command, no engine change.
- **Consequences.** The engine stays frozen; all appeal invariants are enforced in one
  place. The UI calls only `/api/student/*` — no admin/teacher/organization endpoint is
  reused.
- **Alternatives.** A new student-specific appeal command — rejected: duplicates domain
  rules and reopens the frozen engine.

### 5. Engine-faithful semantics — invent nothing the domain doesn't own

- **Context.** The initial spec assumed a per-exam pass/fail `outcome`, an appeal
  deadline, and a separate appeal "description" field. The frozen engine owns none of
  these (ADR-013 D13: exam outcome is not pass/fail; the appeal has a single `reason`;
  there is no appeal window).
- **Decision.** Show percentage + result code (no pass/fail); the real create-block is
  duplicate/not-published (no deadline); a single free-text "Motivo do recurso"; and
  `publicComment` is reserved-null (internal `remarks` is never exposed).
- **Consequences.** The portal never presents a guarantee the domain can't back. If a
  pass/fail policy or an Exam Policy domain is later introduced, it is a new engine
  decision (new ADR), not a portal convenience.
- **Alternatives.** Derive pass/fail from a portal-side threshold — rejected: invents
  policy the domain disavows and risks telling a student they "passed" when the domain
  makes no such claim.

## Consequences (overall)

**Positive.** A safe, isolated, engine-faithful student portal: IDOR-safe by
construction, published-only, fail-closed, no admin internals, zero engine change. It
establishes the `/student/<submodule>` pattern and the reuse template for the upcoming
Teacher and Guardian exam portals.

**Negative.** Some read logic is re-expressed rather than shared with the admin portal
(accepted for isolation). Engine-faithfulness means the UI omits conveniences (pass/fail,
deadlines) some users may expect until the domain supports them.

## Review

Revisit if: the engine introduces pass/fail or an Exam Policy domain (would change the
result/detail surfaces); an appeal window is added (would change the create-capability);
or Teacher/Guardian portals need shared student read infrastructure. Any such change is a
new ADR — this document is not edited in place once Accepted.
