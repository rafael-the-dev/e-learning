# Certificate Engine — Domain Model & Architecture

- **Status:** **Architecture FROZEN — v1.0** (design complete; implementation not started)
- **Date:** 2026-07-07
- **Freeze governed by:** [ADR-002 — Certificate Engine Architecture](./adr/ADR-002-certificate-engine-architecture.md)
- **Depends on (frozen):** [Academic Core v1.0 — ADR-001](./adr/ADR-001-academic-core-freeze.md), [Academic Transcript Engine](./academic-transcript-engine.md)
- **Position:** Downstream consumer of the Transcript Engine. Consumes **issued transcript versions** only; never recalculates academic state.

> **Binding rule (ADR-001):** *"Certificate and Diploma engines must consume the
> Transcript, not the Grade or Attendance engines directly. The official record is
> always read through the immutable, versioned snapshot."* This document is written
> to honour that rule strictly. Any deviation is a design defect.

> ## 🔒 Certificate Engine Status
>
> | | |
> |---|---|
> | **Architecture Freeze** | **YES** |
> | **Version** | **v1.0** |
> | **State** | Design Complete |
> | **Implementation** | Not Started |
> | **Open Decisions** | 0 (all resolved — see §28) |
> | **Governed by** | [ADR-002](./adr/ADR-002-certificate-engine-architecture.md) |
> | **Consumers** | Student Portal · Guardian Portal · Public Verification · PDF Export · Ministry Export |
>
> The architecture below is closed. Any structural change requires a **new ADR**
> that supersedes or amends ADR-002; this design is not edited in place once frozen,
> except for the corrections/clarifications recorded in this freeze pass.

---

## 1. Executive Summary

The Certificate Engine is the **official certificate issuance layer**. It certifies
facts that have already been **frozen and issued** on an `AcademicTranscriptVersion`.
It does not decide academic outcomes — it decides, given (a) an *issued* transcript
version and (b) a certificate policy, **whether a certificate may be issued**, and
then produces an immutable, numbered, verifiable certificate record plus its export
artifacts.

Design commitments:

- **Snapshot-over-recalculation.** The engine reads the transcript snapshot facts
  (`status`, `completedAt`, subject statuses, `finalGrade`) that the Transcript
  Engine already froze. It never re-runs a grade, attendance, subject, level, or
  completion rule.
- **Immutable references.** A certificate pins one `transcriptVersionId` +
  `transcriptChecksum`. If the transcript is later superseded/revoked, the
  certificate does **not** silently change — it is marked `STALE` (default) or
  `SUSPENDED`/`REVOKED` per policy, and a new certificate requires a new issue.
- **No certificate versioning (Option A).** The certificate is immutable once
  issued; a correction is a *new* certificate. The transcript is already versioned;
  double-versioning adds complexity with no regulatory benefit today.
- **Same lifecycle discipline as the Transcript Engine.** `BaseCommand` mutations,
  single transaction, conditional writes for concurrency, append-only events, audit
  inside the transaction, domain events published only after commit, number
  allocated only on issue, content-only checksum.
- **New module:** `src/modules/certificates/`. **Zero changes to Academic Core** or
  the Transcript Engine. Adds new Prisma models, new `PERMISSIONS`, new
  `DomainEventType` entries, and one number-counter table.

Certificate **types** supported: `COURSE_COMPLETION`, `LEVEL_COMPLETION`,
`PARTICIPATION`, `ATTENDANCE`, `ACHIEVEMENT`, `PROFESSIONAL_TRAINING`,
`DRIVING_SCHOOL`, `LANGUAGE_COURSE`, `IT_COURSE`, `DESIGN_COURSE`.

---

## 2. Core Principle (source of truth)

```
WRONG:  Certificate walks every subject and recomputes whether the student passed.
CORRECT: Certificate loads an ISSUED AcademicTranscriptVersion + CertificatePolicy,
         reads the frozen snapshot facts, checks the policy gates, and decides.
```

The Transcript Engine is the **official academic record source**. The Certificate
Engine is a certification layer *on top of* that record.

### Immutable domain rules (frozen — ADR-002)

> **Rule C-1 — Certificate Engine consumes the Transcript, never Academic Core raw tables.**
> All academic facts are read through an **issued** `AcademicTranscriptVersion`
> snapshot. The engine never reads Grade/Attendance engines, `StudentAssessmentResult`,
> `StudentSubjectProgress`, `StudentLevelProgress`, raw attendance, or
> `StudentCourseProgress` directly.

> **Rule C-2 — Administrative facts are evaluated externally and snapshot into the Certificate.**
> Finance clearance, manual approval, and template selection are **not** academic
> facts. They are evaluated at generation/issue time against external sources
> (finance read-model, approver identity, template registry) and **frozen onto the
> Certificate**. The Certificate never recalculates an administrative fact after issue.

> **Rule C-3 — Certificate eligibility has a single authority.**
> `CertificateEligibilityEngine` is the only component allowed to determine whether a
> certificate may be generated or issued. Commands, repositories, UI, jobs, scheduled
> tasks, event handlers, APIs, integrations and future modules must never duplicate,
> reimplement or bypass certificate eligibility rules. Every eligibility decision
> originates **exclusively** from `CertificateEligibilityEngine`.
> `CertificateEligibilitySource` provides facts; `CertificateEligibilityEngine`
> evaluates those facts; commands execute the resulting decision. **No other component
> is permitted to decide eligibility.**
>
> **Source provides facts. Engine decides. Commands execute.**

> **Rule C-4 — Eligibility evaluates facts only.**
> `CertificateEligibilityEngine` evaluates **only** the `CertificateEligibilityFacts`
> supplied by `CertificateEligibilitySource`. The engine must never: query Prisma
> directly · query repositories directly · call Transcript repositories · call Finance
> repositories · call external APIs · load configuration directly · perform any
> database access. If additional information becomes necessary, it must **first** be
> exposed through `CertificateEligibilitySource`. `CertificateEligibilitySource` is
> therefore the **only read dependency** of `CertificateEligibilityEngine`.

> **Rule C-5 — Commands execute, never decide.**
> `GenerateCertificateCommand`, `IssueCertificateCommand`, auto-issue handlers,
> background jobs, HTTP endpoints, public APIs, integrations, and future services must
> **consume** the decision returned by `CertificateEligibilityEngine`. They must never:
> duplicate eligibility rules · re-check policy requirements · evaluate grades ·
> evaluate attendance · evaluate financial clearance · decide whether a certificate may
> be issued. **Commands orchestrate. `CertificateEligibilityEngine` decides.**

> **Rule C-6 — Eligibility is a deterministic domain service.**
> Given the same `CertificateEligibilityFacts`, `CertificateEligibilityEngine` must
> **always** produce the same `CertificateEligibilityResult` — it is a pure function of
> its input. The engine must not depend on: current database state · repository
> queries · external services · the system clock (`Date.now()`/`new Date()`) · random
> values · any mutable global state. Any time-dependent or external fact (e.g. "now",
> an expiry cut-off, a finance flag) must be **loaded by `CertificateEligibilitySource`
> and included explicitly in `CertificateEligibilityFacts`** (for example via
> `metadata.loadedAt`), never read inside the engine. Determinism makes the decision
> reproducible, testable from fixtures alone, and auditable: the same facts always
> justify the same result. (Reinforces Rule C-4.)

> **Architecture Checklist — Eligibility (code review).** Ask on every change that
> touches the certificate flow:
> - [ ] Does this code introduce eligibility logic outside `CertificateEligibilityEngine`?
> - [ ] Does `CertificateEligibilityEngine` depend only on `CertificateEligibilitySource`?
> - [ ] Does any command query repositories to decide eligibility?
> - [ ] Does any repository evaluate business rules?
> - [ ] Does any component bypass `CertificateEligibilityEngine`?
> - [ ] Does `CertificateEligibilityEngine` read the clock, randomness, the DB, or any
>   fact not present in `CertificateEligibilityFacts` (i.e. is it non-deterministic)?
>
> Any **"Yes"** (to the first, third, fourth, fifth or sixth) — or **"No"** to the
> second — indicates an architectural violation of Rules C-3/C-4/C-5/C-6.

### What the Certificate Engine MAY read

| Source | How | Why allowed |
|---|---|---|
| `AcademicTranscriptVersion` (ISSUED) | ONLY via `CertificateTranscriptSourceRepository` (the ACL, §3a) | The official record |
| `AcademicTranscript` (root) | same ACL | Number, status, currentVersion pointer |
| Transcript snapshot child rows / `courseProgressSnapshot` | same ACL | Frozen `status`, `completedAt`, subject statuses, grades |
| `Organization` settings | org repo | Certificate display / clearance policy toggles |
| `CertificatePolicy`, `CertificateTemplate` | own repos | Its own configuration |
| Finance clearance **read model** (a boolean/flag) | finance read repo | Finance is **not** Academic Core; clearance is not an academic recalculation (Resolved Decision D-3; snapshot into Certificate per Rule C-2) |

### What the Certificate Engine MUST NEVER read or call

- Grade Engine, Attendance Engine (calculators, live calculation inputs)
- `StudentAssessmentResult`, `StudentSubjectProgress`, `StudentLevelProgress`, raw attendance records
- `StudentCourseProgress` **directly** — the completion facts it needs
  (`status`, `completedAt`, `finalGrade`, `earnedCredits`) are **already frozen** on
  the transcript's `courseProgressSnapshot`. Reading them from the snapshot is the
  rule; reading `StudentCourseProgress` live is forbidden (would diverge from the
  issued record).

### What the Certificate Engine MUST NEVER compute

final grade · subject status · level status · course completion · attendance
percentage · eligibility by re-running academic rules.

### Source-of-Truth table (frozen)

Each concern has exactly one owner. Downstream layers copy the owner's output; they
never recompute it.

| Concern | Source of truth | Certificate Engine role |
|---|---|---|
| **Academic decision** (grades, statuses, completion, attendance) | **Transcript** (issued `AcademicTranscriptVersion` snapshot, itself sourced from the Academic Core) | Reads only — never recomputes |
| **Administrative decision** (finance clearance, manual approval, template selection) | **Certificate** (snapshot of externally-evaluated facts, per Rule C-2) | Owns — evaluates externally, freezes onto the certificate |
| **Rendering** (layout, language, images, seals) | **CertificateTemplate** | References by `templateId` |
| **Verification** (public validity state) | **CertificateVerification projection** | Owns the projection; kept in sync by lifecycle commands |
| **Public API** (external validity lookup) | **CertificateVerification projection** | Serves the minimal public shape only (§22) |

---

## 3. Relationship to Transcript

