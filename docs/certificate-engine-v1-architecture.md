# Certificate Engine v1.0 — Technical Architecture

> Audience: senior backend engineers.
> Scope: the **architecture** of `src/modules/certificates/**` (+ its API routes and
> the transcript-staleness reaction). This document does not restate business
> requirements — for the per-phase feature narrative see
> [`certificate-engine.md`](./certificate-engine.md); for the frozen decisions see
> [`adr/ADR-002-certificate-engine-architecture.md`](./adr/ADR-002-certificate-engine-architecture.md);
> for the handoff/closure summary see
> [`certificate-engine-v1-closure.md`](./certificate-engine-v1-closure.md).

---

## 1. Introduction

### Purpose

The Certificate Engine issues, verifies, exports and manages the lifecycle of
academic certificates. It is a **downstream consumer** of the Academic Transcript
Engine (ADR-002) and the Academic Core (ADR-001): it *certifies frozen academic
facts* — it never produces or recalculates them.

A certificate is a durable, verifiable attestation that, at a specific point in
time, an ISSUED transcript version satisfied a policy. Once issued it is
content-addressed by a checksum and independently verifiable through a public
code, and it survives any later change to the underlying transcript.

### Design goals

- **Correctness under concurrency.** Numbering, checksums and lifecycle
  transitions are safe under parallel callers (conditional writes, one
  transaction per mutation).
- **Auditability.** Every mutation records a `CertificateEvent` and emits a
  post-commit domain event through a single seam (the Outbox).
- **Immutability of what has been certified.** Issued facts are frozen snapshots;
  the transcript is pinned by pointer, not by foreign key.
- **Tenant isolation by construction.** Every persistence path is scoped by
  `organizationId`, always derived server-side.
- **Replaceability at the edges.** PDF rendering, artifact storage, ministry
  transport, and event delivery are behind interfaces/adapters so each can be
  swapped without touching domain logic.
- **Read/write separation.** Mutations go through commands; reads go through
  services. The operational layer is read-only except for the Outbox.

### Non-goals (explicitly out of v1.0)

- **Recalculating academics.** The engine never reads Grade / Attendance /
  StudentAssessmentResult / StudentSubject / LevelProgress / StudentCourseProgress
  live. It reads only the frozen transcript snapshot.
- **Durable/distributed messaging.** The Outbox is in-process and in-memory this
  version (see §12, §15).
- **Real ministry submission.** Ministry export builds and stores a payload; the
  transport is a local stub.
- **Distributed rate limiting.** The public-verification limiter is per-process.
- **UI.** The backend is UI-ready; pages are frontend work.
- **Expiry derivation.** `validityMonths → expiresAt` is not yet wired, so expiry
  is inert (behaviour-correct, but no certificate currently expires).

---

## 2. Architectural Principles

**Single source of truth.** Academic truth lives in the Transcript Engine.
Eligibility truth lives in one pure function (`evaluateCertificateEligibility`).
Public verification truth lives in the `CertificateVerification` projection. No
fact is computed in two places.

**Immutability.** At generation the engine copies display/issue snapshots
(`studentSnapshot`, `courseSnapshot`, `issueBasisSnapshot`, finance clearance
snapshot). At issue it computes the content `checksum` **once**. Neither is
recomputed afterwards. A certificate reflects the world as it was at issue, not as
it is now.

**Snapshot architecture.** The transcript is referenced by a **pointer**
(`Certificate.transcriptVersionId: String`, deliberately *not* a Prisma relation)
plus copied `transcriptNumber` / `transcriptChecksum`. The certificate therefore
survives transcript supersession or deletion and never silently follows a
transcript update — it can only become STALE (an explicit, observed transition).

**Tenant isolation.** Every query carries `organizationId` and uses
`findFirst` / `findMany` / `count` — never `findUnique(id)` on a global id — so one
tenant can never reach another's row by id alone. `organizationId` is always taken
from the authenticated context.

**Read/write separation.** `commands/` mutate; `services/` read. A read service
never writes to the DB and never touches the event publisher (enforced by static
guards). The one intentional exception is the Outbox, the single mutable seam of
the operational layer.

**ACL boundaries.** Exactly one file may read Transcript tables
(`certificate-transcript-source.repository.ts`); everything else consumes its
DTOs. The cross-engine boundary is a compile-and-test-enforced anti-corruption
layer.

