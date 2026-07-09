# Certificate Engine — Release Notes v1.0.0

- **Release:** v1.0.0
- **Date:** 2026-07-09
- **Scope:** Certificate Engine (`src/modules/certificates/**` + `src/app/api/**/certificates/**` + the transcript-staleness reaction). Architecture **FROZEN** — see [ADR-002](../adr/ADR-002-certificate-engine-architecture.md).
- **Downstream of:** Academic Transcript Engine (ADR-002) and Academic Core (ADR-001), both frozen.

The Certificate Engine issues, verifies, exports, and manages the lifecycle of
official academic certificates. It certifies **frozen** transcript facts and never
recalculates academics.

---

## Highlights

Feature-complete across phases 0–14:

| Area | Delivered |
|------|-----------|
| Foundation & data model | 8 Prisma models, const-object vocabularies, numbering, content checksum |
| Eligibility | Single pure engine (Rules C-3…C-6) fed by one read-aggregation source via the Transcript ACL |
| Lifecycle | Generate → (Approve) → Issue → Suspend/Restore/Revoke, + reactive STALE |
| Verification | Public, unauthenticated, privacy-safe, rate-limited, enumeration-resistant |
| Export | PDF (adapter-driven) + authenticated download; ministry payload (JSON/CSV/XML, local transport) |
| Portals | Admin/secretary + student read models; certificate-request workflow |
| Bulk | Sequential orchestration of the single-item commands (one tx per item) |
| Operational hardening | In-memory Outbox (retry + dead-letter), health / maintenance / metrics read models |

**Surface:** 20 commands · 31 HTTP routes (admin/student/public/operational) · 11
permissions · 8 post-commit publish sites (all through the Outbox).

Full detail: [architecture](../certificate-engine-v1-architecture.md) ·
[API manual](../certificate-engine-api.md) ·
[operations runbook](../certificate-engine-operations.md) ·
[developer guide](../certificate-engine-developer-guide.md) ·
[closure/handoff](../certificate-engine-v1-closure.md).

---

## Changes in this release (release-candidate hardening)

**Fix**
- **Manual-approval certificates are now issuable.** A certificate generated under a
  policy with `requiresManualApproval: true` (`PENDING_APPROVAL`) previously could not
  be issued — the issue gate required a `certificate.approved` event that nothing ever
  wrote. Added `ApproveCertificateCommand` (authority `certificates.generate`) and
  `POST /api/certificates/:id/approve` as the sole writer of that approval-provenance
  event. Approval records provenance only (no status change, no bus event; idempotent).

**Refactor / performance (no behaviour change)**
- Consolidated the duplicated frozen-snapshot readers (parse / student-name /
  course-name) into one shared `lib/certificate-snapshot.ts`.
- Lean `certificateListSelect` for `listCertificates`: paginated portal lists no longer
  transfer the large frozen JSON blobs they discard (detail reads unchanged).
- Removed dead code (`findCertificateVerificationById`, unused `FinancialClearanceSnapshot`)
  and de-duplicated the list pagination constants.

**Documentation**
- Four new reference guides (architecture, API, operations, developer) + closure refresh.
- Ten new ADRs (003–012) capturing every v1.0 architectural decision.

---

## Architecture guarantees (frozen)

Certifies frozen facts (never recalculates academics) · transcript pinned by pointer
(not FK) · snapshots immutable, content checksum computed once at issue · Command
pattern with one transaction + conditional writes · events published after commit only
through the Outbox · repositories the only Prisma layer, always org-scoped · operational
layer read-only except the Outbox. Rationale per decision: [ADR-003…ADR-012](../adr/).

---

## Known limitations (deferred beyond v1.0)

- **Outbox is in-memory / single-process** — a crash between commit and delivery can lose
  an event; dead-letter entries do not survive a restart. API is designed for a drop-in
  persistent backing.
- **Ministry export does not transmit** — it builds and stores a payload via a local stub.
- **Expiry is inert** — `validityMonths → expiresAt` is not wired, so no certificate
  expires yet and the `EXPIRED` public status never appears organically.
- **Public rate limiter is per-process** — not distributed.
- **Guardian access & request-workflow payment** — deferred.
- **Bulk is sequential/synchronous** — no queues/parallelism.

Deferred cleanups noted by the RC review (non-blocking): removal of ~8 test-only
repository helpers (kept intentionally as tested API surface; they account for the
72–80% line coverage on some repositories) and two `(organizationId, createdAt)` indexes
for the metrics/list scans (require a migration).

---

## Validation at release

- `pnpm exec tsc --noEmit` — 0 errors
- `pnpm test` (vitest) — Certificate Engine scope **722/722 green** (53 files). Full repo
  suite 3167/3168; the single failure is a **pre-existing, unrelated** teacher-portal
  deadline-ordering test (`findTeacherUpcomingDeadlines`), not touched by this release.
- `pnpm lint` — 0 problems
- Coverage (certificate scope): statements 88.79%, functions 95.68%; Outbox 100%,
  retry policy 100%, operational/read services 98–100%

**No schema or migration change in this release.** Upgrading requires no data migration.

---

## Compatibility

Requires the frozen Academic Transcript Engine and Academic Core. Any structural change
to this engine requires a new ADR superseding [ADR-002](../adr/ADR-002-certificate-engine-architecture.md).