```
Organization 1───* AcademicTranscript 1───* AcademicTranscriptVersion (ISSUED)
                                                     │  (pin: id + checksum)
                                                     ▼
                            Certificate *───1 CertificatePolicy
                                 │  *───1 CertificateTemplate
                                 ├── 1───1 CertificateVerification
                                 ├── 1───* CertificateExport
                                 ├── 1───* CertificateEvent   (append-only)
                                 └── 0/1─* CertificateRequest (fulfilledCertificateId)
```

A certificate **references** (never owns):
- `transcriptVersionId` — exact version (FK-by-id pointer, `NoAction`)
- `transcriptNumber` — copied string (survives supersession/deletion)
- `transcriptChecksum` — copied string (tamper/staleness anchor)

A certificate **snapshots** into its own row (three JSON columns on the leaf
aggregate — D-8):
- `studentSnapshot` — student identity
- `courseSnapshot?` — course identity (null for course-less types)
- `issueBasisSnapshot` — completion status + issue basis (from `courseProgressSnapshot` / level snapshot)

**Staleness contract:** if the linked version becomes `SUPERSEDED`/`REVOKED`, or the
parent transcript sets `needsRegeneration`, the certificate is marked `STALE`
(default) or `SUSPENDED`/`REVOKED` per policy — **never silently updated, never
silently revoked**. A new certificate requires a new issue against the new version.

### 3a. `CertificateTranscriptSourceRepository` — the Anti-Corruption Layer (ACL)

**Role.** The single, read-only adapter through which the Certificate Engine reads
the Transcript Engine. It is the **only** component in the engine permitted to name
a transcript table; **everything else consumes the DTOs it returns**
(`TranscriptCertificateSourceDto`, `TranscriptVersionSummaryDto`). This is a
textbook Anti-Corruption Layer: the certificate side never learns the transcript's
internal schema.

- **Location:** `src/modules/certificates/repositories/certificate-transcript-source.repository.ts`.
- **May read (read-only):** `AcademicTranscript`, `AcademicTranscriptVersion`,
  `AcademicTranscriptLevel`, `AcademicTranscriptSubject`,
  `AcademicTranscriptAssessment`, `AcademicTranscriptAttendance`.
- **Returns:** Certificate DTOs only — never a Prisma entity, relation, or column
  layout. It copies snapshot facts **verbatim**; it never calculates a grade,
  attendance, completion, or eligibility, and derives no field.
- **Tenant-scoped:** every query carries `organizationId` and uses
  `findFirst`/`findMany`/`count` — never `findUnique(id)`.
- **Transaction-aware:** every method takes an optional `client?: PrismaClientOrTx`
  and falls back to `getDb()` (same convention as the transcript repositories).
- **Returns `null`, never throws** for a missing/again-scoped transcript. Commands
  decide what a `null` means — the ACL raises no domain/validation/authorization error.

**Methods (Part A):**

| Method | Returns | Rule |
|---|---|---|
| `findIssuedTranscriptVersionForCertificate({ organizationId, transcriptVersionId })` | `TranscriptCertificateSourceDto \| null` | ISSUED versions only; complete snapshot; deterministic child ordering; single aggregate load, no N+1 |
| `findTranscriptVersionSummary({ organizationId, transcriptVersionId })` | `TranscriptVersionSummaryDto \| null` | Lightweight metadata (`transcriptVersionId`, `transcriptNumber`, `checksum`, `status`, `issuedAt`, `studentId`, `courseId`); any status |
| `existsIssuedTranscript({ organizationId, transcriptVersionId })` | `boolean` | Tenant-scoped `count > 0` for an ISSUED version |

**Storage detail the ACL absorbs:** the transcript version persists course identity
and course progress together in one JSON column (`{ course, courseProgress }`). The
ACL parses that envelope and surfaces the two halves as the separate
`courseSnapshot` / `courseProgressSnapshot` DTO fields — copied verbatim. **If the
Transcript Engine's schema ever changes, only this repository changes**; the DTO
contract keeps every downstream certificate component untouched.

---

## 4. Models

New models (all in `src/modules/certificates/`, all `@@map` snake_case, all rows
carry `organizationId`, all relations `onDelete: NoAction, onUpdate: NoAction`):

1. `CertificatePolicy` — eligibility & issuing rules
2. `CertificateTemplate` — visual/content template
3. `Certificate` — root aggregate (immutable once issued)
4. `CertificateEvent` — append-only history
5. `CertificateExport` — PDF/API/Ministry artifacts
6. `CertificateVerification` — public verification (1:1 with an issued certificate)
7. `CertificateRequest` — request workflow (optional but recommended)
8. `CertificateNumberCounter` — infra; per-(org, year) sequence (mirrors `TranscriptNumberCounter`)

**No `CertificateVersion` model** (Option A — see §8).

---

## 5. CertificatePolicy

**Purpose:** declares eligibility gates and issuing behaviour for a certificate
type. **It never recalculates academic state** — every gate is a check against a
fact already present on the transcript snapshot (or a non-academic finance flag).

### Fields

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `organizationId` | `String` | tenant scope |
| `name` | `String` | PT-PT label at the UI layer |
| `certificateType` | `String` | one of the `CertificateType` values |
| `courseId` | `String?` | `NoAction` FK relation to `Course` (config integrity); when set, this is a per-course override |
| `requiresIssuedTranscript` | `Boolean @default(true)` | almost always true |
| `requiresCourseCompleted` | `Boolean @default(true)` | checks `courseProgressSnapshot.status` (deny-by-default) |
| `requiresNoPendingSubjects` | `Boolean @default(true)` | checks required-subject statuses in snapshot (deny-by-default) |
| `requiresFinancialClearance` | `Boolean @default(false)` | non-academic finance flag (D-3; result snapshot onto certificate) |
| `requiresManualApproval` | `Boolean @default(false)` | gate → `PENDING_APPROVAL` |
| `autoIssueOnTranscriptIssued` | `Boolean @default(false)` | event-driven auto-issue |
| `staleAction` | `String @default("MARK_STALE")` | `MARK_STALE` \| `SUSPEND` \| `REVOKE` (behaviour when the linked transcript is invalidated) |
| `validityMonths` | `Int?` | null = no expiry |
| `status` | `String @default("ACTIVE")` | `ACTIVE` \| `INACTIVE` \| `ARCHIVED` |
| `createdAt / updatedAt / deletedAt` | timestamps | soft delete |

### Resolution order (most specific wins)

1. `(organizationId, certificateType, courseId = <course>)` — course override
2. `(organizationId, certificateType, courseId = null)` — org default
3. none found → eligibility fails with blocker `NO_POLICY_CONFIGURED`

### Answers to the prompt's questions

- **One default per type?** Yes — exactly one `ACTIVE` policy per
  `(organizationId, certificateType)` with `courseId = null` (filtered unique).
- **Override by course?** Yes — optional `(org, type, courseId)` override, at most one
  active per triple.
- **Override by organization?** Policy is *already* per-organization; no cross-org
  inheritance (multi-tenant isolation).
- **Auto vs manual?** Both. `autoIssueOnTranscriptIssued` + `requiresManualApproval`
  are independent flags. Auto-issue only proceeds when the policy has zero manual
  gates; otherwise the transcript-issued event creates a `DRAFT`/`PENDING_APPROVAL`.

### Constraints & indexes

- Filtered unique (`certificate_policies_org_default_active_key`): org default `(organizationId, certificateType)` where `courseId IS NULL AND status='ACTIVE' AND deletedAt IS NULL`
- Filtered unique (`certificate_policies_org_course_override_active_key`): course override `(organizationId, certificateType, courseId)` where `courseId IS NOT NULL AND status='ACTIVE' AND deletedAt IS NULL`
- `@@index([organizationId, certificateType])`, `@@index([organizationId, courseId])`, `@@index([organizationId, status])`, `@@index([organizationId, deletedAt])`

**Audit:** policy create/update/delete/status-change → `certificate_policy.changed` audit action (append-only).

---

## 6. CertificateTemplate

**Purpose:** visual/content template used at render/export time. It carries **no
academic logic** and is checksum-relevant only via `templateId`.

### Fields

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `organizationId` | `String` | |
| `name` | `String` | |
| `certificateType` | `String` | template applies to this type |
| `courseId` | `String?` | `NoAction` FK relation to `Course`; optional per-course template |
| `language` | `String @default("pt-PT")` | multi-language support |
| `layoutJson` | `String @db.NVarChar(Max)` | structured layout (JSON); required |
| `templateHtml` | `String? @db.NVarChar(Max)` | optional raw HTML |
| `backgroundImageUrl` | `String?` | asset (validated server-side) |
| `signatureImageUrl` | `String?` | asset |
| `sealImageUrl` | `String?` | asset |
| `status` | `String @default("ACTIVE")` | `ACTIVE` \| `INACTIVE` \| `ARCHIVED` |
| `createdAt / updatedAt / deletedAt` | timestamps | soft delete |

### Answers

- **Per course template?** Yes — optional `courseId` override; resolution mirrors policy.
- **Per certificate type?** Yes — required.
- **Multi-language?** Yes — `language` column; resolve by requested language then org default.
- **Digital signature?** Not now. `signatureImageUrl` is a *visual* signature. A
  cryptographic org signature is a **later** phase layered on top of the content
  checksum (§10, §20). No key material is modelled yet.

### Indexes

- Filtered unique (`certificate_templates_org_default_active_key`): org default `(organizationId, certificateType, language)` where `courseId IS NULL AND status='ACTIVE' AND deletedAt IS NULL`
- Filtered unique (`certificate_templates_org_course_override_active_key`): course override `(organizationId, certificateType, courseId, language)` where `courseId IS NOT NULL AND status='ACTIVE' AND deletedAt IS NULL`
- `@@index([organizationId, certificateType])`, `@@index([organizationId, courseId])`, `@@index([organizationId, status])`, `@@index([organizationId, deletedAt])`

---

## 7. Certificate (root aggregate)

**Purpose:** the official certificate. **Immutable once ISSUED.**