**Post-commit events.** Domain events are published **after** the transaction
commits, and only through the Outbox. A failed delivery never rolls back a
committed mutation; a failed mutation never emits an event.

**No duplicated business rules.** Eligibility is decided once (the engine) and
executed by commands (never re-decided). Lifecycle→public-status mapping is
maintained by the lifecycle commands; the maintenance service only *mirrors* that
mapping to detect drift — it defines no new rule.

---

## 3. Module Map

```
src/modules/certificates/
├── constants.ts              Domain vocabularies (const objects + string-literal types):
│                             CertificateType, CertificateStatus, CertificateExportStatus,
│                             CertificateVerificationPublicStatus, StaleReason,
│                             eligibility blockers/warnings, request statuses.
├── index.ts                  Module barrel.
│
├── schemas/                  Zod v4 input contracts (validation layer).
│   └── certificate.schema.ts
│
├── types/                    Pure TypeScript contracts (no runtime). DTOs and params:
│   ├── index.ts                barrel
│   ├── repository.ts           repo param/return shapes
│   ├── transcript-source.ts    ACL DTOs (the transcript facts the engine consumes)
│   ├── eligibility-source.ts   eligibility facts + result
│   ├── export.ts               PDF renderer + storage adapter interfaces
│   ├── ministry.ts             ministry payload/format/transport contracts
│   ├── portal.ts               admin/student/portal read models
│   ├── public-verification.ts  privacy-safe public projection
│   ├── bulk.ts                 bulk command envelopes
│   └── operational.ts          Phase 14 read models + Outbox contracts
│
├── lib/                      Pure helpers (no I/O): checksum, certificate-number
│                             formatting, verification-code, verification-url, portal-http.
│
├── repositories/             The ONLY layer that imports Prisma. Org-scoped.
│   ├── certificate.repository.ts
│   ├── certificate-event.repository.ts
│   ├── certificate-export.repository.ts
│   ├── certificate-verification.repository.ts
│   ├── certificate-public-verification.repository.ts
│   ├── certificate-request.repository.ts
│   ├── certificate-policy.repository.ts
│   ├── certificate-template.repository.ts
│   ├── certificate-transcript-source.repository.ts   ← ACL (only transcript reader)
│   └── index.ts
│
├── services/                 Read side + pure domain logic (no mutations).
│   ├── certificate-eligibility-source.service.ts   facts aggregation (reads via ACL)
│   ├── certificate-eligibility.engine.ts           PURE decision function
│   ├── certificate-admin-read.service.ts           admin/secretary read models
│   ├── certificate-student-read.service.ts         student self-scoped reads
│   ├── certificate-portal.mapper.ts                row → portal DTO
│   ├── certificate-request-read.service.ts
│   ├── certificate-public-verification.service.ts  public projection + count bump
│   ├── certificate-expiry.service.ts               expiry sweep (currently inert)
│   ├── certificate-export-download.service.ts       authenticated artifact streaming
│   ├── certificate-bulk-preview.service.ts          batched pre-flight for bulk
│   ├── public-rate-limiter.ts                       per-process limiter
│   ├── certificate-health.service.ts     ┐
│   ├── certificate-maintenance.service.ts │  Phase 14 read-only operational services
│   ├── certificate-metrics.service.ts     │
│   ├── certificate-operational.service.ts ┘  (dashboard composer + outbox view)
│   └── index.ts
│
├── commands/                 The ONLY layer that mutates. BaseCommand pattern.
│   ├── generate-certificate.command.ts
│   ├── issue-certificate.command.ts
│   ├── approve-certificate.command.ts        records certificate.approved provenance
│   ├── revoke-certificate.command.ts
│   ├── suspend-certificate.command.ts
│   ├── restore-certificate.command.ts
│   ├── export-certificate.command.ts
│   ├── export-certificate-to-ministry.command.ts
│   ├── request-certificate.command.ts
│   ├── approve-certificate-request.command.ts
│   ├── reject-certificate-request.command.ts
│   ├── cancel-certificate-request.command.ts
│   ├── fulfill-certificate-request.command.ts
│   ├── reconcile-certificate-staleness.command.ts
│   ├── bulk-certificate.commands.ts                 bulk orchestrators
│   ├── certificate-lifecycle-shared.ts     ┐ shared internals (no new rules)
│   ├── certificate-staleness-shared.ts     │
│   ├── bulk-shared.ts                       ┘
│   └── index.ts
│
├── outbox/                   The single event-delivery seam (Phase 14).
│   ├── retry-policy.ts        pure: canRetry / retryDelayMs / nextRetryAt
│   ├── certificate-outbox.service.ts   in-memory queue + singleton `certificateOutbox`
│   └── index.ts
│
└── export/                   Infrastructure ADAPTERS (outside services/ on purpose).
    ├── certificate-pdf-renderer.ts          bytes only
    ├── certificate-export-storage.ts        persist bytes, hash, return URL
    ├── certificate-export-storage-reader.ts read bytes back for authenticated download
    ├── certificate-ministry-payload.ts      pure payload builder
    ├── certificate-ministry-formatters.ts   JSON / CSV / XML serializers
    ├── certificate-ministry-transport.ts    transport port (local stub in v1)
    ├── certificate-ministry-storage.ts      persist ministry payload
    └── index.ts

src/app/api/certificates/**        Admin/secretary + operational HTTP routes (thin).
src/app/api/student/certificates/** Student self-scoped routes.
src/app/api/public/certificates/**  Public verification (no auth).
src/server/events/handlers/certificate-transcript-staleness.handler.ts
                                    Reaction to transcript invalidation (uses Outbox).
```

