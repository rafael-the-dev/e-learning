# ADR-002 — Certificate Engine Architecture Freeze v1.0

- **Status:** Accepted
- **Date:** 2026-07-07
- **Freeze Version:** v1.0
- **Supersedes / amends:** none (builds on [ADR-001](./ADR-001-academic-core-freeze.md))

> **Related documents**
> - [ADR-001 — Academic Core Architecture Freeze v1.0](./ADR-001-academic-core-freeze.md) (the frozen upstream)
> - [Certificate Engine — Domain Model & Architecture](../certificate-engine.md) (the frozen design; see its *Certificate Engine Status* freeze banner)
> - [Academic Transcript Engine](../academic-transcript-engine.md) (the immediate source of truth)
> - [Academic Core — System Design & Architecture](../academic-core-architecture.md)

---

## Context

The platform's academic lifecycle is owned end-to-end by the **Academic Core**, frozen
at v1.0 by [ADR-001](./ADR-001-academic-core-freeze.md). Its final, official output is
the **Academic Transcript Engine** — immutable, versioned, checksummed snapshots of
academic outcomes (Phase 5 lifecycle closed).

The platform now needs an **official certificate issuance layer**: course-completion,
level-completion, participation, attendance, achievement, professional-training,
driving-school, language, IT and design certificates. These are legal/official
documents that must be numbered, verifiable, revocable, and defensible for years.

ADR-001 already anticipated this layer and made one rule binding:

> *"Certificate and Diploma engines must consume the Transcript, not the Grade or
> Attendance engines directly. The official record is always read through the
> immutable, versioned snapshot."*

The Certificate Engine domain model has been fully designed
([certificate-engine.md](../certificate-engine.md)) and all open architectural
decisions have been closed (D-1 … D-8). This ADR freezes that architecture before
Phase 0 so implementation cannot silently drift from it.

## Problem

A certificate layer is strongly tempted to **recompute academic truth** — re-check
whether every subject passed, recompute course completion, re-derive attendance — or
to **fold non-academic concerns into the academic record** (e.g. push financial
clearance into the Transcript or Grade Engine). Either move creates a second,
drifting implementation of a rule that already has an owner, undermining
auditability and the legal integrity of issued certificates.

A certificate must also not **silently follow** the record it certifies: if a
transcript is later superseded or revoked, an already-issued certificate cannot
mutate its content or its verification status without an explicit, audited act.

## Decision

**Freeze the Certificate Engine Architecture at v1.0**, as described in
[certificate-engine.md](../certificate-engine.md). The following rules are binding:

- **The Certificate Engine consumes the Transcript, never Academic Core raw tables.**
  All academic facts are read from an **issued** `AcademicTranscriptVersion` snapshot.
  It never reads the Grade or Attendance engines, `StudentAssessmentResult`,
  `StudentSubjectProgress`, `StudentLevelProgress`, raw attendance, or
  `StudentCourseProgress` directly. *(Rule C-1.)*
- **The Certificate Engine never recalculates academic facts.** It never computes a
  final grade, subject status, level status, course completion, attendance
  percentage, or eligibility by re-running academic rules. It reads frozen facts and
  applies certificate-policy gates.
- **Administrative facts are evaluated externally and snapshot into the Certificate.**
  Financial clearance, manual approval, and template selection are **not** academic
  facts. They are evaluated at eligibility/generation time (finance read-model,
  approver identity, template registry) and **frozen onto the certificate**
  (`financialClearanceStatus`/`financialClearanceCheckedAt`/`financialClearanceReference`).
  Finance must never enter the Academic Core, Grade Engine, or Transcript Engine.
  *(Rule C-2 / D-3.)*
- **A certificate is immutable after issue.** It pins one `transcriptVersionId` +
  `transcriptChecksum`; a correction is a **new** certificate (no certificate-internal
  versioning). *(D-1.)*
- **A certificate never silently follows transcript updates.** When the linked
  transcript version is superseded/revoked, the certificate is marked `STALE`
  (default) or `SUSPENDED`/`REVOKED` per policy — never silently regenerated, never
  silently re-issued. *(D-4.)*
- **Lifecycle is fixed:** `DRAFT → PENDING_APPROVAL → ISSUED`, then `SUSPENDED`/`STALE`
  (recoverable to `ISSUED` only against a still-valid transcript) or `REVOKED`
  (terminal). **Expiry affects verification only** — `Certificate.status` stays
  `ISSUED`; the verification projection becomes `EXPIRED`. *(D-6.)*
- **Numbering `CERT-YYYY-NNNNNN`**, one shared per-(org, year) counter, allocated only
  on issue, never reassigned — mirroring the Transcript Engine. *(D-2.)*
- **Content-only checksum, generated once on issue, never recomputed.** A
  cryptographic digital signature is a future phase. *(D-7.)*
- **Public verification is minimal and privacy-safe** — it never exposes transcript
  detail, grades, subjects, attendance, ids, or checksums; it is rate-limited and
  resistant to enumeration.
- **Any structural change to this engine requires a new ADR.**

## Consequences

### Positive

- **Legal integrity** — certificates certify an immutable, versioned, checksummed
  record; they cannot drift from it.
- **Single source of truth preserved** — academics stay in the Core/Transcript;
  administrative facts are cleanly separated and snapshot, not recomputed.
- **Defensible audit trail** — append-only events + audit for every certificate act;
  revoked/suspended/stale certificates remain fully auditable (never deleted).
- **Safe downstream consumption** — Student Portal, Guardian Portal, Public
  Verification, PDF Export and Ministry Export build on a stable, frozen contract.
- **No duplicated academic rules** — the freeze forbids reaching past the Transcript.

### Negative

- **Discipline over convenience** — reaching past the Transcript to recompute a value
  is a design defect, even when convenient.
- **Reissue instead of edit** — a correction requires a new transcript version and a
  new certificate; there is no in-place edit of an issued certificate.
- **Capabilities wait for the Core** — a certificate feature needing data the
  Transcript does not expose must wait for the Core to expose it (via a new ADR),
  rather than recompute it locally.

## Review

This ADR must be revisited **only** if:

- regulation requires certificate-internal versioning, a different numbering scheme,
  or a different official record model;
- a downstream consumer needs a certificate capability not expressible on the frozen
  model;
- the upstream source of truth (Transcript/Academic Core) changes in a way that
  affects certificate issuance;
- a cryptographic signature / tamper-evidence requirement is introduced.

Any such revision is recorded as a **new ADR** that supersedes or amends this one;
this document is not edited in place once Accepted.