### Fields

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `organizationId` | `String` | tenant scope |
| `studentId` | `String` | FK (`NoAction`) |
| `enrollmentId` | `String?` | FK (`NoAction`) |
| `courseId` | `String?` | FK (`NoAction`) |
| `transcriptVersionId` | `String` | **id pointer** to the exact issued version (`NoAction`, no cascade) |
| `transcriptNumber` | `String` | copied (survives supersession) |
| `transcriptChecksum` | `String` | copied — staleness/tamper anchor |
| `certificatePolicyId` | `String?` | **POINTER**; policy applied at issue |
| `certificateTemplateId` | `String?` | **POINTER**; template used |
| `certificateNumber` | `String?` | **null until issue**; filtered-unique per `(org, number)` |
| `certificateType` | `String` | one of `CertificateType` |
| `status` | `String @default("DRAFT")` | see state machine below |
| `studentSnapshot` | `String @db.NVarChar(Max)` | frozen student-identity display facts as JSON |
| `courseSnapshot` | `String? @db.NVarChar(Max)` | frozen course-identity display facts as JSON (null for course-less types) |
| `issueBasisSnapshot` | `String @db.NVarChar(Max)` | frozen structured statement of what was certified (completion status / issue basis) as JSON |
| `financialClearanceStatus` | `String @default("NOT_REQUIRED")` | **snapshot** of the finance read-model result at eval time (`NOT_REQUIRED` \| `CLEARED` \| `NOT_CLEARED` \| `UNKNOWN`); frozen, never recomputed (D-3, Rule C-2) |
| `financialClearanceCheckedAt` | `DateTime?` | when the finance read-model was consulted |
| `financialClearanceReference` | `String?` | optional finance reference (e.g. clearance/statement id); pointer, not FK |
| `issuedAt` | `DateTime?` | |
| `issuedBy` | `String?` | userId |
| `expiresAt` | `DateTime?` | issuedAt + `validityMonths` (null = perpetual) |
| `suspendedAt` | `DateTime?` | |
| `suspendedBy` | `String?` | |
| `suspendReason` | `String? @db.NVarChar(Max)` | |
| `revokedAt` | `DateTime?` | |
| `revokedBy` | `String?` | |
| `revokeReason` | `String? @db.NVarChar(Max)` | |
| `staleDetectedAt` | `DateTime?` | |
| `staleReason` | `String?` | one of `StaleReason` (e.g. `TRANSCRIPT_SUPERSEDED`) |
| `verificationCode` | `String?` | generated at draft; the public lookup key |
| `verificationUrl` | `String?` | derived public URL |
| `checksum` | `String?` | content checksum, set at issue (§20) |
| `createdAt / updatedAt / deletedAt` | timestamps | soft delete; revoke ≠ delete |

> **No `approvedAt`/`approvedBy` columns.** Approval provenance is **not** stored as
> columns on `Certificate`; it is recorded append-only via `CertificateEvent`
> (`certificate.approved`, with `actorId` + `createdAt`). A later
> `PENDING_APPROVAL → ISSUED` command will require an approval event (or a policy
> rule that waives manual approval) before issuing — the timestamp/actor of approval
> is read from that event, never from the certificate row.

> **Note on the frozen snapshot columns.** Display facts are frozen into **three**
> JSON columns — `studentSnapshot`, `courseSnapshot?`, `issueBasisSnapshot` — copied
> verbatim from the issued transcript version at generation and never recomputed
> (D-8). They remain columns on the leaf `Certificate` aggregate (no child tables).

> **Note on `verificationCode`:** it is generated at draft time so a code exists for
> the `CertificateVerification` row created on issue. It becomes *publicly resolvable*
> only once the certificate is `ISSUED` (a `DRAFT` verification lookup returns
> `NOT_FOUND`). See §11.

### Status (state machine — frozen)

`DRAFT` · `PENDING_APPROVAL` · `ISSUED` · `SUSPENDED` · `REVOKED` · `STALE`

```
DRAFT ─────────────► PENDING_APPROVAL ─────► ISSUED
   │                                            │
   └──────────────── (issue) ───────────────────┤
                                                 │
                        ┌────────────────────────┼───────────────────────┐
                        ▼                         ▼                        ▼
                    SUSPENDED ◄──────────────►  STALE                  REVOKED
                        │        (policy)         │                    (terminal)
                        └────► ISSUED ◄───────────┘
                            (restore, if valid)
```

Transition semantics (frozen):

- **`REVOKED` is terminal** — a revoked certificate never returns. Revocation
  changes historical truth (the act is annulled) and is permanent.
- **`STALE` is recoverable** — set only by the transcript-invalidation subscriber
  (§18). It may return to `ISSUED` only by explicit reissue against a still-valid
  transcript version, or be escalated to `SUSPENDED`/`REVOKED` per policy.
- **`SUSPENDED` is recoverable** — may return to `ISSUED` via `RestoreCertificate`
  when policy allows and the transcript is still valid.
- **`ISSUED` may become `STALE`** — when its linked transcript version is
  superseded/revoked (never silently regenerated, never silently re-issued).
- **Expiry does NOT appear in this machine** — an expired certificate stays `ISSUED`
  (D-6). Expiry is a *verification projection* concern only (§11, §18-note).

### Rules

- Issued certificate is **immutable** (only status-transition + stale/verification
  bookkeeping columns may change; content columns are frozen).
- Revocation never deletes.
- `certificateNumber` assigned **only on issue** (never on draft, never reassigned).
- References the **exact** transcript version; never follows transcript updates automatically.

### Relationships

`organization`, `student`, `enrollment?`, `course?`, `policy?`
(`certificatePolicyId`), `template?` (`certificateTemplateId`), `verification` (1:1),
`exports` (1:*), `events` (1:*), `requestsFulfilled` (`CertificateRequest[]`).
`transcriptVersionId` is a pure **id pointer** — **no** Prisma relation, no cascade —
so a transcript supersession/regeneration/deletion can never `NoAction`-block or
mutate an issued certificate. `certificatePolicyId` / `certificateTemplateId` are
modelled as `NoAction` relations (config referential integrity, distinct from the
transcript snapshot pointer).

### Indexes

`@@index([organizationId, studentId])`, `([organizationId, enrollmentId])`,
`([organizationId, courseId])`, `([organizationId, transcriptVersionId])`,
`([organizationId, certificateType])`, `([organizationId, status])`,
`([organizationId, issuedAt])`, `([organizationId, expiresAt])` (expiry sweep),
`([organizationId, deletedAt])`.
Filtered unique: `(organizationId, certificateNumber)` where `certificateNumber IS NOT NULL AND deletedAt IS NULL`.
Filtered unique: `(verificationCode)` (global) where `verificationCode IS NOT NULL AND deletedAt IS NULL`.
Filtered unique (duplicate prevention): `(organizationId, transcriptVersionId, certificateType)`
where the certificate is active — logically `status IN ('DRAFT','PENDING_APPROVAL','ISSUED','SUSPENDED') AND deletedAt IS NULL`,
authored in SQL Server as `status <> 'REVOKED' AND status <> 'STALE' AND deletedAt IS NULL` (filtered predicates cannot use `IN`), so a reissue after revoke/stale is allowed.

---

## 8. Certificate Versioning — DECISION

**Chosen: Option A — the certificate is immutable; a correction is a NEW certificate.**

Rationale:
- The transcript is already versioned; each certificate pins one transcript version.
- A "corrected" certificate almost always means "the underlying record changed" →
  that is a *new transcript version* → a *new certificate*, with the prior one
  `REVOKED`/`STALE`. Superseding chains are represented by the `staleReason` +
  events, not by an internal version tree.
- Over-versioning the certificate duplicates the transcript's versioning with no
  regulatory upside today.

If a regulator later mandates certificate-internal versioning, that is a **new ADR**;
`CertificateVersion` would then mirror `AcademicTranscriptVersion` exactly.

---

## 9. CertificateEvent (append-only history)

### Events

`certificate.generated` · `certificate.approved` · `certificate.issued` ·
`certificate.revoked` · `certificate.suspended` · `certificate.restored` ·
`certificate.marked_stale` · `certificate.exported` · `certificate.verified`

### Fields

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `organizationId` | `String` | |
| `certificateId` | `String` | FK (`NoAction`) |
| `eventType` | `String` | one of the above |
| `previousStatus` | `String?` | |
| `newStatus` | `String?` | |
| `actorId` | `String?` | null for system/auto events |
| `reason` | `String? @db.NVarChar(Max)` | |
| `metadata` | `String? @db.NVarChar(Max)` | JSON (e.g. `{certificateNumber, checksum, transcriptVersionId}`) |
| `createdAt` | `DateTime @default(now())` | |

Indexes: `@@index([organizationId, certificateId])`, `@@index([organizationId, createdAt])`.
Append-only — rows are never updated or deleted.

---

## 10. CertificateExport

**Purpose:** track PDF/API/Ministry artifacts. Mirrors `AcademicTranscriptExport`.

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `organizationId` | `String` | |
| `certificateId` | `String` | FK (`NoAction`) |
| `exportType` | `String` | `PDF` \| `API` \| `MINISTRY` |
| `fileUrl` | `String?` | |
| `fileChecksum` | `String?` | checksum of the *rendered file*, not the certificate content |
| `status` | `String @default("PENDING")` | `PENDING` \| `READY` \| `FAILED` |
| `exportedBy` | `String?` | |
| `exportedAt` | `DateTime?` | |
| `createdAt` | `DateTime @default(now())` | |

Rules: exports may be produced only for an `ISSUED` certificate (a `STALE`/`SUSPENDED`
certificate export is blocked or watermarked per policy). Index:
`@@index([organizationId, certificateId])`.

---

## 11. CertificateVerification (public)

**Purpose:** public verification surface. **1:1** with a certificate; created at issue.

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `organizationId` | `String` | |
| `certificateId` | `String` | FK (`NoAction`), unique |
| `verificationCode` | `String` | **globally unique** (not per-org — the public URL has no tenant context) |
| `publicStatus` | `String @default("VALID")` | `VALID` \| `REVOKED` \| `SUSPENDED` \| `EXPIRED` \| `NOT_FOUND` |
| `verificationCount` | `Int @default(0)` | |
| `lastVerifiedAt` | `DateTime?` | |
| `expiresAt` | `DateTime?` | operational-validity end (copied from the certificate); drives the expiry sweep (D-6) |
| `createdAt / updatedAt` | timestamps | |

`publicStatus` is a **projection** of the certificate status kept in sync by the
lifecycle commands (issue → `VALID`; revoke → `REVOKED`; suspend → `SUSPENDED`;
expiry sweep → `EXPIRED`). A `DRAFT`/`PENDING_APPROVAL` certificate has **no** public
verification row (public lookup ⇒ `NOT_FOUND`).

### Answers

- **Public endpoint?** Yes — unauthenticated `GET /verify/[code]` (added to
  `PUBLIC_PATHS` in `src/proxy.ts`). No tenant context in the URL — resolution is by
  globally-unique code only.
- **QR code?** Yes — the exported PDF embeds a QR to `verificationUrl`. QR content is
  the public URL only, never PII.
