# ADR-005 — Snapshot Immutability

- **Status:** Accepted
- **Date:** 2026-07-09
- **Scope:** Certificate Engine
- **Refines:** [ADR-002](./ADR-002-certificate-engine-architecture.md) (D-1)

## Context

A certificate is a legal attestation about a moment in time. The academic record it
certifies (the transcript) can later be superseded, revoked, or corrected; policies
and templates change. A certificate must reflect the world **as it was when issued**,
not as it is now.

## Problem

If a certificate re-reads live data (transcript, policy, template, student/course
identity) at render or verification time, its content silently changes when the
upstream changes — destroying the legal integrity of an already-issued document and
making the same certificate render differently over time.

## Decision

**A certificate freezes its inputs and never mutates them after issue.**

- **Transcript by pointer, not FK.** `Certificate.transcriptVersionId` is a `String`
  pointer (no Prisma relation) plus copied `transcriptNumber` and
  `transcriptChecksum`. The certificate survives supersession/deletion of the
  transcript and never follows its updates automatically.
- **Frozen JSON snapshots at generation.** `studentSnapshot`, `courseSnapshot`, and
  `issueBasisSnapshot` (which embeds the eligibility result, policy, course-progress
  snapshot, and finance clearance) are copied verbatim at generate time and never
  rewritten.
- **Content checksum computed once, at issue.** `Certificate.checksum` is set during
  `IssueCertificateCommand` and never recomputed on any later read, render, or verify.
- **Finance clearance is a snapshot, not a live check.**
  `financialClearanceStatus`/`CheckedAt`/`Reference` are frozen at generation.
- **Correction = new certificate.** There is no in-place edit and no certificate-
  internal versioning; a mistake is fixed by issuing a new certificate (D-1).

## Consequences

**Positive.** A certificate is reproducible and defensible for years; the same inputs
always render the same document; the checksum is a stable tamper-evidence anchor;
downstream (PDF, ministry, public verify) build on a stable contract.

**Negative.** Storage cost of duplicated snapshots; a "fix" always means a new
certificate rather than an edit; a stale snapshot is intentional, not a bug — see
[ADR-009 (STALE)](./ADR-009-stale-reactive-model.md) for how divergence is surfaced.

## Enforcement

Repository guards forbid the certificate models from relating to
`AcademicTranscriptVersion` (pointer only). Lifecycle commands mutate only status/
number/checksum/verification and issue-time metadata — never the frozen snapshot
columns (issue command header + review checklist).

## Review

Revisit only if regulation requires certificate-internal versioning or a mutable
official record model — a new ADR superseding this one and ADR-002.
