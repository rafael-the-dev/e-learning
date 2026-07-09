# ADR-011 — Single Issue Command (allocation once, at issue)

- **Status:** Accepted
- **Date:** 2026-07-09
- **Scope:** Certificate Engine (Phase 5)
- **Refines:** [ADR-002](./ADR-002-certificate-engine-architecture.md) (D-2, D-7)

## Context

Issuing is the moment a draft becomes an official certificate. Three identity/
integrity artifacts are created at that moment: the human-facing certificate number,
the content checksum, and the public verification projection.

## Problem

If number allocation, checksum computation, or verification-row creation happened at
generation, on demand, or across multiple code paths, numbers could be reassigned or
skipped, a checksum could drift on re-read, and duplicate/inconsistent verification
rows could appear — under concurrency these become correctness bugs in a legal record.

## Decision

**There is exactly one issue command, and it performs the irreversible allocations
once, atomically, only on the DRAFT/PENDING_APPROVAL → ISSUED transition.**

- **`IssueCertificateCommand` is the sole issue path.** It runs in one transaction and
  uses a conditional write so two concurrent issues cannot both succeed.
- **Number allocated once, never reassigned.** `CERT-YYYY-NNNNNN` from a single
  per-(org, year) counter (`CertificateNumberCounter`), allocated on first issue only;
  an already-numbered certificate keeps its number (D-2).
- **Content checksum computed once.** Set at issue from the frozen snapshots and never
  recomputed on any later read/render/verify (D-7, [ADR-005](./ADR-005-snapshot-immutability.md)).
- **Verification projection created at issue.** The 1:1 `CertificateVerification`
  (VALID) is created in the same transaction; the verification code is generated (or a
  pre-existing one kept).
- **Issue validates state, not eligibility.** It does not re-run the eligibility engine
  ([ADR-003](./ADR-003-single-eligibility-engine.md), Rule C-5); it checks the issue
  state and re-confirms the pinned transcript is still ISSUED with an unchanged checksum
  via the ACL. A `PENDING_APPROVAL` certificate additionally requires a recorded
  approval provenance (a `certificate.approved` `CertificateEvent`), written by
  `ApproveCertificateCommand` (authority `certificates.generate`) — the sole writer of
  that event. Approval records provenance only; it is not a status transition.
- **Event after commit.** `certificate.issued` publishes via the Outbox after commit.

## Consequences

**Positive.** Numbering/checksum/verification are correct under concurrency and never
drift; the issue transition is the single, auditable birth of an official certificate.

**Negative.** The approval-provenance gate couples issue to the approval flow: a
`PENDING_APPROVAL` certificate is issuable only after `ApproveCertificateCommand`
records the `certificate.approved` event. This coupling must be kept consistent — if a
future change stops recording that event, manual-approval certificates become
un-issuable again.

## Enforcement

Conditional-write + `count === 1` assertion in the transition; repository guards keep
numbering/checksum out of the repositories; the issue command is the only caller of the
number allocator.

## Review

Revisit if a cryptographic signature replaces/augments the content checksum, or if the
numbering scheme changes (each a new ADR amending D-2/D-7).