- **Rate limiting?** Yes — per-IP + per-code throttle on the public endpoint
  (constant-time-ish behaviour; unknown codes cost the same as known ones to avoid
  enumeration signals). `verificationCount`/`lastVerifiedAt` are updated
  best-effort, out of the hot authorization path.
- **Privacy-safe response?** Yes — see §22. Minimal fields only.

Indexes: unique `(certificateId)`, unique `(verificationCode)`;
`@@index([organizationId, publicStatus])`, `@@index([organizationId, lastVerifiedAt])`,
`@@index([organizationId, expiresAt])` (expiry sweep).

---

## 12. CertificateRequest (recommended — include)

**Purpose:** student/guardian/admin request workflow feeding generation.

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `organizationId` | `String` | |
| `studentId` | `String` | FK (`NoAction`) |
| `enrollmentId` | `String?` | FK (`NoAction`) |
| `courseId` | `String?` | FK (`NoAction`) |
| `transcriptVersionId` | `String?` | **id pointer**; optional (may be resolved at review) |
| `certificateType` | `String` | |
| `requestedBy` | `String` | userId |
| `status` | `String @default("PENDING")` | `PENDING` \| `APPROVED` \| `REJECTED` \| `FULFILLED` \| `CANCELLED` |
| `reason` | `String? @db.NVarChar(Max)` | |
| `reviewedBy` | `String?` | |
| `reviewedAt` | `DateTime?` | |
| `fulfilledCertificateId` | `String?` | **id pointer** to the resulting certificate |
| `createdAt / updatedAt` | timestamps | |

Indexes: `@@index([organizationId, studentId])`, `@@index([organizationId, status])`.
Mirrors `AcademicTranscriptRequest` exactly.

---

## 13. Certificate Types — official vs informal

```
CertificateType (const object; values never translated):
  COURSE_COMPLETION · LEVEL_COMPLETION · PARTICIPATION · ATTENDANCE ·
  ACHIEVEMENT · PROFESSIONAL_TRAINING · DRIVING_SCHOOL · LANGUAGE_COURSE ·
  IT_COURSE · DESIGN_COURSE
```

**Recommended classification** (a `classification` attribute in the type registry,
not a DB enum — drives default policy gates and default numbering prefix):

| Classification | Types | Default gates |
|---|---|---|
| **OFFICIAL** (certificate) | `COURSE_COMPLETION`, `LEVEL_COMPLETION`, `PROFESSIONAL_TRAINING`, `DRIVING_SCHOOL`, `LANGUAGE_COURSE`, `IT_COURSE`, `DESIGN_COURSE` | `requiresIssuedTranscript`, `requiresCourseCompleted` (or level-completed), no pending required subjects |
| **STATEMENT** (informal / declaratório) | `PARTICIPATION`, `ATTENDANCE`, `ACHIEVEMENT` | `requiresIssuedTranscript` only; no completion gate |

This is a **default** encoded in seed policies; an organization may tighten/relax via
its own `CertificatePolicy` rows. Classification never bypasses the source-of-truth
rule — a `PARTICIPATION` statement still reads its facts from an issued transcript.

---

## 14. Eligibility flow

`EvaluateCertificateEligibilityCommand` (read-only; **no writes, no academic recompute**)

**Input:** `{ transcriptVersionId, certificateType, courseId? }`

**Flow (frozen — D-3):**
1. **Load Transcript** — the `AcademicTranscriptVersion` (read-only transcript reader), tenant-scoped.
2. **Load Policy** — resolve the `CertificatePolicy` (§5 resolution order); also load the parent `AcademicTranscript`.
3. **Load Finance Read Model** — *optional*; consulted only when the policy sets
   `requiresFinancialClearance`. This is a **non-academic** read (finance is not
   Academic Core, Rule C-2). Its result is captured for snapshotting at generation.
4. **Evaluate** — check each academic gate against **frozen snapshot facts only**,
   and the administrative gates (finance/manual-approval) against the external results.
5. **Return** `CertificateEligibilityDto`:
   `{ eligible, blockers[], warnings[], transcriptVersionId, policyId, financialClearance }`
   where `financialClearance = { status, checkedAt, reference? } | null`.

No academic recalculation occurs in any step.

**Blockers → the fact that produces them:**

| Blocker | Derived from (frozen fact) |
|---|---|
| `NO_POLICY_CONFIGURED` | no active policy resolved |
| `TRANSCRIPT_NOT_ISSUED` | `version.status !== ISSUED` |
| `TRANSCRIPT_REVOKED` | `version.status === REVOKED` |
| `TRANSCRIPT_SUPERSEDED` | `version.status === SUPERSEDED` (or root `needsRegeneration`) |
| `COURSE_NOT_COMPLETED` | `courseProgressSnapshot.status !== COMPLETED` (policy gate) |
| `PENDING_REQUIRED_SUBJECTS` | any snapshot subject `isRequired && status ∉ {PASSED, …terminal-pass}` (policy gate) |
| `FINANCIAL_CLEARANCE_REQUIRED` | finance read-model clearance flag is false (policy gate; **non-academic**, D-3 — snapshot the result into the certificate per Rule C-2) |
| `MANUAL_APPROVAL_REQUIRED` | policy `requiresManualApproval` (not a hard block — routes to `PENDING_APPROVAL`) |
| `CERTIFICATE_ALREADY_ISSUED` | an active certificate exists for `(transcriptVersionId, certificateType)` |

`MANUAL_APPROVAL_REQUIRED` is surfaced as a **warning/gate**, not a hard blocker: it
means "eligible, but must pass approval before issue." All other blockers are hard.

**No academic recalculation. No reads of Grade/Attendance/StudentAssessmentResult/
StudentSubjectProgress/StudentLevelProgress.**

### 14a. `CertificateEligibilitySource` — read-aggregation façade (ACL)

**Role.** The **single dependency** of the eligibility engine. It aggregates every
fact eligibility needs into one `CertificateEligibilityFacts` DTO so the engine
knows nothing about Prisma, the transcript schema, repositories, finance, or
org-settings storage. It is an Anti-Corruption + read-aggregation layer that
**loads facts and decides nothing** — there is no `eligible` flag anywhere in its
output.

- **Location:** `src/modules/certificates/services/certificate-eligibility-source.service.ts`
  (`loadCertificateEligibilityFacts`).
- **May read (only):** the Certificate **Policy** repository and the Transcript
  **source ACL** (§3a). No other repository, no transcript table, no other engine.
- **Input** `CertificateEligibilitySourceInput`: `organizationId`, `studentId`,
  `certificateType`, optional `transcriptVersionId` / `courseId` / `policyId`.
- **Output** `CertificateEligibilityFacts`: `{ policy, transcript, financialClearance,
  administrative, metadata }`.
  - `policy` — copied policy gates/settings, or `null`. **Read-only resolution:**
    explicit `policyId` loads exactly that policy (no fallback); otherwise a
    `courseId` override, then the org-default active policy. It never evaluates a policy.
  - `transcript` — the ACL DTO (§3a) for the pinned version, or `null` when absent/
    not found.
  - `financialClearance` — **`null` in Phase 3A** (finance integration is a future
    phase; the `FinancialClearanceFacts` interface is fixed now so the façade
    contract will not change).
  - `administrative` — **`{}` in Phase 3A** (future: disciplinary actions, org
    restrictions, external registries).
  - `metadata` — `{ loadedAt, sourceVersion }`.
- **Never throws for "not found"** (missing policy/transcript → `null`); repository
  errors propagate unchanged. **Never writes.** Accepts an optional
  `client?: PrismaClientOrTx`, passed straight through to the repositories.

### 14b. Eligibility flow & ownership (Phase 3B — frozen by Rules C-3/C-4/C-5/C-6)

The eligibility path has exactly one shape. Facts flow in one direction; the
decision is made in exactly one place; commands only orchestrate around it.

```
CertificateEligibilitySource
        │  loads facts (policy + transcript + finance + administrative)
        ▼
CertificateEligibilityFacts
        │
        ▼
CertificateEligibilityEngine
        │  evaluates facts against policy gates  (the ONLY decision point)
        ▼
EligibilityResult
        │
        ▼
GenerateCertificateCommand  ──▶  IssueCertificateCommand
        │  consume the result, then persist (repositories)
        ▼
persisted Certificate
```

**Dependency rule (frozen).** The only permitted edges are:

```
CertificateEligibilitySource ──▶ Policy Repository + Transcript ACL (+ Finance/Admin, future)
CertificateEligibilityEngine ──▶ CertificateEligibilitySource        (its ONLY read dependency)
GenerateCertificateCommand   ──▶ CertificateEligibilityEngine
IssueCertificateCommand      ──▶ CertificateEligibilityEngine
```

**Commands must never connect directly to** `PolicyRepository`, the Transcript ACL,
Finance, or administrative sources for the purpose of deciding eligibility — those
reads belong to `CertificateEligibilitySource`, and the decision belongs to
`CertificateEligibilityEngine`. (Commands still use the certificate-model
repositories to *persist* the outcome — that is orchestration, not a decision.)

**Ownership (frozen):**

- `CertificateEligibilityEngine` **owns every eligibility rule** — the single
  authority (Rule C-3), evaluating facts only (Rule C-4), as a **deterministic pure
  function** of `CertificateEligibilityFacts` (Rule C-6): no clock, randomness, DB, or
  external read inside the engine.
- **Commands own orchestration only** — they consume the `EligibilityResult` and
  execute it; they never decide (Rule C-5).
- **Repositories own persistence only** — no business-rule evaluation.

---

## 15. Generation flow

`GenerateCertificateDraftCommand`

1. Run eligibility (§14).
2. If hard-blocked → abort with the blockers.
3. If eligible and policy has no manual gate → create `Certificate (DRAFT)`.
   If `requiresManualApproval` → create `Certificate (PENDING_APPROVAL)`.
4. **Snapshot** the display facts from the transcript version into the three snapshot
   columns — `studentSnapshot` (student identity), `courseSnapshot` (course identity),
   `issueBasisSnapshot` (completion status + issue basis) — copied verbatim, never
   recomputed. Copy `transcriptNumber` + `transcriptChecksum`. Also
   **snapshot the administrative facts** (Rule C-2): `financialClearanceStatus` /
   `financialClearanceCheckedAt` / `financialClearanceReference` from the eligibility
   result. These are frozen and never recomputed later.
5. Generate `verificationCode` (not yet publicly resolvable).
6. **Do not** assign `certificateNumber`. **Do not** compute `checksum` yet.
7. Write `certificate.generated` event + audit (in-tx); publish domain event post-commit.

---

## 16. Issue flow

`IssueCertificateCommand` — mirrors `IssueTranscriptCommand` structure exactly.

