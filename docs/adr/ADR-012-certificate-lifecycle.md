# ADR-012 — Certificate Lifecycle

- **Status:** Accepted
- **Date:** 2026-07-09
- **Scope:** Certificate Engine (Phases 5–9)
- **Refines:** [ADR-002](./ADR-002-certificate-engine-architecture.md) (D-4, D-6)

## Context

An official certificate moves through well-defined states from creation to a terminal
or held state. Downstream (portals, public verification, operations) depend on those
states being fixed and their transitions being audited.

## Problem

An ad-hoc or implicit lifecycle invites illegal transitions (e.g. reviving a revoked
certificate), status decided in multiple places, and public verification drifting from
the real status. For a legal record the state machine must be explicit, guarded, and
audited.

## Decision

**A fixed state machine, each transition its own guarded, audited command.**

```
DRAFT ─┬─────────────▶ ISSUED ─┬─▶ SUSPENDED ──▶ ISSUED   (restore, transcript still valid)
       │  (issue)              ├─▶ STALE       ──▶ ISSUED   (restore, transcript still valid)
PENDING_APPROVAL ─(issue,      └─▶ REVOKED               (terminal)
        approval recorded)
```

- **States:** `DRAFT`, `PENDING_APPROVAL`, `ISSUED`, `SUSPENDED`, `STALE`, `REVOKED`.
- **Transitions are commands with conditional writes** (`WHERE status = expected`,
  assert `count === 1`) — race-safe; each writes a `CertificateEvent` in-transaction
  and emits its domain event via the Outbox after commit:
  - Issue: DRAFT/PENDING_APPROVAL → ISSUED ([ADR-011](./ADR-011-single-issue-command.md)).
  - Suspend: ISSUED → SUSPENDED (recoverable). Restore: SUSPENDED → ISSUED.
  - Stale: ISSUED → STALE/SUSPENDED/REVOKED per policy, reactively
    ([ADR-009](./ADR-009-stale-reactive-model.md)); STALE is recoverable to ISSUED only
    against a still-valid transcript.
  - Revoke: ISSUED/SUSPENDED → REVOKED (**terminal**; a correction is a new certificate,
    [ADR-005](./ADR-005-snapshot-immutability.md)).
- **Restore is guarded by the transcript.** SUSPENDED/STALE → ISSUED is allowed only
  when the pinned transcript is still valid.
- **Expiry affects verification only (D-6).** `Certificate.status` stays `ISSUED`; the
  public projection becomes `EXPIRED`. Expiry is not a lifecycle transition.
- **Permissions:** issue/revoke/suspend each have their own permission; **restore
  reuses `certificates.suspend`**.
- **Public projection mirrors the lifecycle:** ISSUED→VALID|EXPIRED, SUSPENDED/STALE→
  SUSPENDED, REVOKED→REVOKED. The maintenance service detects drift against exactly this
  mapping (it defines no new rule).

## Consequences

**Positive.** Illegal transitions are impossible (conditional guards); every change is
audited and event-emitting; public status is a deterministic function of the lifecycle;
revoked/suspended/stale certificates remain fully auditable (never deleted).

**Negative.** No in-place correction — a mistake after issue means revoke + new
certificate. `PENDING_APPROVAL` → ISSUED requires `ApproveCertificateCommand` to have
recorded the approval provenance first (see
[ADR-011](./ADR-011-single-issue-command.md)).

## Enforcement

Conditional-write assertions per transition; repository guards forbid lifecycle helpers
in repositories (transitions live only in commands); the maintenance projection-mismatch
probe encodes the expected mapping.

## Review

Revisit if a new state/transition is required, if expiry must affect `status`, or if
regulation changes the terminal/recoverable semantics — a new ADR amending D-4/D-6.
