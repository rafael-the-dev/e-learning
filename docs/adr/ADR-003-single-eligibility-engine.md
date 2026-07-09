# ADR-003 — Single Eligibility Engine

- **Status:** Accepted
- **Date:** 2026-07-09
- **Scope:** Certificate Engine
- **Refines:** [ADR-002](./ADR-002-certificate-engine-architecture.md) (formalizes Rules C-3…C-6 as a standalone record)

> One of the Certificate Engine v1.0 decision records. See also
> [ADR-004 (ACL)](./ADR-004-transcript-acl.md),
> [ADR-011 (single issue command)](./ADR-011-single-issue-command.md),
> [ADR-012 (lifecycle)](./ADR-012-certificate-lifecycle.md).

## Context

Whether a certificate may be generated/issued depends on several facts: the linked
transcript must be ISSUED, required subjects must not be pending, the policy gates
(course completed, no pending subjects, financial clearance, manual approval) must
be satisfied. These checks are tempting to sprinkle across commands, routes, jobs
and bulk operations.

## Problem

If eligibility is decided in more than one place, the implementations drift. A
bulk-generate path and a single-generate path can disagree; a future integration can
apply a subtly different rule; a change to one gate silently misses another caller.
Eligibility is exactly the kind of rule that must have a single owner, because it
gates the legal act of issuing an official document.

## Decision

**All eligibility is decided by one pure function** —
`evaluateCertificateEligibility` in
`services/certificate-eligibility.engine.ts`.

- **C-3 — single authority.** The engine is the only place that decides whether a
  certificate may be generated or issued.
- **C-4 — one read dependency.** It evaluates only `CertificateEligibilityFacts`
  assembled by `CertificateEligibilitySource` (which reads transcript facts through
  the ACL, the policy, and the finance flag). The engine itself reads nothing.
- **C-5 — commands execute, never decide.** Commands (and any job/API/integration)
  load facts, call the engine, and branch **only** on its result. They never inline a
  gate check.
- **C-6 — deterministic.** Same facts → same result. No clock, randomness, DB,
  repository, external call, or mutable global inside the engine. Time-/external-
  dependent inputs (e.g. `evaluatedAt`, finance status) are carried in the facts.

The result is `{ eligible, blockingReasons[], warnings[], requiresApproval,
evaluatedPolicyId, evaluatedAt }`. `eligible === (blockingReasons.length === 0)`;
warnings never block.

## Consequences

**Positive.** One testable, table-driven decision surface; identical behaviour across
single and bulk paths; adding a gate is one change in one file; the decision is
reproducible and auditable (the result is frozen into `issueBasisSnapshot`).

**Negative.** Every new fact the decision needs must be threaded through
`CertificateEligibilityFacts` and loaded by the source — you cannot "just query it"
inside the engine. This is intentional friction that preserves determinism.

## Enforcement

Guard tests forbid eligibility logic outside the engine and forbid the engine from
importing repositories/DB. A command that re-decides eligibility inline is a review
reject.

## Review

Revisit only if a decision point genuinely cannot be expressed as a pure function of
facts (e.g. requires streaming/iterative external calls). Any such change is a new
ADR that supersedes this one.