Dependency direction is strictly one-way:

```
routes → commands/services → repositories → Prisma
                 ↘ (reads) ACL repository → Transcript tables
commands → outbox → eventPublisher
```

Routes never import repositories directly for the operational endpoints; services
never import commands; the ACL is never bypassed. All three are enforced by
architecture-guard tests (§9).

---

## 4. Domain Model

Eight Prisma models, all `organizationId`-scoped, all relations `onDelete/onUpdate
NoAction`, several unique constraints **filtered/partial and therefore
migration-only** (Prisma cannot express them).

### `Certificate` (aggregate root)

The central entity. Holds the transcript **pointer** + copied
`transcriptNumber`/`transcriptChecksum`; frozen snapshots (`studentSnapshot`,
`courseSnapshot`, `issueBasisSnapshot`); the finance-clearance snapshot; the
lifecycle `status` (`DRAFT | PENDING_APPROVAL | ISSUED | SUSPENDED | REVOKED |
STALE`); the allocated `certificateNumber` (nullable until issue); the content
`checksum` (set once at issue); `verificationCode`/`verificationUrl`; and the
per-transition audit columns (`revokedAt/By/Reason`, `suspendedAt/By/Reason`,
`staleDetectedAt`, `staleReason`, `expiresAt`).

Filtered-unique (migration-only): `certificates_org_certificate_number_key`,
`certificates_verification_code_key`,
`certificates_active_per_transcript_type_key` (at most one active certificate per
transcript version + type).

### `CertificatePolicy`

The gate configuration for a `(certificateType, courseId?)`. Flags such as
`requiresIssuedTranscript`, `requiresCourseCompleted`, `requiresNoPendingSubjects`,
`requiresFinancialClearance`, `requiresManualApproval`, `autoIssueOnTranscriptIssued`,
plus `staleAction` (`MARK_STALE | SUSPEND | REVOKE`) and `validityMonths`.
`courseId = null` is the organization default for the type. Filtered-unique on
default-active and course-override-active.

### `CertificateTemplate`

Presentation for a `(certificateType, courseId?, language)`: `layoutJson`,
optional `templateHtml`, background/signature/seal image URLs. Same
default/override filtered-unique shape as policy. Consumed by the PDF renderer;
carries no lifecycle.

### `CertificateEvent`

Append-only audit log per certificate: `eventType`, `previousStatus`/`newStatus`,
`actorId`, `reason`, `metadata`. Written inside the same transaction as the
mutation it records. This is the durable audit trail (distinct from the bus events
emitted post-commit).

### `CertificateExport`

One row per export attempt (`exportType: PDF | API | MINISTRY`), with `fileUrl`,
`fileChecksum`, `exportedBy/At`, and `status: PENDING | READY | FAILED`. The
`fileUrl` is an internal storage reference and is never returned to clients — the
authenticated download service streams bytes instead.

### `CertificateVerification` (public projection)

