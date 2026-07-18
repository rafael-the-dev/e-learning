# ADR-015 — Examination Portal Freeze

- **Status:** **Accepted** · Portal **frozen v1.1.0** (2026-07-17)
- **Date:** 2026-07-17
- **Scope:** Examination Administration Portal (admin/secretary surface of the Examination Engine)
- **Builds on:** [ADR-013](./ADR-013-examination-engine.md) (Examination Engine design freeze),
  [ADR-014](./ADR-014-exam-grade-component-binding.md) (exam→grade-component binding),
  [ADR-007](./ADR-007-read-write-separation.md) (read/write separation),
  [ADR-009](./ADR-009-stale-reactive-model.md) (stale/reactive downstream).

> **Related:** [Architecture & Product Closure v1.1.0](../examination-portal-v1.1-closure.md),
> [Release Notes v1.1.0](../releases/examination-portal-v1.1.0.md). ADR-013/014 cover the
> Examination **Engine**; this record covers the **portal** layer and does not supersede them.

## Context

The Examination Engine was designed and frozen at v1.0 (ADR-013). The Administration Portal
was built on top of it (v1.0.0, 2026-07-11) and then hardened for scale and productivity
(Sprint 2.1) and audited three times for UX. UX Audit #3 (the gate) returned *YES WITH MINOR
UX DEBT* (Overall UX 7.4/10) with 0 Critical and, after the H1/H2 fixes, 0 High findings
open. The module is now being frozen at v1.1.0 for production and maintenance.

This ADR exists so that, 6–12 months from now, a maintainer can understand **why** the
portal is shaped the way it is — especially the decisions that look like omissions
("why is there no bulk integration?", "why is publish just a button behind a flag?") — and
can evolve it without re-litigating settled choices.

## Decisions

Each decision below follows: **Context · Decision · Consequences · Alternatives considered.**

### 1. Defer first-class Bulk Integration to v1.2

- **Context.** Integration pushes a PUBLISHED exam result into the Grade Engine (and cascades
  progression). It is typically run **after** publication and is not part of the main daily
  flow; it also has the highest blast radius of any exam action (it writes the gradebook).
  A per-session "Integrar todos" already exists; a cross-session, one-click bulk integrate
  does not.
- **Decision.** Ship per-result and per-session integrate/reconcile in v1.1; **defer**
  cross-session bulk integration to v1.2.
- **Consequences.** Reconciliation of many sessions is done session-by-session. This is
  slower for large end-of-term runs but keeps the freeze low-risk: the highest-impact write
  path is not scaled up right before a freeze.
- **Alternatives considered.** (a) Ship cross-session bulk integrate now — rejected: it
  couples the riskiest write to the freeze with the least soak time. (b) Auto-integrate on
  publish — rejected: integration must stay an explicit, separately-authorized
  (`exams.integrateResults`) step, distinct from the visibility boundary (publication).

### 2. Every action is gated by a server-computed `AllowedActionButton`

- **Context.** A workflow UI is tempted to compute "can I approve?" on the client by
  comparing a status string. That duplicates business rules in the frontend and drifts from
  the server.
- **Decision.** The UI never branches on a domain status to gate an action. It renders a
  **server-computed `allowedActions` flag** through a single component, `AllowedActionButton`,
  which turns the flag into a button → thin API call → typed-error toast. The backend command
  remains the sole authority: a rejected command is surfaced even if the button was enabled.
- **Consequences.** The frontend has no lifecycle logic to keep in sync; permission/lifecycle
  changes are made once, on the server. A static guard test fails the build if any component
  compares a status literal or imports a repository/`@/server/db`. Trade-off: a disabled
  button does not yet explain *why* (mitigated by adjacent blocker lists on the readiness
  cards; a tooltip reason is a v1.2 item).
- **Alternatives considered.** (a) Client-side status comparisons — rejected: re-derives
  rules, drifts, and is unguardable. (b) Hide-when-disallowed everywhere — rejected for
  workflow actions: "disabled + reason" is more learnable than an action that silently
  disappears (appeals use hide; readiness/integration use disable — see the v1.2 backlog to
  converge).