Single `db.$transaction`:
1. Load certificate; require `DRAFT` or `PENDING_APPROVAL` (conditional/guarded).
2. **Re-check the transcript is still valid** in-tx: reload the version; require
   `status === ISSUED` **and** `checksum === certificate.transcriptChecksum`. If the
   transcript was superseded/revoked/regenerated since draft → abort with
   `TRANSCRIPT_NO_LONGER_VALID` (do not issue a stale certificate).
3. If `PENDING_APPROVAL`, require it was approved (or approve+issue in one authorized call).
4. Allocate `certificateNumber` via `allocateCertificateNumber(tx, {org, year})`
   (row-locked counter; §19) — first assignment only.
5. Set `status = ISSUED`, `issuedAt`, `issuedBy`, `expiresAt` (if `validityMonths`).
6. Compute and store `checksum` (§20).
7. **Create the `CertificateVerification` row** (`publicStatus = VALID`).
8. Write `certificate.issued` event + audit (in-tx).
9. Publish domain event **after commit**.
10. PDF/export is a **separate, later** action (`CertificateExport`), not part of issue.

Concurrency: conditional writes (`WHERE status = 'DRAFT'/'PENDING_APPROVAL'`) with
`count === 1` guards; the duplicate-prevention filtered index makes a concurrent
double-issue for the same `(transcriptVersionId, certificateType)` fail at the DB.

---

## 17. Revoke / Suspend / Restore flows

`RevokeCertificateCommand`
- `ISSUED | SUSPENDED | STALE → REVOKED`; **reason required**; `REVOKED` is terminal.
- Sets `revokedAt/By/Reason`; sets `CertificateVerification.publicStatus = REVOKED`.
- Never deletes. Event `certificate.revoked` + audit; publish post-commit.

`SuspendCertificateCommand`
- `ISSUED → SUSPENDED`; **reason required**; `publicStatus = SUSPENDED`.
- Restorable if policy allows.

`RestoreCertificateCommand`
- `SUSPENDED → ISSUED` (only if policy permits and transcript still valid);
  `publicStatus = VALID`. Event `certificate.restored`.

All follow the transcript command shape: single tx, conditional writes with count
guards, audit in-tx, domain event post-commit.

---

## 18. Stale handling (event-driven)

The engine **subscribes** to transcript domain events (it never polls or recomputes):

- `transcript.superseded`
- `transcript.revoked`
- `transcript.marked_stale` (and root `needsRegeneration = true`)

Handler `HandleTranscriptInvalidatedForCertificates`:
1. Find `ISSUED`/`SUSPENDED` certificates whose `transcriptVersionId` = the affected version.
2. For each, apply the policy's `onTranscriptInvalidated` behaviour:
   - **default → `STALE`** (set `staleReason`, `staleDetectedAt`); certificate stays
     auditable; `publicStatus` becomes `SUSPENDED` (safe default — "under review").
   - policy may specify `SUSPEND` or (rarely) `REVOKE` for regulated types.
3. Emit `certificate.marked_stale` (+ audit). **Never silently update content. Never
   auto-revoke unless the policy explicitly says so.**

A stale certificate is **not** re-pointed to the new transcript version — reissue is
an explicit `Generate → Issue` against the new version, producing a *new* certificate.

`onTranscriptInvalidated` policy attribute values: `MARK_STALE` (default) ·
`SUSPEND` · `REVOKE`.

> **Expiry sweep (D-6) — separate from staleness.** A scheduled job sets
> `CertificateVerification.publicStatus = EXPIRED` when `expiresAt` has passed. The
> certificate's own `status` **stays `ISSUED`** — the document was officially issued
> and that historical truth does not change; only its *operational validity* lapses.
> Expiry never enters the lifecycle state machine and never touches `Certificate.status`.

---

## 19. Numbering

Format: **`CERT-YYYY-NNNNNN`** (6-digit zero-padded sequence).

- Scoped to `(organizationId, year)` — **one shared sequence across all certificate
  types** (type is *not* part of the counter key nor the visible number), matching
  the transcript's per-org uniqueness model.
- Allocated **only at issue**, inside the issue transaction, via a row-locked
  `CertificateNumberCounter` (`@@unique([organizationId, year])`, `lastSeq Int`).
  Gap-tolerant: a revoked/superseded/stale certificate still burns its sequence.
- `allocateCertificateNumber(tx, {organizationId, year})` mirrors
  `allocateTranscriptNumber` line-for-line (findUnique → increment, else create seeded at 1).
- Counter rows are never deleted.

> **Resolved (D-2):** the canonical format is `CERT-YYYY-NNNNNN` with a single
> per-(org, year) counter — this is frozen. A *visible* type prefix (e.g.
> `DRV-2026-000001`) is permitted **only** if a regulator requires it, and even then
> the **counter key stays per-(org, year)** so numbers remain globally unique per
> org. The counter is never keyed by type.

---

## 20. Checksum

Content-only, via the existing `contentChecksum` (`@/shared/lib/checksum`) — the same
canonicalization (sorted keys, Decimal/number normalization, Date→ISO, array order
preserved). A dedicated `certificate-canonical-payload.service.ts` projects the
checksummed content, mirroring `transcript-canonical-payload.service.ts`.

**Checksummed content includes:**
`certificateNumber`, `transcriptVersionId`, `transcriptChecksum`, `studentSnapshot`,
`courseSnapshot`, `issueBasisSnapshot`, `certificateType`, `issuedAt`,
`certificatePolicyId`, `certificateTemplateId`.

**Excluded from checksum** (envelope/transport): `verificationCount`, `lastVerifiedAt`,
export rows, `updatedAt`, stale/suspend bookkeeping.

**Decisions (frozen — D-7):**
- **Generated once, on issue** — the checksum is computed in the `IssueCertificate`
  transaction and stored on the row. It is **never recomputed** for an existing
  certificate (an immutable certificate has immutable content; a change means a new
  certificate).
- **Content-only checksum now** — deterministic, no secret mixed in.
- **Digital signature later** — a signed, tamper-evident digest (org key material) is
  a separate future phase and must **not** reuse the content checksum as if it were a
  signature (same discipline documented in `@/shared/lib/checksum`).

Including `issuedAt` in the checksum makes each issued certificate's digest unique
even for identical content — acceptable because the certificate is a point-in-time
official act (unlike the transcript, whose checksum deliberately excludes timestamps
to detect content equality across regenerations).

---

## 21. RBAC

New `PERMISSIONS` (added to `@/server/auth/permissions`):

```
certificates.view · certificates.viewOwn · certificates.generate ·
certificates.issue · certificates.revoke · certificates.suspend ·
certificates.export · certificates.verify · certificates.request ·
certificatePolicies.manage · certificateTemplates.manage
```

Role mapping (extends the existing `ROLE_PERMISSIONS` arrays; `certificates.verify`
is effectively public via the unauthenticated endpoint but the permission exists for
authenticated staff verification tooling):

| Role | Permissions |
|---|---|
| `ORG_ADMIN` | all of the above |
| `SECRETARY` | `view`, `generate`, `export`, `request`, `verify`; **`issue` only if org grants it via a custom role** (mirrors transcript `issue` staying admin-only by default) |
| `STUDENT` | `viewOwn`, `request` |
| `GUARDIAN` | linked-student certificates only (`viewOwn`-equivalent, gated by `GuardianStudent` visibility flags), `request` if allowed |
| `TEACHER` | no issue/revoke/suspend; optional **scoped** `view` only (via `resolveDataAccessScope`) |
| `SUPER_ADMIN` | tenant-safe admin (all, minus tenant-scoped guards enforced in repos) |

Authorization always via `getUserPermissions` + `createAbility(perms).can(...)` in
each command's `authorize()`. Never branch on raw role strings.

---

## 22. Security

- `organizationId` comes from `ServiceContext` only — never from client input.
- Every repository query scoped by `organizationId` (multi-tenant row-level isolation).
- **Public verification is minimal and privacy-safe** — the response contains only:
  - `certificateNumber`
  - `status` (`VALID` \| `REVOKED` \| `SUSPENDED` \| `EXPIRED` \| `NOT_FOUND`)
  - student **display name** (masked per org privacy setting, e.g. "João M.")
  - `courseName`
  - `issuedAt`
  - `organizationName`
- **Never expose transcript details, grades, subjects, attendance, IDs, or checksums
  publicly.**
- Rate-limit the public verification endpoint (per-IP + per-code); unknown codes
  return `NOT_FOUND` with the same shape/latency profile to resist enumeration.
- Revoked/suspended/stale certificates remain fully **auditable** (never deleted).
- Upload assets (template images, exported PDFs) validated server-side (type/size/
  ownership) and scoped to the tenant, per the security standard.
- No stack traces / SQL / secrets in any error returned to a client (public or portal).

---

## 23. Domain Events

New `DomainEventType` entries (dot-namespaced; values never translated) + a new
`DomainAggregateType.CERTIFICATE`:

```
certificate.generated · certificate.approved · certificate.issued ·
certificate.revoked · certificate.suspended · certificate.restored ·
certificate.marked_stale · certificate.exported · certificate.verified
```

Published **only after transaction commit** (same as transcript commands).

**Consumers (existing infrastructure):** notifications center, student timeline,
audit, public verification projection, student portal, guardian portal.

**Subscriptions (this engine as consumer):** `transcript.superseded`,
`transcript.revoked`, `transcript.marked_stale` (→ stale handling, §18); optionally
`transcript.issued` (→ auto-issue when `autoIssueOnTranscriptIssued`).

---

## 24. Audit

Append-only `auditService.log(...)` calls **inside** each command's transaction for:
generated · eligibility-evaluated (optional, low-noise) · approved · issued ·
revoked · suspended · restored · exported · verified · marked-stale ·
policy-changed · template-changed.

`CertificateEvent` (§9) is the domain-level append-only history; `auditLog` is the
cross-cutting audit trail. Both are written, mirroring the transcript engine.

---

## 25. DTOs

Read from the **Certificate** aggregate (its frozen `studentSnapshot` /
`courseSnapshot` / `issueBasisSnapshot` columns), **never from the Transcript
directly**:

- `CertificateSummaryDto` — `{ id, certificateNumber, certificateType, status, studentName, courseName, issuedAt, expiresAt }`
- `CertificateDetailDto` — summary + `{ certificatePolicyId, certificateTemplateId, transcriptNumber, verificationUrl, issueBasis, staleReason?, revokeReason?, events[] }` (`issueBasis` projected from `issueBasisSnapshot`; no transcript internals)
- `CertificateEligibilityDto` — `{ eligible, blockers[], warnings[], transcriptVersionId, policyId, financialClearance: { status, checkedAt, reference? } | null }`
- `CertificateVerificationDto` — the minimal public shape (§22)
- `CertificateExportDto` — `{ id, exportType, status, fileUrl?, exportedAt? }`
- `CertificateRequestDto` — `{ id, studentId, certificateType, status, requestedBy, reviewedBy?, fulfilledCertificateId? }`