1:1 with `Certificate` (`certificateId @unique`, `verificationCode @unique`).
Holds the `publicStatus` (`VALID | REVOKED | SUSPENDED | EXPIRED | NOT_FOUND`),
`verificationCount`, `lastVerifiedAt`, `expiresAt`. This is the *only* thing the
public endpoint reads. Expiry surfaces here (`publicStatus = EXPIRED`) while
`Certificate.status` stays `ISSUED` (decision D-6): expiry is a public-facing
projection concern, not a lifecycle transition.

### `CertificateRequest`

The student-initiated request workflow: `status: PENDING | APPROVED | REJECTED |
FULFILLED | CANCELLED`, optional `transcriptVersionId` pointer (may resolve at
review), `requestedBy`, `reviewedBy/At`, and `fulfilledCertificateId` linking to
the `Certificate` produced on fulfilment.

### `CertificateNumberCounter`

Per-`(organizationId, year)` monotonic sequence (`lastSeq`). Incremented inside the
issue transaction to allocate the human-facing certificate number; the formatted
uniqueness is additionally guaranteed by the filtered-unique index.

### Relationships

`Policy` and `Template` are configuration parents of `Certificate` (nullable FK).
`Certificate` owns `events[]`, `exports[]`, and a single `verification`.
`CertificateRequest` optionally points at the `Certificate` it was fulfilled by.
The transcript is **not** a relation — it is a copied pointer.

---

## 5. Engine Flow

```
Eligibility Source        certificate-eligibility-source.service.ts
        │                 aggregates FACTS (policy + transcript-via-ACL + finance flag)
        ▼
Eligibility Engine        certificate-eligibility.engine.ts
        │                 PURE decision: facts → { eligible, blockingReasons, warnings }
        ▼
Generate                  GenerateCertificateCommand
        │                 freezes snapshots; DRAFT or PENDING_APPROVAL
        ▼
Issue                     IssueCertificateCommand
        │                 allocate number + checksum; create verification projection; ISSUED
        ▼
Lifecycle                 Revoke / Suspend / Restore  (+ Stale via reaction)
        │                 conditional status transitions; each writes an audit event
        ▼
Verification              public projection kept in sync; public endpoint reads it
        ▼
Export                    PDF artifact and/or Ministry payload (adapters)
        ▼
Portal                    admin/student read models (self-scoped)
        ▼
Bulk                      orchestrates singular commands, one tx per item
        ▼
Operational               health / maintenance / metrics / outbox (read-only + Outbox)
```

Each arrow is a layer boundary, not a background pipeline: every step is an
explicit, synchronous, transactional operation triggered by a caller. STALE enters
the flow *sideways* — a transcript-invalidation domain event drives the staleness
handler, which runs the staleness reconciliation and re-enters the lifecycle.

---

## 6. Command Architecture

Every mutation is a class extending `BaseCommand`; `run()` orchestrates
`validate()` (Zod) → `authorize()` (CASL/RBAC) → `execute()` (one Prisma
transaction). Inside `execute()`:

- status transitions are **conditional writes** — `updateMany({ where: { id,
  organizationId, status: <expected> }})` and assert `count === 1`, so two
  concurrent callers cannot both win a transition;
- a `CertificateEvent` is written **inside** the same transaction;
- domain events are collected and, **after commit**, handed to
  `certificateOutbox.dispatch(events)` — the only publish path.

