# ADR-009 — STALE Reactive Model

- **Status:** Accepted
- **Date:** 2026-07-09
- **Scope:** Certificate Engine (Phase 9)
- **Refines:** [ADR-002](./ADR-002-certificate-engine-architecture.md) (D-4), builds on [ADR-005](./ADR-005-snapshot-immutability.md)

## Context

A certificate freezes the transcript it certifies ([ADR-005](./ADR-005-snapshot-immutability.md)).
The transcript can later be superseded, revoked, or marked stale by the upstream
engine. The certificate must react to that — but without silently changing its
frozen content.

## Problem

Two wrong extremes: (a) silently regenerate/re-issue the certificate when the
transcript changes — destroying immutability and auditability; or (b) ignore the
change — leaving a certificate that verifies as VALID while the record beneath it no
longer holds. Neither is acceptable for a legal document.

## Decision

**Transcript invalidation makes a certificate STALE via an explicit, audited,
reactive act — never a silent mutation.**

- **Reactive, event-driven.** `CertificateTranscriptStalenessHandler` subscribes to
  the transcript lifecycle events (`TRANSCRIPT_SUPERSEDED` / `_REVOKED` /
  `_MARKED_STALE`) and, for each affected certificate, applies the policy's
  `staleAction`.
- **Policy decides the action.** `CertificatePolicy.staleAction` ∈
  `{ MARK_STALE (default), SUSPEND, REVOKE }`. STALE is non-terminal and recoverable
  (restore is allowed only against a still-valid transcript); REVOKE is terminal.
- **Frozen content is untouched.** Only lifecycle metadata changes
  (`status`, `staleDetectedAt`, `staleReason`) plus the public projection
  (`publicStatus → SUSPENDED`). The snapshots and checksum are never rewritten.
- **The reaction is audited and event-emitting.** The transition writes a
  `CertificateEvent` and emits `certificate.marked_stale` — through the Outbox, after
  commit ([ADR-006](./ADR-006-outbox-pattern.md)).
- **Manual reconciliation exists.** `ReconcileCertificateStalenessCommand` (dry-run by
  default) backfills STALE when a reactive event was missed. It reads **no** transcript
  table — the caller supplies the stale reason — so the ACL boundary holds.
- **The reaction reads no academics.** It acts on the certificate's pinned pointer and
  the policy only.

## Consequences

**Positive.** Divergence between a certificate and its record is always visible,
audited, and reversible per policy; immutability is preserved; public verification
reflects the hold immediately.

**Negative.** In v1 the Outbox is in-memory, so a missed reactive event relies on the
manual reconcile command as backstop ([ADR-006](./ADR-006-outbox-pattern.md) negative
consequences). STALE is a status an operator must monitor (operations runbook).

## Enforcement

The handler is registered in `src/server/events/registry.ts` and matches only
transcript events; guards forbid it (and the reconcile command) from reading Academic
Core, and require publish via the Outbox.

## Review

Revisit if the set of stale reasons/actions changes, or if durable delivery removes
the need for the manual reconcile backstop.