---

## 26. SQL Server constraints (per convention)

- `certificateNumber` **nullable until issue**; **filtered** unique index
  `(organizationId, certificateNumber) WHERE certificateNumber IS NOT NULL`
  (nullable + unique on SQL Server requires a *filtered* index, authored in the
  migration SQL — not a plain `@unique`).
- `verificationCode` unique (global) — also a filtered unique index if left nullable
  on the certificate; the `CertificateVerification.verificationCode` is `NOT NULL` unique.
- **Filtered unique — one active certificate per `(org, transcriptVersionId, certificateType)`**
  logically `WHERE status IN ('DRAFT','PENDING_APPROVAL','ISSUED','SUSPENDED') AND deletedAt IS NULL`;
  authored as `status <> 'REVOKED' AND status <> 'STALE' AND deletedAt IS NULL` (SQL Server
  filtered predicates cannot use `IN`), so reissue after revoke/stale is allowed.
- Policy/template active-uniqueness via filtered indexes (§5, §6): **org-default**
  (`courseId IS NULL`) **and per-course-override** (`courseId IS NOT NULL`) variants,
  so the "most specific wins" resolution can never match two active rows at either level.
- **No cascade from transcript** — `transcriptVersionId` is a pure id pointer (no
  relation). `certificatePolicyId`/`certificateTemplateId` are modelled relations for
  config integrity. All modelled Prisma relations use `onDelete: NoAction, onUpdate: NoAction`.
- Long text/JSON columns use `@db.NVarChar(Max)`; percentages/grades in snapshots use
  `@db.Decimal(5,2)` if any are stored (mostly they live inside the JSON snapshot columns).
- Migration authoring reminders (project gotchas): split `ALTER TABLE ADD COLUMN`
  from same-batch references; use filtered indexes for nullable-unique.
- Indexes as listed per model (§5–§12), all leading with `organizationId`.

---

## 27. Test plan

Unit/integration (Vitest), mirroring the transcript module's fake-db + fixtures:

1. Eligible issued transcript → generates certificate `DRAFT`.
2. Transcript not issued → blocker `TRANSCRIPT_NOT_ISSUED`, no draft.
3. Revoked transcript → blocker `TRANSCRIPT_REVOKED`.
4. Superseded transcript → blocker `TRANSCRIPT_SUPERSEDED` (+ `needsRegeneration` path).
5. Pending required subjects with `requiresNoPendingSubjects` → `PENDING_REQUIRED_SUBJECTS`.
6. `certificateNumber` is null on draft; assigned only on issue; never reassigned.
7. Issue creates exactly one `CertificateVerification` (`publicStatus = VALID`).
8. Revoke sets `publicStatus = REVOKED`; certificate not deleted; auditable.
9. Public verification response hides all sensitive data (no grades/subjects/IDs/checksum).
10. Engine never recalculates grades (assert no grade computation; snapshot values copied verbatim).
11. Engine never imports/reads Grade Engine or `StudentAssessmentResult` (architecture-guard test, like `architecture-guards.test.ts`).
12. Certificate references the transcript **snapshot** (copied `transcriptNumber`/`transcriptChecksum`), not live progress.
13. Transcript superseded → linked certificate marked `STALE` (default), `publicStatus = SUSPENDED`; not silently updated.
14. Duplicate prevention: second active certificate for same `(transcriptVersionId, certificateType)` fails.
15. Cross-tenant access blocked (org B cannot read/issue org A's certificate).
16. Student sees own certificates only (`viewOwn`).
17. Guardian sees linked-student certificates only (visibility flags).
18. Issue permission enforced (`certificates.issue`); SECRETARY without grant → `AuthorizationError`.
19. Revoke permission enforced (`certificates.revoke`).
20. Checksum stable: same content → same digest; changing any checksummed field → different digest; excluded fields (verificationCount, updatedAt) → unchanged digest.
21. Issue re-checks transcript validity in-tx: transcript superseded between draft and issue → `TRANSCRIPT_NO_LONGER_VALID`, no number burned incorrectly.
22. Numbering: gap-tolerant, per-(org, year), concurrent issues serialize (no duplicate numbers).
23. Financial clearance (D-3): `requiresFinancialClearance` policy consults the finance read-model; result is **snapshot** onto the certificate (`financialClearanceStatus`/`CheckedAt`) and is **not** re-read/recomputed after issue; finance-not-cleared → `FINANCIAL_CLEARANCE_REQUIRED` blocker.
24. Expiry (D-6): after `expiresAt`, `CertificateVerification.publicStatus = EXPIRED` while `Certificate.status` **stays `ISSUED`** (no lifecycle transition).
25. `REVOKED` is terminal (no restore path); `SUSPENDED`/`STALE` are restorable to `ISSUED` only when the transcript is still valid.

---

## 28. Resolved decisions (v1.0 freeze — 0 open)

All previously-open decisions are now **closed and binding**. No architectural
question remains unresolved.

| # | Decision | Resolution (frozen) |
|---|---|---|
| **D-1** | Certificate-internal versioning | **Option A — immutable; a correction is a NEW certificate.** No `CertificateVersion` model. Revisit only under a regulatory mandate (new ADR). |
| **D-2** | Visible type prefix in number | **`CERT-YYYY-NNNNNN`, single per-(org, year) counter.** A visible type prefix is permitted only under regulatory requirement, and even then the counter key stays per-(org, year). Never key the counter by type. |
| **D-3** | Financial clearance source | **Consult a finance read-model at eligibility time and SNAPSHOT the result onto the certificate** (`financialClearanceStatus` / `financialClearanceCheckedAt` / `financialClearanceReference`). Finance is **not** an academic fact and must never enter Academic Core / Grade Engine / Transcript Engine. The certificate never recalculates finance later. (Rule C-2.) |
| **D-4** | `onTranscriptInvalidated` default | **Default `MARK_STALE`** (`Certificate.status = STALE`, `publicStatus = SUSPENDED` — "under review"). Policy may specify `SUSPEND` or `REVOKE` for regulated types. Never silently regenerated, never silently re-issued. |
| **D-5** | Auto-issue safety | `autoIssueOnTranscriptIssued` proceeds **only** when the policy has no manual/financial gate; otherwise it produces a `PENDING_APPROVAL`. Frozen. |
| **D-6** | Expiry handling | **Expiry affects VERIFICATION ONLY.** `Certificate.status` stays `ISSUED`; a scheduled sweep sets `CertificateVerification.publicStatus = EXPIRED` when `expiresAt` passes. There is **no `ISSUED → EXPIRED` lifecycle transition** — issuance is historical truth; expiry is operational validity. |
| **D-7** | Digital signature | **Content-only checksum, generated once on issue, never recomputed.** Cryptographic org signature is a later phase (key management out of scope for v1.0). |
| **D-8** | Snapshot shape vs child tables | **JSON snapshot columns on the leaf `Certificate` aggregate — no child tables.** Implemented (Phase 1) as **three** columns: `studentSnapshot` (`NVarChar(Max)`, required), `courseSnapshot` (`NVarChar(Max)`, nullable), `issueBasisSnapshot` (`NVarChar(Max)`, required). This refines the original single-`contentSnapshot` sketch into three purpose-scoped JSON columns while preserving the binding intent (leaf aggregate, no child tables, frozen at generation, never recomputed). Promote to child tables only if reporting later needs relational queries over certificate content (new ADR). |

---

## 29. Recommended implementation phases

> *Design only — the phases below are the proposed build order for a future
> implementation task, not work to start now.*

- **Phase 0 — Foundation:** ✅ **IMPLEMENTED (2026-07-07)** — see *Phase 0
  Implementation Notes* below.
- **Phase 1 — Schema + migration:** ✅ **IMPLEMENTED (2026-07-07)** — see *Phase 1
  Implementation Notes* below.
- **Phase 2 — Repositories (tenant-safe) + read-only transcript reader:** all scoped
  by `organizationId`; architecture-guard test forbidding Grade/Attendance imports.
  - **Part A — `CertificateTranscriptSourceRepository` (the ACL):** ✅ **IMPLEMENTED
    (2026-07-07)** — see §3a and *Phase 2, Part A Implementation Notes* below.
  - **Part B — certificate-model repositories** (policy/template/certificate/event/
    export/verification/request): ✅ **IMPLEMENTED (2026-07-07)** — see *Phase 2, Part B
    Implementation Notes* below.
- **Phase 3 — Eligibility source + policy/template resolution + canonical payload/checksum service.**
  - **Part A — `CertificateEligibilitySource` (read-aggregation façade):** ✅ **IMPLEMENTED
    (2026-07-07)** — see §14a and *Phase 3, Part A Implementation Notes* below.
  - **Part B — `CertificateEligibilityEngine`** (evaluates the façade's facts against
    the policy gates): ✅ **IMPLEMENTED (2026-07-07)** — pure/deterministic; governed by
    the frozen **Rules C-3/C-4/C-5/C-6** and the flow in §14b. See *Phase 3, Part B
    Implementation Notes* below.
- **Phase 4 — `EvaluateCertificateEligibilityCommand`** (read-only, snapshot-fact gates).
- **Phase 5 — `GenerateCertificateDraftCommand`** (snapshot, verification code, no number).
- **Phase 6 — `IssueCertificateCommand`** (number allocation, checksum, verification
  row, in-tx transcript re-check).
- **Phase 7 — Revoke / Suspend / Restore + stale-handling event subscriber.**
- **Phase 8 — Public verification endpoint** (rate-limited, minimal, added to `PUBLIC_PATHS`).
- **Phase 9 — Export pipeline (`CertificateExport`, PDF + QR)** and portal/backoffice UI.
- **Phase 10 — Auto-issue subscriber + `CertificateRequest` workflow.**

---

## 30. Source-of-truth rules (summary — binding)

1. The Certificate Engine **certifies**; it never **calculates**.
2. It reads **only issued transcript versions** + its own policy/template config
   (+ a non-academic finance read-model, snapshot per D-3 / Rule C-2).
3. It **never** reads Grade/Attendance engines, `StudentAssessmentResult`,
   `StudentSubjectProgress`, `StudentLevelProgress`, raw attendance, or
   `StudentCourseProgress` live.
4. It **pins** one transcript version by id + checksum and **never** follows
   transcript updates automatically.
5. Numbers/checksums/events/audit follow the frozen Transcript Engine discipline.
6. Any change to the Academic Core it depends on requires a **new ADR** — this engine
   does not get to reach past the Core.

---

## 31. Phase 0 — Implementation Notes (2026-07-07)

Phase 0 shipped **foundation contracts only**. No certificate business logic exists.

**Delivered:**

- **Domain events — declared only, not emitted, no handlers.** Added to
  `src/server/events/event-types.ts`: `certificate.generated` · `.approved` ·
  `.issued` · `.revoked` · `.suspended` · `.restored` · `.marked_stale` ·
  `.exported` · `.verified`, plus `DomainAggregateType.CERTIFICATE`.
- **Permissions — added to `src/server/auth/permissions.ts`** (`PERMISSIONS`):
  `certificates.{view,viewOwn,generate,issue,revoke,suspend,export,verify,request}`,
  `certificatePolicies.manage`, `certificateTemplates.manage`. Role mapping
  (`ROLE_PERMISSIONS`, from which the seed derives): SUPER_ADMIN/ORG_ADMIN get all
  automatically; SECRETARY gets `view/generate/export/request/verify` (**no**
  issue/revoke/suspend/manage — those stay admin-only by default, mirroring
  `transcripts.issue`); STUDENT gets `viewOwn/request`; TEACHER and GUARDIAN get
  none (guardian linked-student visibility comes later). No existing role weakened.
- **Constants — `src/modules/certificates/constants.ts`** (const objects, no DB
  enums): `CertificateType`, `CertificateStatus`, `CertificatePolicyStatus`,
  `CertificateTemplateStatus`, `CertificateRequestStatus`,
  `CertificateVerificationPublicStatus`, `CertificateExportType`,
  `CertificateExportStatus`, `CertificateEligibilityBlocker`,
  `FinancialClearanceStatus`, `StaleReason` (+ `CERTIFICATE_NUMBER_PREFIX`,
  `CERTIFICATE_CHECKSUM_VERSION`).
- **Foundation Zod schemas — `schemas/certificate.schema.ts`**: enum-only validators
  derived from the constants. **No** command/input schemas yet.
- **Numbering — `lib/certificate-number.ts`** + the **`CertificateNumberCounter`**
  Prisma model (the *only* model added in Phase 0): `formatCertificateNumber`
  (`CERT-YYYY-NNNNNN`) and the transactional `allocateCertificateNumber`. Counter key
  is `(organizationId, year)` with **no `certificateType`** (D-2) — it does not copy
  the transcript engine's old type-scoping bug. **No command allocates yet.**
- **Checksum contract — `lib/certificate-checksum.ts`**: `CertificateChecksumInput`
  shape + `certificateContentChecksum`, delegating to the shared
  `@/shared/lib/checksum`. Content-only, no PDF checksum, no digital signature (D-7).
- **Types — `types/index.ts`**: `FinancialClearanceSnapshot`,
  `CertificateEligibilityResult` contract shapes.
- **Module entry — `index.ts`** re-exporting the above.

**Tests (48, all passing):** constants (existence/values/no-duplicates) + events,
numbering (format/pad/increment/per-org independence/first-alloc conflict/no-type-in-key),
checksum (stability/field-sensitivity/date-normalization/null-preservation),
permissions (admin-all/secretary/student/teacher/guardian), and **architecture guards**
(no Grade Engine, no Attendance Engine, no Transcript write commands, no UI/React;
and **only `CertificateNumberCounter`** exists among certificate Prisma models).

**Explicitly NOT in Phase 0:** Certificate/Policy/Template/Event/Export/Verification/
Request models · eligibility · commands · repositories · services · UI · PDF/export ·
public verification endpoint. No Academic Core changes; no Transcript behaviour changes.

**Validation:** `prisma validate` ✔ · `prisma generate` ✔ · `tsc --noEmit` ✔ (0
errors) · `vitest run src/modules/certificates` ✔ (48/48) · `eslint` ✔. Full suite:
2506 pass, 1 pre-existing unrelated failure (teacher-portal deadline ordering).

**Ready for Phase 1: Certificate data model.**

---

## 32. Phase 1 — Implementation Notes (2026-07-07)

Phase 1 shipped the **data model only** (schema + migration). No repositories,
services, commands, eligibility, lifecycle logic, UI, API routes, event handlers,
or audit logic. No Academic Core or Transcript behaviour changes.

**Models added** (`prisma/schema.prisma`, all `@@map` snake_case, all rows carry
`organizationId`, all relations `onDelete: NoAction, onUpdate: NoAction`):
`CertificatePolicy`, `CertificateTemplate`, `Certificate`, `CertificateEvent`,
`CertificateExport`, `CertificateVerification`, `CertificateRequest`.
`CertificateNumberCounter` from Phase 0 is unchanged.

**Key modelling decisions (as frozen):**

- **Transcript is a POINTER, not a FK.** `Certificate.transcriptVersionId` (and
  `CertificateRequest.transcriptVersionId`) is a plain `String` column with **no**
  Prisma relation to `AcademicTranscriptVersion`, plus copied
  `transcriptNumber`/`transcriptChecksum`. A certificate survives supersession/
  deletion of the version and never follows transcript updates. No Certificate model
  references any Grade/Attendance/StudentProgress table (enforced by an
  architecture-guard test).
- **Three JSON snapshot columns, not one (D-8, refined).** Display facts are frozen
  into `studentSnapshot` (`NVarChar(Max)`, required), `courseSnapshot`
  (`NVarChar(Max)`, nullable), and `issueBasisSnapshot` (`NVarChar(Max)`, required) —
  purpose-scoped JSON columns on the leaf `Certificate` aggregate. This refines the
  original single-`contentSnapshot` sketch while preserving D-8's binding intent (leaf
  aggregate, no child tables, frozen at generation, never recomputed). D-8, §7, and
  §25 updated to match.