| Command | Responsibility | MUST NOT |
|---|---|---|
| **Generate** | Load facts, run the eligibility engine, freeze snapshots, create the certificate `DRAFT` (or `PENDING_APPROVAL` when the policy requires approval). | Recompute academics; issue; allocate a number; compute the content checksum; read the transcript except through the ACL. |
| **Approve** | Record the `certificate.approved` provenance event for a `PENDING_APPROVAL` certificate so Issue's gate is satisfied (authority `certificates.generate`). | Change the certificate status (approval is not a transition); re-decide eligibility; publish on the bus (audit/provenance only). |
| **Issue** | Promote `DRAFT/PENDING_APPROVAL → ISSUED`: allocate the number from the counter, compute the content checksum **once**, create the `CertificateVerification` projection (`VALID`). | Re-run heavyweight eligibility from scratch outside its validation; recompute the checksum on later reads; touch academics. |
| **Revoke** | `ISSUED|SUSPENDED → REVOKED` (terminal); set `publicStatus = REVOKED`. | Be reversible; delete data; recompute anything. |
| **Suspend** | `ISSUED → SUSPENDED` (recoverable); set `publicStatus = SUSPENDED`. | Skip the conditional guard; touch a REVOKED/terminal certificate. |
| **Restore** | `SUSPENDED → ISSUED`; restore `publicStatus`. Reuses `certificates.suspend`. | Restore a REVOKED (terminal) or STALE certificate through the suspend path. |
| **Export (PDF)** | Create a `CertificateExport`, render bytes via the PDF adapter, persist+hash via the storage adapter, mark `READY`/`FAILED`, emit `certificate.exported`. | Return `fileUrl` to a client; embed rendering or storage logic in a service; mutate certificate lifecycle. |
| **Ministry** | Build the ministry payload (pure), serialize (JSON/CSV/XML), transport (local stub), persist the artifact, emit `certificate.exported`. | Submit to a real external API (v1 stub); change lifecycle; leak internal ids/checksums beyond the payload contract. |
| **Request** (+ approve/reject/cancel/fulfill) | Run the student request workflow; on fulfil, generate/issue and link `fulfilledCertificateId`. | Let a student self-approve; bypass eligibility on fulfilment; act cross-tenant. |
| **Bulk** (generate/issue/export/revoke/suspend/restore) | Orchestrate the singular command per item, **each in its own transaction**, aggregate per-item success/failure. | Wrap all items in one giant transaction; introduce a *different* rule than the singular command; run in parallel/queues (v1 is sequential and synchronous by design). |
| **Reconcile staleness** | Apply the policy `staleAction` to certificates whose transcript was invalidated (dry-run by default). | Invent a new stale rule; mutate the transcript; publish outside the Outbox. |

Cross-cutting **MUST NOT** for every command: never derive `organizationId` from
client input; never read Grade/Attendance/Progress live; never publish an event
before commit or outside the Outbox; never spread a request body into
`create`/`update`.

---

## 7. Repository Architecture

**Rules.**

- Repositories are the **only** layer that imports Prisma. Nothing above them
  names a Prisma model, relation, or client.
- Every function takes and applies `organizationId`; reads use
  `findFirst`/`findMany`/`count`, never a global `findUnique(id)`.
- **No business logic.** Repositories copy/return data. No eligibility, no grade
  or attendance calculation, no lifecycle decisions.

**Transaction support.** Read/write helpers accept an optional
`client?: PrismaClientOrTx`. A command passes its transaction handle so all writes
(status update + audit event + counter increment) commit atomically; callers
outside a transaction get a fresh client via `getDb()`.

**Conditional updates.** Status transitions are expressed as
`updateMany({ where: { …, status: expected }})` returning a count the command
asserts — the concurrency-safety primitive lives here, in the repository call
shape, not in ad-hoc service code.

**Tenant safety.** Because every `where` carries `organizationId` and no method
takes a bare global id, a caller cannot accidentally read or write another
tenant's row. Filtered-unique indexes (numbering, verification code, active-per-
transcript-type) are defined in the migration and *relied upon* by the repository,
which does not attempt to re-enforce them in code.

**Soft delete.** `deletedAt` marks logical deletion; active-set reads filter
`deletedAt: null`. Nothing is hard-deleted in the normal flow.

**Read helpers.** The operational layer added additive, aggregate read helpers to
`certificate.repository.ts` (`countCertificatesByStatus`,
`listCertificateCreatedTimestamps`, `findCertificateStatusesByIds`) and the
batched `findActiveCertificatesForPairs` used by the bulk preview to avoid N+1.
These are pure reads; they add no write path.

**The ACL repository** (`certificate-transcript-source.repository.ts`) is a
repository by placement but an anti-corruption layer by role — see §9.

---

## 8. Read Services

**Purpose.** Compose repository reads into DTOs/read-models for a specific
consumer (admin, student, public, portal, operational). They never mutate and
never publish.

**Allowed responsibilities:** shaping/mapping rows to DTOs; self-scoping (student
sees only their own; teacher/guardian scoping); privacy redaction; assembling the
eligibility *facts* (source service) and deciding eligibility (the pure engine);
aggregating counts/anomalies for operators.

**Forbidden responsibilities:** any DB write (`create/update/delete/upsert`, raw
SQL); referencing `eventPublisher`; importing a command; reading Academic Core /
Transcript tables directly (only via the ACL repository, and the operational
services not at all). All of these are statically enforced (§9).

