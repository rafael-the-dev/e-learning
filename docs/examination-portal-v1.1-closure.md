# Examination Administration Portal — Architecture & Product Closure (v1.1.0)

> **This is the official closure document for the Examination Administration Portal.**
> It consolidates, at freeze time, what the module does, how it is built, why the key
> decisions were made, and what was intentionally left for v1.2. A maintainer picking
> this up 6–12 months from now should be able to understand and evolve the module from
> this document without re-discovering the architecture.

---

## 1. Introduction

| | |
|---|---|
| **Module** | Examination Administration Portal (admin/secretary surface of the Examination Engine) |
| **Version** | **v1.1.0** |
| **Status** | **Production Ready** (UX Audit #3 gate: *YES WITH MINOR UX DEBT*, Overall UX 7.4/10, 0 Critical / 0 High open) |
| **Date** | 2026-07-17 |
| **Backend** | Runs over the **frozen** Examination Engine (`examination-engine-v1.0`, [ADR-013](adr/ADR-013-examination-engine.md)). No engine behaviour, schema, or migration changed by the portal. |
| **Predecessor** | [Portal v1.0.0](releases/examination-portal-v1.0.0.md) (2026-07-11). v1.1.0 adds the Sprint 2.1 scalability/productivity work and the UX Audit #3 fixes. |

### Objective

Give administrators and secretaries a single, coherent workspace to run the **entire
official examination lifecycle** — from creating an exam period to integrating published
results into the gradebook — with tenant isolation, server-side RBAC, and a full audit
trail, and to do so **at scale** (validated to 300 candidates per session) without
operational degradation.

### Scope

**In scope:** the admin/secretary web portal — API routes, read services, DTOs, and the
React UI over the frozen engine. This is a **read + command surface only**.

**Out of scope (by design):** any engine behaviour change; Teacher/Student/Guardian exam
portals (student appeal creation is the only non-admin exam surface, and it lives in the
Student portal, not here); direct grade/transcript/certificate writes (the engine forbids
them — see §3).

---

## 2. Features

Everything the portal supports today, mapped to where it lives.

| Area | What it does | Route / component |
|---|---|---|
| **Dashboard** | KPIs, status summaries, actionable alerts (results awaiting review/approval, sessions awaiting publication, appeals to decide) | `/examinations` |
| **Periods** | List + lifecycle (open / lock / complete / cancel) + create; search + status filter | `/examinations/periods` |
| **Rooms** | List + create/edit + archive; capacity + "future sessions" decision-support column; context-aware archive warning | `/examinations/rooms` |
| **Sessions** | List + create; **detail workspace with 8 tabs** (see below) | `/examinations/sessions`, `/examinations/sessions/[id]` |
| **Invigilators** | Assign staff to a session with a role (CHIEF / INVIGILATOR / MARKER / OBSERVER) | Session → *Vigilantes* tab |
| **Candidate registration** | Register / register-with-override / withdraw / disqualify; searchable student + enrolment pickers | Session → *Candidatos* tab |
| **Eligibility** | Academic/administrative eligibility verdict surfaced per candidate (blockers/warnings); transparent, audited **override** with mandatory reason | Registration flow (engine's `ExaminationEligibilityEngine`) |
| **Attendance** | Roster + KPIs; one-tap PRESENT/ABSENT/LATE/EXCUSED/DISQUALIFIED with optimistic rollback; whole-session "mark all present"; correction with reason | Session → *Assiduidade* tab |
| **Results** | Inline draft entry/edit; official-result overlay; per-selection and whole-session lifecycle actions | Session → *Resultados* tab |
| **Result workflow** | DRAFT → SUBMITTED → REVIEWED → APPROVED → PUBLISHED (strict marker ≠ reviewer ≠ approver, enforced server-side) | *Resultados* + *Publicação* tabs |
| **Publication** | Readiness card with always-visible blockers; **publish (confirmed)** / retract (mandatory reason) | Session → *Publicação* tab |
| **Appeals** | List (searchable across deep joins) + detail with original→current-official comparison + decision panel (review / approve-with-revised-score / reject) | `/examinations/appeals`, `/examinations/appeals/[id]` |
| **Integration** | Per-result and whole-session integrate into the Grade Engine; reconcile; grade-component binding status; PT-PT state tiles | Session → *Integração* tab |
| **Operations** | Detection-only control panel: scheduling gaps, room/invigilator conflicts, integration-health KPIs; one search across all sections; names not UUIDs | `/examinations/operations` |
| **Bulk operations** | Bulk register (select-from-roster with pre-flight preview), bulk attendance (mark-all), bulk results (upsert/submit/review/approve), bulk integrate — each with a grouped skipped/failed summary in PT-PT | Session tabs + integration |
| **Search** | Server-side search across deep joins (sessions by course/level/subject/room; appeals by student/subject/session; candidates by name/number/enrolment; periods) | Filter bars + tab search |

**Session detail tabs:** Visão geral · Candidatos · Assiduidade · Resultados · Vigilantes ·
Publicação · Integração · Atividade (honest empty state — no activity read service is
exposed by the frozen engine).

---

## 3. Architecture

The portal is a strict layered stack. **The frontend decides nothing**: every action is
gated by a server-computed `allowedActions` flag, never by a status comparison in a
component (enforced by a static guard test — see §10, D2).

```
┌─────────────────────────────────────────────────────────┐
│  UI            React server pages + client tables/cards   │
│                (guarded by requirePermissionOrRedirect)   │
├─────────────────────────────────────────────────────────┤
│  API routes    ~50 thin routes under app/api/examinations │
│                auth → delegate → mapExaminationError      │
├───────────────────────────┬─────────────────────────────┤
│  Read services (GET)       │  Commands (POST/PATCH)        │
│  services/admin/*          │  BaseCommand.run():            │
│  + pure mapper (DTOs w/    │  validate → authorize →       │
│  allowedActions)           │  execute (ONE $transaction)   │
├───────────────────────────┴─────────────────────────────┤
│  Repositories   ONLY layer that imports Prisma;            │
│                 ALWAYS scoped by organizationId            │
├─────────────────────────────────────────────────────────┤
│  Prisma 7                                                  │
├─────────────────────────────────────────────────────────┤
│  SQL Server (String status columns; no native enums)      │
└─────────────────────────────────────────────────────────┘
```

Read and write are separated ([ADR-007](adr/ADR-007-read-write-separation.md)): GET goes
through batched, tenant-scoped read services and a pure DTO mapper (no N+1); mutations go
through the engine's commands. The org is always resolved server-side, never from the URL.

### Integrations — actual status at freeze

The portal/engine is a **bounded context** ([ADR-013](adr/ADR-013-examination-engine.md),
E-1). It consumes Academic Core facts but never owns them, and it never writes another
engine's tables. The honest integration status:

| Integration | Status | How |
|---|---|---|
| **Grade Engine** | **LIVE** | An injected adapter port (`integrations/production-ports.ts`, E-13). A PUBLISHED, bound, SCORED result is written through the **single grade writer** (`upsertStudentAssessmentResult` + `gradeMutationService`). The exam engine never writes grade tables directly. |
| **Student Progress / Progression** | **LIVE (indirect)** | The single grade mutation **cascades** subject → level → course progression; the exam side only **confirms** the resulting `StudentSubjectProgress` status (a read, never a re-run — avoids a double cascade). |
| **Audit** | **LIVE** | Every command writes an `ExamEvent` (transition ledger) **and** an `AuditLog` entry **inside the same transaction**. |
| **Transcript Engine** | **INDIRECT (downstream only)** | Exams never read or write transcripts. After a revision/retraction, staleness flows through Grade → Progression → Transcript supersession ([ADR-009](adr/ADR-009-stale-reactive-model.md)). |
| **Certificate Engine** | **INDIRECT (downstream only)** | Certificate STALE is reached via the Transcript, never by the exam engine ([ADR-002](adr/ADR-002-certificate-engine-architecture.md)). |
| **Outbox** | **NOT integrated (deferred, Phase 14)** | v1.1 has **no** async Outbox dispatch. Events are recorded synchronously in the `ExamEvent` ledger in-tx. |
| **Notifications** | **NOT integrated (v1.2+)** | The exam module emits no notifications today. There is no notification import in the module. |

> The last two rows deliberately correct the common assumption that publish/integrate
> "sends a notification" or "goes on a queue". At v1.1 they do not — they write a durable
> ledger row and (for integrate) call the Grade adapter synchronously.

---

## 4. Domain Model

14 Prisma models (`exam_*` tables), all tenant-scoped by `organizationId`, all status
columns are `String` (no native enums — [ADR-013](adr/ADR-013-examination-engine.md)).
Only `organizationId` and intra-engine parents are real FKs; pointers to Grade/User/Teacher
internals are **plain string columns** to preserve the bounded-context boundary.

| Entity | Responsibility | Key invariants | Main relationships |
|---|---|---|---|
| **ExamPeriod** | Exam calendar container | Lifecycle DRAFT→OPEN→LOCKED→COMPLETED (or CANCELLED); sessions live inside its window | → ExamSession (1:N) |
| **ExamRoom** | Physical exam venue (local v1 model, D11) | Capacity ≥ 0; at most one active room per `(org, code)` (filtered-unique); cannot be archived with future sessions | → ExamSession (1:N) |
| **ExamSession** | A scheduled sitting of one `levelSubject` | Lifecycle DRAFT→SCHEDULED→LOCKED→IN_PROGRESS→COMPLETED→RESULTS_RECORDED→PUBLISHED (or CANCELLED); belongs to a period; capacity bounds registration | → Period, Room?, LevelSubject; Candidates, Invigilators, Incidents, Publications, Bindings |
| **ExamAttempt** | First-class re-sit unit (D12) | `attemptNumber` filtered-unique per `(org, enrolment, levelSubject)`; explicit, never implied | → Candidates, Results |
| **ExamCandidate** | A student registered (or pending) for a session | At most one active candidate per `(org, session, student)`; carries eligibility verdict + optional audited override | → Session, Attempt, Student, Enrolment; Attendance?, Result? |
| **ExamAttendance** | Exam attendance fact (SEPARATE from class attendance, E-10) | 1:1 with candidate; PRESENT/ABSENT/LATE/EXCUSED/DISQUALIFIED; never mutates the Attendance Engine | ↔ ExamCandidate (1:1) |
| **ExamResult** | The official exam fact | 1:1 with candidate; PUBLISHED is **immutable** (never mutated in place); `currentRevisionId` points to the current revision; SCORED requires numeric score | → Candidate, Attempt, Student, Enrolment, LevelSubject; Revisions, Appeals |
| **ExamResultRevision** | Append-only post-publication correction (D14) | Exactly one CURRENT revision per result (filtered-unique); `revisionNumber` unique per result | → ExamResult (N:1) |
| **ExamAppeal** | Student recourse against a published result | Ownership enforced server-side; PENDING→UNDER_REVIEW→APPROVED/REJECTED→CLOSED; approval creates a revision, never a rewrite | → Result, Student |
| **ExamPublication** | The visibility boundary (E-7, per session, D9) | DRAFT→PUBLISHED→RETRACTED; retraction is a pre-integration escape hatch, never a delete | → Session |
| **ExamIncident** | Exam-room incident record | Severity LOW/MEDIUM/HIGH/CRITICAL; type from an extensible vocabulary | → Session, Candidate? |
| **ExamInvigilatorAssignment** | Staff on a session with a role | Filtered-unique per `(org, session, teacher)` and `(org, session, user)`; teacher/user are plain pointers, not relations | → Session |
| **ExamEvent** | Transition/audit event ledger (§8) | Append-only; `(aggregateType, aggregateId, eventType)`; written in-tx | → Organization |
| **ExamGradeComponentBinding** | Canonical exam→grade-component mapping (ADR-014) | At most one active binding per session; **no heuristic fallback** — an unbound session integrates as UNSUPPORTED | → Session |

---

## 5. Flows

### 5.1 Primary operational flow (per session)

```
Create period → Create session → Assign room → Assign invigilators
   → Register candidates (override if needed) → Mark attendance
   → Enter results → Submit → Review → Approve → Publish → Integrate → Operations
```

- Period, room, and session creation are one-dialog actions from their list pages.
- Room is chosen at session creation (folded into the create step).
- Candidate registration, attendance, results, publication, and integration all happen
  **inside the session detail workspace** (tabbed, no full-page reloads; directed refetch
  per surface).
- Operations is the org-wide detection sweep that closes the loop (spot gaps/conflicts and
  jump straight to the session that needs fixing).

### 5.2 Appeal flow (post-publication)

```
Student files appeal (Student portal) → Secretary/Admin reviews → Approve (revised score)
   → append-only ExamResultRevision becomes CURRENT (published original preserved)
      → downstream staleness (Grade → Progression → Transcript → Certificate)
   OR Reject (mandatory reason)
```

---

## 6. State Machines

All values are English domain strings (never translated; PT-PT is render-layer only).

**ExamPeriod:** `DRAFT → OPEN → LOCKED → COMPLETED`; `→ CANCELLED` from non-terminal.

**ExamSession:** `DRAFT → SCHEDULED → LOCKED → IN_PROGRESS → COMPLETED → RESULTS_RECORDED → PUBLISHED`; `→ CANCELLED` from non-terminal.

**ExamAttempt:** `OPEN → SAT → RESULTED`; `→ ABANDONED`.

**ExamCandidate:** `PENDING_ELIGIBILITY → ELIGIBLE | INELIGIBLE → REGISTERED → (WITHDRAWN | DISQUALIFIED)`.

**ExamAttendance (value set, not a lifecycle):** `PRESENT | ABSENT | LATE | EXCUSED | DISQUALIFIED`.

**ExamResult:** `DRAFT → SUBMITTED → REVIEWED → APPROVED → PUBLISHED`; `INVALIDATED` is pre-publication only. A PUBLISHED result is never mutated — corrections go through a revision.

**ExamResultRevision:** `DRAFT → APPROVED → CURRENT`; `→ REJECTED | CANCELLED`. Exactly one CURRENT per result.

**ExamAppeal:** `PENDING → UNDER_REVIEW → APPROVED | REJECTED → CLOSED`; `→ WITHDRAWN` by the student.

**ExamPublication:** `DRAFT → PUBLISHED → RETRACTED`.

**Grade integration state (read-model, portal Integração tab):** `MISSING | CURRENT | STALE | UNSUPPORTED | FAILED` (`FAILED` reserved). Reconciliation progression state: `NOT_RUN | CURRENT | REQUIRES_RECALCULATION`.

---

## 7. Permissions

22 `exams.*` permissions. SUPER_ADMIN and ORG_ADMIN receive **all** of them automatically
(via `Object.values`). Others are granted explicitly; anything not listed is admin-only by
default and can be added through custom roles.

| Permission | Purpose | SUPER_ADMIN / ORG_ADMIN | SECRETARY | STUDENT |
|---|---|:---:|:---:|:---:|
| `exams.view` | View the portal | ✅ | ✅ | |
| `exams.manage` | Manage engine config | ✅ | | |
| `exams.schedule` | Create/lifecycle periods, rooms, sessions | ✅ | ✅ | |
| `exams.overrideScheduling` | Override scheduling constraints | ✅ | | |
| `exams.operationsView` | View the Operations panel | ✅ | | |
| `exams.registerCandidates` | Register/withdraw/disqualify candidates | ✅ | ✅ | |
| `exams.overrideEligibility` | Register despite an ineligible verdict | ✅ | | |
| `exams.markAttendance` | Mark exam attendance | ✅ | ✅ | |
| `exams.correctAttendance` | Correct exam attendance | ✅ | ✅ | |
| `exams.enterResults` | Create/edit draft results | ✅ | | |
| `exams.submitResults` | Submit results | ✅ | | |
| `exams.reviewResults` | Review submitted results | ✅ | | |
| `exams.approveResults` | Approve reviewed results | ✅ | | |
| `exams.returnResultsForCorrection` | Return results to DRAFT | ✅ | | |
| `exams.publishResults` | Publish approved results | ✅ | | |
| `exams.retractPublication` | Retract a publication | ✅ | | |
| `exams.createAppeal` | File an appeal (own result) | ✅ | | ✅ |
| `exams.reviewAppeal` | Move an appeal to review | ✅ | | |
| `exams.approveAppeal` | Approve an appeal (revised score) | ✅ | | |
| `exams.rejectAppeal` | Reject an appeal | ✅ | | |
| `exams.withdrawAppeal` | Withdraw an appeal (own) | ✅ | | ✅ |
| `exams.integrateResults` | Integrate/reconcile into the Grade Engine | ✅ | | |

TEACHER and GUARDIAN hold **no** exam permissions in v1.1 (teacher assignment-scoped result
entry/review is deferred — see §9). Strict separation of duties (marker ≠ reviewer ≠
approver) and result-actor ownership are enforced at the **command layer**, never trusted
from input.

---

## 8. Events

Every command appends an `ExamEvent` (and an `AuditLog` entry) **inside its transaction**.
Events are transition-based and stored as strings. At v1.1 they are a durable ledger only
— there is **no** async Outbox dispatch (deferred, Phase 14).

**Aggregate types:** `EXAM_PERIOD`, `EXAM_SESSION`, `EXAM_ATTEMPT`, `EXAM_CANDIDATE`,
`EXAM_ATTENDANCE`, `EXAM_RESULT`, `EXAM_RESULT_REVISION`, `EXAM_APPEAL`, `EXAM_PUBLICATION`,
`EXAM_INCIDENT`, `EXAM_INVIGILATOR_ASSIGNMENT`.

**Event vocabulary (selected):**
- Period: `exam_period.opened|locked|completed|cancelled`
- Session: `exam_session.scheduled|locked|started|completed|results_recorded|published|cancelled`
- Candidate: `exam_candidate.registered|withdrawn|disqualified|eligibility_overridden`
- Attendance: `exam_attendance.marked|corrected`
- Result: `exam_result.created|updated|submitted|reviewed|approved|returned_for_correction|published|invalidated|revision_created|superseded`
- Integration: `exam_result.integrated|integration_reconciled`, `exam_session.results_integrated`
- Binding: `exam_session.grade_component_bound|grade_component_binding_archived`
- Appeal: `exam_appeal.created|reviewed|approved|rejected|withdrawn|decided`
- Publication: `exam_publication.published|retracted|completed`
- Invigilator: `exam_invigilator.assigned`

Integration **failures** are recorded in the `AuditLog`, never as a success event.

---

## 9. Known limitations (deferred to v1.2+)

These are intentional, documented deferrals — behaviour is unaffected.

- **Bulk Integration is not a first-class one-click flow** across sessions; reconciliation
  remains per-result/per-session. (Rationale in [ADR-015](adr/ADR-015-examination-portal-freeze.md).)
- **No Outbox / no notifications.** Events are a synchronous in-tx ledger; there is no async
  fan-out or user notification on publish/integrate.
- **No Teacher/Student/Guardian exam portal.** Admin/secretary scope only; teacher
  assignment-scoped result entry/review is deferred until session-scoping lands.
- **UX micro-interactions** identified in UX Audit #3 (v1.2 backlog): invigilator picker is
  a plain `<Select>` (should be the searchable combobox); no search in the Attendance tab;
  backend filter dimensions not all surfaced in the UI; results pipeline has no visible
  stepper; two table paradigms (numbered pages vs load-more) not yet converged; no sticky
  headers/sorting; Operations integration KPIs not click-through.
- **Command Palette** (Linear/GitHub-style global actions) is planned for v1.2.
- **ExamRoom is a local model** (D11), designed for future migration to a shared Location.

---

## 10. Architectural decisions (summary)

The load-bearing decisions. Rationale in full: [ADR-013](adr/ADR-013-examination-engine.md)
(engine, E-1…E-13, D1…D14), [ADR-014](adr/ADR-014-exam-grade-component-binding.md) (binding),
and [ADR-015](adr/ADR-015-examination-portal-freeze.md) (portal freeze).

- **D1 — The frontend decides nothing.** Actions are gated by server-computed
  `allowedActions`, not client status checks. Enforced by a static guard test
  (`components/__tests__/ui-architecture-guards.test.ts`): no status-literal comparison and
  no repository/`@/server/db` import in any component or page.
- **D2 — Permissions computed on the server.** Every route/command re-authorizes; the UI
  only reflects capabilities.
- **D3 — One grade writer (E-13).** Exams publish facts; the Grade Engine imports them via
  an adapter port. Exams never write grade/transcript/certificate tables.
- **D4 — Published results are immutable (E-6a/D14).** Corrections/appeals/retractions
  produce an append-only `ExamResultRevision` with a single CURRENT; the published original
  is never overwritten.
- **D5 — Explicit grade-component binding (ADR-014).** No heuristic fallback; an unbound
  session integrates as UNSUPPORTED rather than guessing a component.
- **D6 — Exam attendance ≠ class attendance (E-10).** Separate model; never mutates the
  Attendance Engine.
- **D7 — Race-sensitive checks live in commands (E-3a).** Capacity, duplicate registration,
  and room/invigilator conflicts are command-level conditional writes, not engine decisions
  (avoids TOCTOU).
- **D8 — Value/label separation.** Domain values are English and travel in URLs/DB/payloads;
  PT-PT happens only at render, via one central badge/label registry shared with the filter
  options (badge and filter can never drift).
- **D9 — Read/write separation (ADR-007).** Batched tenant-scoped read services + pure DTO
  mapper for GET; engine commands for mutations.

---

## Closure statement

The Examination Administration Portal is **frozen at v1.1.0** and marked **Production
Ready**. The v1.1 scope is complete and validated; the v1.2 backlog (§9) is separated from
this release and tracked for the next cycle. Any change that reverses a decision in §10 or
in ADR-013/014 must be a new ADR, not an in-place edit.

**Related documents:** [ADR-015](adr/ADR-015-examination-portal-freeze.md) ·
[CHANGELOG](examination-portal-CHANGELOG.md) ·
[Release Notes v1.1.0](releases/examination-portal-v1.1.0.md) ·
[Engine design](examination-engine.md) · [ADR-013](adr/ADR-013-examination-engine.md) ·
[ADR-014](adr/ADR-014-exam-grade-component-binding.md).