- **No `approvedAt`/`approvedBy` columns (M2 review decision).** Approval provenance is
  recorded **append-only via `CertificateEvent`** (`certificate.approved`, carrying
  `actorId` + `createdAt`), never as columns on `Certificate`. A later
  `PENDING_APPROVAL → ISSUED` command will require an approval event (or a policy rule
  that waives manual approval); the timestamp/actor of approval is read from that
  event. §7 updated to remove the columns and document this.
- **Administrative snapshot fields (D-3):** `financialClearanceStatus`
  (default `NOT_REQUIRED`), `financialClearanceCheckedAt`, `financialClearanceReference`
  live on `Certificate` — frozen at generation, never recomputed.
- **Expiry via verification projection (D-6):** `Certificate.expiresAt` records the
  operational-validity end (indexed `([organizationId, expiresAt])`);
  `CertificateVerification.expiresAt` mirrors it (also indexed) and drives the sweep
  that sets `publicStatus = EXPIRED` while `Certificate.status` stays `ISSUED`. Expiry
  is not a lifecycle status.
- **Course-config relations:** `CertificatePolicy.courseId` and
  `CertificateTemplate.courseId` are FK relations to `Course` (with back-relations)
  for the optional per-course override — config referential integrity (distinct from
  the snapshot pointer used for the transcript).
- **Template `language` default is `pt-PT`** (L1), matching the project locale
  convention and the template default/override filtered-unique indexes that group by
  `language`.
- **`CertificateVerification` is 1:1** with `Certificate` (`certificateId @unique`),
  with a globally-unique `verificationCode @unique`.

**Migration** `prisma/migrations/20260707130000_certificate_engine_models/`
(hand-finished SQL Server, `BEGIN TRY / BEGIN TRAN`, tables → indexes → FKs → filtered
UNIQUE indexes). **Seven** **filtered UNIQUE** indexes are migration-only (Prisma
cannot express them — expected introspection drift):
`certificate_policies_org_default_active_key` (one ACTIVE org-default policy per type,
`courseId IS NULL`), `certificate_policies_org_course_override_active_key` (one ACTIVE
per-course-override policy per `(org, type, courseId)`, `courseId IS NOT NULL` — H1
fix), `certificate_templates_org_default_active_key` (per type+language,
`courseId IS NULL`), `certificate_templates_org_course_override_active_key` (per
`(org, type, courseId, language)`, `courseId IS NOT NULL` — H1 fix),
`certificates_org_certificate_number_key` (number unique per org among live numbered
rows), `certificates_verification_code_key` (global, live rows),
`certificates_active_per_transcript_type_key` (one active certificate per
`(org, transcriptVersionId, certificateType)` — active excludes `REVOKED` and
`STALE`, expressed as `status <> 'REVOKED' AND status <> 'STALE'` since SQL Server
filtered predicates cannot use `IN`, so a reissue after revoke/stale is allowed). The
two course-override indexes guarantee the §5/§6 "most specific wins" resolution can
never match two active rows.

**Review fixes applied (Phase 1 re-review):** H1 (course-override filtered-unique
indexes added), M1 (snapshot columns documented — D-8/§7/§25), M2 (approval via
`CertificateEvent`; no `approvedAt`/`approvedBy`), L1 (template `language` → `pt-PT`),
L4 (`([organizationId, expiresAt])` indexes on `Certificate` and
`CertificateVerification`). No business logic added.

**Validation:** `prisma validate` ✔ · `prisma generate` ✔ · `tsc --noEmit` ✔ (0
errors) · `vitest run src/modules/certificates` ✔ (50/50) · `eslint` ✔. Migration
authored but **not applied** to a live DB in this phase.

**Ready for Phase 2: Repositories (tenant-safe) + read-only transcript reader.**

---

## 33. Phase 2, Part A — Implementation Notes (2026-07-07)

Part A shipped **only** the Transcript read adapter — the Anti-Corruption Layer
(§3a). No certificate-model repositories, eligibility, commands, events, audit,
lifecycle, PDF, verification, or UI. **No schema changes, no migrations.**

**Delivered:**

- **`CertificateTranscriptSourceRepository`** —
  `src/modules/certificates/repositories/certificate-transcript-source.repository.ts`.
  The only certificate-side component that names a transcript table. Read-only,
  tenant-scoped (`findFirst`/`findMany`/`count`, never `findUnique(id)`),
  transaction-aware (`client ?? getDb()`). Three methods:
  `findIssuedTranscriptVersionForCertificate` (ISSUED-only complete snapshot),
  `findTranscriptVersionSummary` (lightweight metadata, any status),
  `existsIssuedTranscript` (boolean). Returns `null` for missing/out-of-tenant/
  non-ISSUED — never throws; commands decide.