| Service | Role |
|---|---|
| **Eligibility source** | Aggregates the `CertificateEligibilityFacts` (policy, transcript facts via ACL, finance flag). Reads only; performs no decision. |
| **Eligibility engine** | Pure, deterministic `facts → result`. No I/O, no clock, no randomness; `evaluatedAt` comes from the facts. The single authority on eligibility. |
| **Portal / admin / student read** | Build the paginated list + detail read models; student/teacher/guardian variants self-scope; published-grade/PII masking as required. |
| **Public verification** | Returns the privacy-safe projection for a code and bumps `verificationCount`/`lastVerifiedAt`. Exposes no PII, no checksum, no internal ids, no transcript pointer. |
| **Health** | Aggregate KPI counts (per-status certificate counts, export ready/failed, verification rows/mismatches, request states) via `Promise.all` of count helpers. |
| **Maintenance** | Read-only anomaly detection: orphaned/stuck/failed exports, duplicate verifications, verification-projection mismatches. Mirrors the lifecycle→publicStatus mapping to find drift; defines no rule; redacts verification codes. |
| **Metrics** | Windowed action counts (today / 7d / 30d) built from existing tables in a single scan per source; `verification` is approximated from `lastVerifiedAt` (documented). |
| **Preview (bulk)** | One batched read of all conflicting active certificates for the requested pairs, then in-memory lookup — a pre-flight for bulk generate with no per-item query and no eligibility/transcript read. |

---

## 9. ACL (Transcript Anti-Corruption Layer)

**The single boundary.** `certificate-transcript-source.repository.ts` is the only
component in the whole engine allowed to read Transcript Engine tables
(`AcademicTranscriptVersion`, `AcademicTranscript`, and its level/subject/
assessment/attendance children). It translates the transcript's internal
persistence model into Certificate DTOs (`types/transcript-source.ts`). Everything
downstream consumes DTOs and never names a transcript table.

**Why it exists.** ADR-002 makes the Certificate Engine downstream of the
Transcript Engine. Coupling certificate code to transcript schema would make the
two engines change together and let academic recalculation leak into
certification. The ACL confines the coupling to one file: if the transcript schema
changes, **only this file changes** and the DTO contract keeps every downstream
component untouched.

**Rules.**

- **Read-only.** Never creates/updates/deletes/upserts/marks-stale a transcript
  row; no lifecycle, numbering, checksum, events, or audit on transcript data.
- **No business logic.** Copies stored snapshot facts verbatim — no grade,
  attendance, completion, or eligibility calculation, no derived fields (it does
  parse the stored `{ course, courseProgress }` JSON envelope into two DTO fields,
  copied verbatim).
- **Tenant-scoped.** Every query carries `organizationId` and uses
  `findFirst`/`findMany`/`count`; only ISSUED versions are surfaced for
  certification (DRAFT/SUPERSEDED/REVOKED return `null`).
- **Exposes no Prisma entity/relation/persistence detail** — DTOs only.

**Forbidden imports (enforced by guard tests).** No non-ACL certificate file may
import `modules/{grades,attendance,assessments,academic,enrollments,transcripts}`,
name `AcademicTranscript`, or import `certificate-transcript-source`. The
operational layer additionally may not import the eligibility engine, commands,
PDF/storage/ministry adapters, or React. `__tests__/architecture-guards.test.ts`,
`repositories/__tests__/architecture-guards.test.ts`,
`services/__tests__/architecture-guards.test.ts`, and
`__tests__/operational-architecture-guards.test.ts` read the sources directly so a
forbidden edit fails the suite.

---

## 10. Events

Three distinct concerns, deliberately separate:

**Audit log — `CertificateEvent` (durable).** Written inside every mutation's
transaction. This is the authoritative, queryable history and is independent of
message delivery.

**Domain events (bus).** The vocabulary is declared in `event-types.ts`
(`DomainEventType`). Emitted on the bus:

| Event | Emitted | Source |
|---|---|---|
| `certificate.issued` | bus | Issue |
| `certificate.revoked` | bus | Revoke |
| `certificate.suspended` | bus | Suspend |
| `certificate.restored` | bus | Restore |
| `certificate.exported` | bus | Export (PDF) + Ministry |
| `certificate.marked_stale` | bus | Staleness handler + reconcile command |
| `certificate.generated` | audit only | Generate |
| `certificate.approved` | audit only | Approval flow |
| `certificate.verified` | projection counter only | Public verification |

