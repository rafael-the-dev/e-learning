# ADR-006 — Outbox Pattern for Post-Commit Event Delivery

- **Status:** Accepted
- **Date:** 2026-07-09
- **Scope:** Certificate Engine (Phase 14)
- **Refines:** [ADR-002](./ADR-002-certificate-engine-architecture.md)

## Context

Certificate mutations must emit domain events (issued, revoked, suspended, restored,
exported, marked_stale) for downstream consumers and audit. Events must not be
emitted for work that rolled back, and a delivery failure must not roll back a
committed mutation.

## Problem

Publishing an event inside the transaction couples delivery to commit (an event can
be emitted for a transaction that later aborts, or a publish failure can abort a
valid mutation). Publishing directly from each command — `for (const e of events)
await eventPublisher.publish(e)` — scatters the delivery concern across many call
sites, with no place to record, retry, or inspect a failed delivery.

## Decision

**All certificate domain events are published after commit, through a single Outbox
seam.**

- The flow is: command commits its transaction → `certificateOutbox.dispatch(events)`
  → `enqueue()` each event → `publish()` once.
- `CertificateOutboxService` is a process-wide singleton (`certificateOutbox`). It is
  the **only** component in the module that references `eventPublisher`.
- Delivery is via an injectable `deliver` fn (default `eventPublisher.publish`, which
  itself never throws). `dispatch()`/`publish()` **never throw** — a delivery error is
  captured, never propagated to the caller.
- **Retry policy** is pure (`retry-policy.ts`): max 3 retries, exponential backoff
  `1000 · 2^(retryCount-1)` ms. No scheduler/timer — re-drive happens on the next
  `publish()`/`retry()`.
- **Dead letter:** an entry that exhausts its budget becomes `FAILED`, stays
  queryable, and is never auto-deleted.
- There are **exactly 8 publish-after-commit sites** — 7 commands + the
  `CertificateTranscriptStalenessHandler` — and all route through the Outbox.

**Persistence is deliberately deferred.** v1's Outbox is in-memory/single-process.
The API (`enqueue`/`publish`/`retry`/`list*`/`mark*`/`dispatch`) is designed so a
future table + worker can back it **without changing callers**.

## Consequences

**Positive.** One place owns delivery, retry, and dead-lettering; committed mutations
never depend on delivery success; events are inspectable operationally (see the
operations runbook).

**Negative (v1).** In-memory means a crash between commit and delivery loses the
event, and dead-letter entries are lost on restart. Mitigated by best-effort delivery
(the publisher never throws) and idempotent, reprocessable events. Outbox counts are
per-process, not cluster-wide. Removing this limitation is the top future item
([ADR-002 review triggers]; operations runbook §17).

## Enforcement

`operational-architecture-guards.test.ts` asserts only the Outbox references
`eventPublisher`; the read services never do. Commands are reviewed to dispatch only
after commit.

## Review

Revisit when durability is required (persistent Outbox / distributed queue). The
public API must be preserved so the change is transparent to callers.