- **DTOs** — `src/modules/certificates/types/transcript-source.ts`:
  `TranscriptCertificateSourceDto` (+ level/subject/assessment/attendance row DTOs)
  and `TranscriptVersionSummaryDto`. These are the ONLY transcript-derived shapes the
  rest of the engine sees; no Prisma entity/relation/column leaks. Snapshot facts are
  copied verbatim (Decimal→number only); course identity/progress are un-nested from
  the transcript's `{ course, courseProgress }` JSON envelope into the separate
  `courseSnapshot` / `courseProgressSnapshot` fields.
- **Behavioural tests** (22) — status gating (ISSUED found; DRAFT/REVOKED/SUPERSEDED
  ignored), wrong-org → null, immutable snapshot, copy-exact checksum/number/student/
  course/progress, deterministic child ordering, transaction-client acceptance,
  DTO-only shape, and no persistence-key leakage; plus summary/exists behaviour.
- **Architecture guards** (10) — no Grade Engine, no Attendance Engine, no course
  completion, no certificate model repositories/commands, no event publisher, no
  audit service, no React/UI; and read-only enforcement (no `create/update/delete/
  upsert` calls, no raw SQL, no write-shaped export name).

**Validation:** `tsc --noEmit` ✔ (0 errors) · `vitest run src/modules/certificates`
✔ (82/82; +32) · `eslint` ✔. No schema/migration change.

**Ready for Phase 2, Part B: certificate-model repositories (tenant-safe).**

---

## 34. Phase 2, Part B — Implementation Notes (2026-07-07)

Part B shipped the **certificate-model repositories** — tenant-safe, **persistence
only**. No eligibility, commands, services, lifecycle transitions, generation,
issue/revoke/suspend/restore, event publishing, audit, checksum, number allocation,
PDF/export rendering, public-verification logic, UI/API, or Transcript reads (those
stay behind the ACL, §3a). **No schema changes, no migrations.**

**Repositories added** (`src/modules/certificates/repositories/`):
`certificate-policy`, `certificate-template`, `certificate`, `certificate-event`,
`certificate-export`, `certificate-verification`, `certificate-request`. Records &
filter types live in `src/modules/certificates/types/repository.ts` (no Prisma type
leaks; JSON snapshot columns carried as raw `string`).

**Global rules honoured:**

- **Tenant-scoped everywhere.** Every query includes `organizationId` and uses
  `findFirst` / `findMany` / `count` / `updateMany` — never `findUnique(id)`,
  `update(id)`, or `delete(id)`. Writes match `{ id, organizationId }`, so a foreign
  tenant's row yields `count: 0`.
- **No hard delete.** Soft delete only sets `deletedAt` (guarded to still-live rows;
  `softDeleteDraftCertificate` additionally restricts to `status = DRAFT`). Lists hide
  soft-deleted rows unless `includeDeleted` is set.
- **Transaction-aware.** Every method takes an optional `client?: PrismaClientOrTx`
  and falls back to `getDb()`.
- **Persistence only.** No lifecycle-transition *decisions*: `findDefaultActivePolicy`
  / `findCourseOverridePolicy` (and the template equivalents) are simple lookups
  mirroring the filtered-unique indexes; `findExistingActiveCertificate` matches the
  `certificates_active_per_transcript_type_key` predicate (active excludes REVOKED and
  STALE among live rows); `markCertificateStale` is a focused column setter with no
  source-status rule; update methods set only the columns they are given (a command
  supplies any number/checksum/status value — the repository computes none).
- **Event repository is append-only** — CREATE + READ only, no update/delete.
- **`findCertificateDetailById`** assembles the certificate + its append-only events,
  exports, and 1:1 verification via separate org-scoped reads (no Prisma relation
  include), keeping every child tenant-scoped.

**Tests (43 new)** across the seven repositories: tenant isolation (find/update/list
scoped), policy/template default + course-override lookups and soft-delete hiding,
certificate create / find-by-number / find-by-verification-code /
findExistingActiveCertificate (REVOKED+STALE excluded) / DRAFT-only soft delete /
detail assembly, append-only events ordered by `createdAt`, export status updates,
verification create/find/increment/status, and request status/soft-delete/list. Plus
**architecture guards** (tests 37–42): model repos read no Transcript table and never
import the ACL; no repository imports Grade/Attendance/course-completion/event-publisher/
audit/checksum/number-allocator/React; the ACL stays read-only; no repository hard-deletes;
the event repository is append-only; and no repository defines an
`issue/revoke/suspend/restore/approveCertificate` lifecycle helper.

**Validation:** `tsc --noEmit` ✔ (0 errors) · `prisma validate` ✔ ·
`vitest run src/modules/certificates` ✔ (125/125; +43) · `eslint` ✔. No schema or
migration change.

**Ready for Phase 3: Certificate Eligibility Engine.**

---

## 35. Phase 3, Part A — Implementation Notes (2026-07-07)

Part A shipped `CertificateEligibilitySource` — the **read-aggregation façade** (§14a)
the future `CertificateEligibilityEngine` will depend on. It is a loader, not a
decider: NO eligibility rules, NO grade/attendance/completion calculation, NO policy
evaluation, NO generation/issue/lifecycle, NO events, NO audit, NO checksum, NO
numbering, NO template selection, NO PDF/verification/UI. **No writes. No schema
changes, no migrations.**

**Delivered:**

- **Service** — `src/modules/certificates/services/certificate-eligibility-source.service.ts`
  (`loadCertificateEligibilityFacts` + `CERTIFICATE_ELIGIBILITY_SOURCE_VERSION`) and
  `services/index.ts`. Depends on **exactly two** sources: the Certificate Policy
  repository and the Transcript source ACL. Loads are sequential (transaction-safe);
  the returned fact set is frozen.
- **Contract** — `src/modules/certificates/types/eligibility-source.ts`:
  `CertificateEligibilitySourceInput`, `CertificateEligibilityFacts`,
  `CertificatePolicyFacts`, `FinancialClearanceFacts` (interface fixed now; value
  `null` this phase), `AdministrativeFacts` (`{}` this phase), and the metadata type.
  No `eligible` flag, no derived field.
- **Read-only policy resolution:** explicit `policyId` → that policy only (no
  fallback); else `courseId` override → org-default active. Missing policy/transcript
  → `null` (never throws); repository errors propagate.

**Tests (29):** 15 behavioural — explicit/override/default policy resolution,
policy-null when nothing resolves or an explicit id misses, transcript loaded through
the ACL, transcript-null when absent/not-found, transaction-client pass-through,
finance `null` + administrative `{}`, metadata populated, no derived verdict, frozen
DTO, policy facts expose only declared fields, and repository failures propagate —
plus 14 **architecture guards** (tests 16–23): imports only the Policy repo + the
Transcript ACL; no Grade/Attendance/course-completion/transcript-Prisma/event-publisher/
audit/command/PDF/storage/React imports; no DB writes/raw SQL; no write-shaped or
lifecycle export.

**Validation:** `tsc --noEmit` ✔ (0 errors) · `vitest run src/modules/certificates`
✔ (154/154; +29) · `eslint` ✔. No schema or migration change.

**Ready for Phase 3B: `CertificateEligibilityEngine` (evaluates these facts).**

---

## 36. Phase 3, Part B — Implementation Notes (2026-07-07)

Part B shipped `CertificateEligibilityEngine` — the **pure, deterministic decision
function** `evaluateCertificateEligibility(facts) → CertificateEligibilityResult`
(`src/modules/certificates/services/certificate-eligibility.engine.ts`). It is the
single eligibility authority (Rules C-3…C-6). **No data loading, no commands, no
persistence, no events/audit. No schema changes, no migrations.**

**Contract:**

- **Input** — `CertificateEligibilityFacts` (from the Phase 3A source), extended this
  phase with an optional `evaluationContext.evaluatedAt` and
  `AdministrativeFacts.alreadyIssued?`.
- **Output** — `CertificateEligibilityResult` (defined in `types/eligibility-source.ts`,
  replacing the unused Phase 0 placeholder): `{ eligible, blockingReasons[],
  warnings[], evaluatedPolicyId, evaluatedAt, facts }`. `eligible` is exactly
  `blockingReasons.length === 0`; warnings never block; `facts` is returned unchanged.
- New constants: `CertificateEligibilityBlocker.POLICY_NOT_FOUND` and the
  `CertificateEligibilityWarning` vocabulary (informational only).

**Blocking reasons** (all from copied facts — nothing recomputed):
`POLICY_NOT_FOUND` (no policy) · `TRANSCRIPT_NOT_ISSUED` (missing / DRAFT / non-issued)
· `TRANSCRIPT_REVOKED` · `TRANSCRIPT_SUPERSEDED` · `COURSE_NOT_COMPLETED`
(`requiresCourseCompleted` and `courseProgressSnapshot.status !== COMPLETED`) ·
`PENDING_REQUIRED_SUBJECTS` (`requiresNoPendingSubjects` and a required subject whose
copied status ∉ {PASSED, COMPLETED, PROMOTED}) · `FINANCIAL_CLEARANCE_REQUIRED`
(`requiresFinancialClearance` and clearance not `CLEARED`) · `MANUAL_APPROVAL_REQUIRED`
(hard gate, never auto-approved) · `CERTIFICATE_ALREADY_ISSUED`
(`administrative.alreadyIssued === true`). The transcript-status reason is
mutually-exclusive (one per status); other gates accumulate.

**Warnings** (non-blocking): `FINANCIAL_CLEARANCE_UNKNOWN` is emitted whenever the
clearance status is `UNKNOWN` — it blocks only when the policy requires clearance
(that is a separate blocker); on its own it is informational. (Expiry warnings are
deferred; the engine never reads the clock.)

**Determinism (Rule C-6):** the engine reads no DB/repository/service/clock/
randomness; `evaluatedAt` comes from `evaluationContext.evaluatedAt` else
`metadata.loadedAt`. Same facts → same result; it never mutates the input.

**Commands (later phases) must consume this result** and execute it — they must not
duplicate or re-check any gate (Rule C-5).

**Tests (32):** 24 behavioural (happy path; each blocker; optional-subject ignored;
finance null/NOT_CLEARED/UNKNOWN+warning/CLEARED; manual approval; already-issued;
multiple blockers; warnings-don't-block; `eligible === blockingReasons.length===0`;
`evaluatedPolicyId`; `evaluatedAt` from facts; facts returned unchanged; input not
mutated; deterministic) + 8 architecture guards (no Prisma/db, no repository, no
source/ACL/transcript-Prisma, no Grade/Attendance/course-completion, no
event/audit, no clock/randomness, no writes).

**Validation:** `tsc --noEmit` ✔ (0 errors) · `vitest run src/modules/certificates`
✔ (187/187; +32, +1 warnings-vocabulary) · `eslint` ✔. No schema or migration change.

**Ready for review before Phase 4.**