**Outbox (the single publish seam).** No command calls `eventPublisher` directly.
The flow is Command → (commit) → `certificateOutbox.dispatch(events)` →
`enqueue()` per event → `publish()`. All **8 post-commit publish sites** (the 7
publishing commands + the `CertificateTranscriptStalenessHandler`) go through it.
The Outbox is the *only* file in the operational layer allowed to reference
`eventPublisher`.

**Publish-after-commit guarantee.** Events are dispatched only after the
transaction commits, so a rolled-back mutation emits nothing, and a delivery
failure never rolls back a committed mutation. `dispatch()`/`publish()` never
throw — a delivery error is captured as a retry/dead-letter, not propagated to the
caller.

---

## 11. Export Architecture

Export is composed from swappable adapters that live in `export/`, deliberately
**outside** `services/` (the service guards forbid PDF/storage dependencies in a
service; these are infrastructure, not domain services). Commands depend on the
*interfaces* in `types/export.ts` and `types/ministry.ts`, so any adapter can be
replaced wholesale.

**PDF.** `certificate-pdf-renderer.ts` produces bytes from a certificate +
template. It contains no business rule and no repository access — bytes in, bytes
out.

**Storage.** `certificate-export-storage.ts` persists the bytes, computes the
`fileChecksum`, and returns an internal storage reference recorded on
`CertificateExport.fileUrl`. `certificate-export-storage-reader.ts` reads bytes
back for authenticated download. The storage backend is abstracted via
`src/infrastructure/**`.

**Ministry.** A pure builder (`certificate-ministry-payload.ts`) produces the
payload; formatters (`certificate-ministry-formatters.ts`) serialize it to
JSON/CSV/XML; the transport port (`certificate-ministry-transport.ts`) delivers it
— a **local stub** (`LOCAL-MINISTRY-…`) in v1; storage
(`certificate-ministry-storage.ts`) persists the artifact.

**Verification URL / code.** `lib/certificate-verification-code.ts` and
`lib/certificate-verification-url.ts` build the public code and its URL at
generation; the code keys the `CertificateVerification` projection consumed by the
public endpoint.

**Checksums.** Two independent checksums: the **content checksum** on the
certificate (computed once at issue, immutable, the tamper-evidence anchor) and the
**artifact checksum** (`fileChecksum`) on each export row (integrity of the stored
bytes). Neither is ever returned to a client.

---

## 12. Operational Layer (Phase 14)

Read-only observability + one reliability seam. Adds no domain rule and no
lifecycle transition.

**Outbox.** `CertificateOutboxService` — an in-process, in-memory queue; the
process-wide singleton `certificateOutbox` that every command shares. `enqueue`
records an entry `PENDING`; `publish`/`retry` attempt delivery through an
injectable `deliver` fn (default `eventPublisher.publish`, which itself never
throws); `dispatch(events)` = enqueue-all-then-publish (the command entrypoint).
It carries the only mutable state in the layer.

**Retry.** `retry-policy.ts` is pure: `canRetry(n) = n < 3`,
`retryDelayMs(n) = 1000 · 2^(n-1)` (exponential backoff), `nextRetryAt(now, n)`.
No timers/scheduler — retry is driven by explicit `publish()`/`retry()` calls;
`nextRetryAt` is advisory bookkeeping.

**Dead letter.** When the retry budget (3) is exhausted an entry moves to `FAILED`.
It stays queryable and is **never auto-deleted** — operator visibility over lost
deliveries.

**Maintenance.** Read-only anomaly detection (§8). Detection only, never a repair
write; verification codes redacted in output.

**Metrics.** Windowed action counts from existing tables (no event replay);
`verification` is an approximation from `lastVerifiedAt`.

**Health.** Aggregate KPI counts across statuses, exports, verifications, requests.

**Dashboard.** `certificate-operational.service.ts` composes
`{ health, maintenance, outbox, metrics, generatedAt }` (via `Promise.all`) into
`CertificateOperationalDashboard` — a read model an admin surface can render; there
is no UI in v1. `getOutboxSummary` exposes the sanitized Outbox view (counts +
dead-letter, never payloads).