### 3. Permissions are computed on the server; the UI only reflects them

- **Context.** Multi-tenant RBAC must never be trusted from the client. The portal exposes
  ~50 routes across 22 `exams.*` permissions and strict separation of duties (marker ≠
  reviewer ≠ approver).
- **Decision.** Every page guards with `requirePermissionOrRedirect`; every API route and
  command re-authorizes server-side; org is resolved from the session, never from the URL.
  Separation-of-duties and result-actor ownership (appellant, marker, reviewer, approver) are
  enforced in the command layer and never taken from input.
- **Consequences.** Defence in depth: the UI showing or hiding a control is a convenience,
  never a security boundary. A missing permission check is a vulnerability, not a TODO.
- **Alternatives considered.** Trust the UI's gating / pass actor ids from the client —
  rejected outright (tenant isolation and audit integrity).

### 4. Value/label separation with one central registry

- **Context.** Enum values travel in URLs, query params, payloads, and DB columns; the UI
  must be PT-PT. Translating values breaks filtering and links; letting each component
  translate risks label drift between a badge and its filter.
- **Decision.** Domain values stay English everywhere; PT-PT happens only at render, via a
  single badge/label registry (`status-badges.tsx`) whose entries also produce the filter
  select options (`getStatusOptions`/`getStatusLabel`). Badge and filter labels are the same
  source, so they cannot drift.
- **Consequences.** Adding a state means adding one registry entry (label + variant) and it
  is instantly consistent across badges, tiles, and filters. This is exactly how the H2 fix
  (`FAILED` + progression states) was applied at freeze.
- **Alternatives considered.** Per-component translation maps — rejected (drift, duplication).

### 5. Read/write separation; the portal changes no engine behaviour

- **Context.** The engine is frozen (ADR-013). The portal must add a surface without
  changing engine behaviour, schema, or migrations.
- **Decision.** GET goes through batched, tenant-scoped read services + a pure DTO mapper
  (no N+1, privacy-safe DTOs); mutations go through the engine's existing commands. The
  portal added **zero** permissions and **zero** schema changes.
- **Consequences.** The portal can evolve independently of the engine; the engine's freeze
  is preserved. DTOs never expose `eligibilitySnapshot`, `ExamEvent.metadata`, `AuditLog`
  blobs, or Transcript/Certificate/Grade internals.
- **Alternatives considered.** Let pages read repositories directly — rejected (breaks the
  boundary and the guard test; couples UI to Prisma).

### 6. Publication confirms; integration and publication stay distinct, explicit steps

- **Context.** Publishing makes approved results visible to students/guardians — the most
  consequential, public transition. UX Audit #3 (H1) found it fired on a single unguarded
  click while its inverse (retract) required confirmation.
- **Decision.** Publish now requires a confirmation dialog (via the shared `confirm` mode of
  `AllowedActionButton`). Publication (visibility) and integration (gradebook write) remain
  **separate, separately-authorized** steps; neither auto-triggers the other.
- **Consequences.** Symmetric safety on the commit and its undo; the two most consequential
  writes each require an explicit, authorized action.
- **Alternatives considered.** Auto-publish-then-integrate — rejected (conflates two
  boundaries and two permissions). Keep publish unguarded — rejected (H1).

## Consequences (overall)

**Positive.** The portal is a thin, guardable surface over a frozen engine: no business
logic in the UI, no client-trusted RBAC, no label drift, no schema risk. The deliberately
deferred items (bulk integration, Outbox, notifications) keep the riskiest paths out of the
freeze. The module is production-ready with a clear, separated v1.2 backlog.

**Negative.** Some convenience is traded for discipline: cross-session integration is
manual; disabled buttons don't always explain themselves yet; two table/pagination
paradigms coexist pending convergence. These are tracked in the v1.2 backlog, not silently
accepted as final.

## Review

Revisit this ADR if: bulk cross-session integration is prioritized; an Outbox/notification
fan-out is added (would change §1 and the event model); teacher/student/guardian exam
portals are introduced (new RBAC surfaces); or the frozen engine contract (ADR-013/014)
changes. Any such change is a new ADR — this document is not edited in place once Accepted.