All operational responses are **aggregates and structural anomalies only** — no
PII, checksums, storage paths, verification codes, or transcript pointers.

---

## 13. Security

**Tenant isolation.** `organizationId` is always taken from the authenticated
context, never from client input; every repository query is scoped by it; no
method accepts a bare global id. Cross-tenant reads are structurally impossible
through the repository API.

**Permissions (server-side, CASL/RBAC).** Every route/command authorizes before
acting; default deny.

| Permission | Use |
|---|---|
| `certificates.view` | Read within the tenant (admin/secretary + operational endpoints). |
| `certificates.viewOwn` | Student reads own certificates. |
| `certificates.generate` | Generate; review requests (approve/reject/fulfil). |
| `certificates.issue` | Issue. |
| `certificates.revoke` | Revoke. |
| `certificates.suspend` | Suspend **and** restore (restore reuses this). |
| `certificates.export` | Export (PDF + ministry). |
| `certificates.request` | Student requests; cancels own request. |
| `certificates.verify` | Internal verification. |
| `certificatePolicies.manage` / `certificateTemplates.manage` | Manage config. |

GUARDIAN has no certificate access (denied by default; policy TBD).

**DTO redaction.** Read models expose only what a consumer needs. `passwordHash`,
tokens, checksums, storage paths, verification codes, transcript pointers and raw
PII never appear in a response. The maintenance report explicitly redacts
verification codes (`"[REDACTED]"`).

**Verification privacy.** The public endpoint has no auth, is rate-limited, and
returns only the privacy-safe projection (`publicStatus` + minimal display facts) —
never internal ids, PII beyond the certified name, checksums, or the transcript
pointer.

**Download security.** Export `fileUrl` is never returned. Download is an
authenticated, tenant-and-ownership-checked route that streams bytes via the
storage reader; students may download only their own artifacts.

---

## 14. Extension Points

The engine is designed so the following are additive — none require changing
existing architecture.

- **New certificate type.** Add the value to the `CertificateType` const object,
  seed a policy/template for it. No new command, repository, or schema — every
  command is type-agnostic and reads the policy/template by type.
- **New export type.** Add an adapter under `export/` implementing the interface
  in `types/export.ts` (or a ministry-style port), add a thin command that
  composes it, and record a `CertificateExport` row with the new `exportType`.
  Existing exports are untouched.
- **New verification provider.** The public projection
  (`CertificateVerification`) is the contract. A new provider consumes the same
  projection/DTO; no lifecycle or command change.
- **New lifecycle transition.** Add a command with its own conditional guard and
  audit event, extend the status vocabulary in `constants.ts`, and extend
  `expectedPublicStatuses` in the maintenance service so drift detection keeps
  mirroring reality. The existing transitions are unaffected.
- **New storage provider.** Implement the storage adapter interface behind
  `src/infrastructure/**`; commands depend on the interface, so swapping the
  backend touches no command or service.

The general rule: depend on the `types/**` interface, implement an adapter, wire it
in a command — never widen a repository into business logic or bypass the ACL.

---

## 15. Future Work

- **Persistent Outbox.** Replace the in-memory queue with a table + worker + real
  backoff, **preserving the current API** (`enqueue`/`publish`/`retry`/`list*`/
  `mark*`/`dispatch`). Removes the single-process delivery-loss risk.
- **Distributed queues.** Move bulk operations (currently sequential and
  synchronous by design) onto queues/workers with parallelism and retries.
- **External ministry transport.** Replace the local stub with the real ministry
  API behind the existing transport port; the payload/formatter contracts stay.
- **Distributed rate limiting.** Replace the per-process public limiter with a
  shared store (Redis / edge KV) so abuse control holds across instances.
- **Expiry derivation.** Wire `policy.validityMonths → Certificate.expiresAt` so
  the (already-built) expiry sweep and the `EXPIRED` public status become live.
- **Guardian access & request-workflow payment.** Both deferred; policy and flow
  TBD.

---

## Validation at freeze

`pnpm exec tsc --noEmit` · `pnpm exec vitest run src/modules/certificates
src/app/api/certificates src/server/events` · `pnpm lint` · `pnpm exec prisma
validate` — all pass. Phase 14 introduced no schema/migration change; lifecycle
and domain rules are unchanged from the earlier phases.
