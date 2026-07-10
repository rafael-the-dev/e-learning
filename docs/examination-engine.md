# Examination Engine — Domain Design & Architecture (Phase 0)

> **Status:** Phase 0 design **FROZEN / ready for Phase 1** (documentation only; no code,
> schema, migration, route, or UI). Governed by
> [ADR-013](./adr/ADR-013-examination-engine.md) (Accepted). All Phase-0 review findings
> (H1, H2, M1–M4, L1–L4) are resolved; the open decisions are closed (§19, D1–D14).
> **Date:** 2026-07-09
> **Upstream (frozen):** Academic Core ([ADR-001](./adr/ADR-001-academic-core-freeze.md)),
> Academic Transcript Engine, Certificate Engine ([ADR-002](./adr/ADR-002-certificate-engine-architecture.md), v1.0).
> **Conventions inherited:** the Certificate Engine's layering (schemas → repositories →
> services/eligibility → commands → routes), the Source→Engine eligibility split
> ([ADR-003](./adr/ADR-003-single-eligibility-engine.md)), read/write separation
> ([ADR-007](./adr/ADR-007-read-write-separation.md)), the Outbox
> ([ADR-006](./adr/ADR-006-outbox-pattern.md)), the anti-corruption read boundary
> ([ADR-004](./adr/ADR-004-transcript-acl.md)), snapshot immutability
> ([ADR-005](./adr/ADR-005-snapshot-immutability.md)), and the reactive STALE model
> ([ADR-009](./adr/ADR-009-stale-reactive-model.md)).

---

## 1. Purpose

The **Examination Engine** is the bounded context that owns the lifecycle of **official
examinations**: scheduling, candidate eligibility, session management, exam attendance,
result capture, review/approval, publication, appeals, operational audit, and controlled
integration with the Grade / Progression / Transcript / Certificate engines.

It records **official examination facts** — the authoritative record that "student X, on
attempt N of level-subject S, sat exam session Y and obtained score Z, reviewed by R,
published at T."

**What it is NOT:**

- It does **not** replace the Grade Engine. The Grade Engine remains the owner of
  continuous assessment and final subject grades.
- It does **not** compute or write final subject grades — **ever** (E-13). Even when a
  subject is configured to let exam results influence its grade, the **Grade Engine** is
  the writer: the Examination Engine only *publishes* the official exam fact, and the Grade
  Engine imports/consumes it through an explicit integration adapter and decides the grade.
- It does **not** own Academic Core data. It **consumes** frozen Academic Core / progress
  facts through a read-only anti-corruption layer and never mutates them.
- It does **not** mutate Attendance Engine records, Transcript versions, or Certificates.
- It does **not** decide academic progression. Exam outcomes are exam facts; the
  Progression Engine remains the authority for `StudentSubjectProgress` etc. (D13).

The Examination Engine sits **beside** the Grade Engine as a producer of official facts,
and reaches Progression/Transcript/Certificate only through published facts consumed via
existing seams — never by those engines reading exam tables directly (D5).

---

## 2. Core Principles (immutable rules)

Binding once frozen; any change requires a new ADR superseding ADR-013.

- **E-1 — Examination is a bounded context** (`src/modules/examinations/**`). No other
  module reads its raw tables; consumers use its published facts / events.
- **E-2 — Consumes Academic Core facts, does not own them.** All cross-engine reads go
  through a read-only `ExaminationAcademicSource` returning DTOs (mirrors ADR-004).
- **E-3 — Single eligibility authority: `ExaminationEligibilityEngine`** — for
  academic/administrative eligibility only (see E-3a).
- **E-3a — Operational, race-sensitive checks are NOT the engine's authority.** Session
  capacity, duplicate registration, seat/room/invigilator conflicts are decided by
  commands via conditional writes / DB constraints, never by the eligibility engine (M1).
- **E-4 — `ExaminationEligibilitySource` loads facts; the engine decides.** The source is
  the engine's only read dependency; the engine is a pure function of the facts.
- **E-5 — Commands execute; they never decide eligibility.**
- **E-6 — Exam results are official facts, not continuous grades.** Frozen once published;
  never recomputed on read; never overwritten in place (see E-6a).
- **E-6a — A published result is immutable and is never mutated.** A correction/appeal/
  retraction produces an append-only `ExamResultRevision`; the "official current result"
  is resolved through the current-revision pointer (H1 / D14).
- **E-7 — Publication is the visibility boundary.** Unpublished results are invisible to
  students and to downstream fact-consumers.
- **E-8 — Appeals never rewrite history silently.** Every appeal/retraction yields an
  explicit, audited `ExamResultRevision`; the original row is preserved unchanged.
- **E-9 — Exam scheduling/registration must avoid conflicts** (student/invigilator/room/
  capacity/period), enforced at command time (E-3a).
- **E-10 — Exam attendance and exam result are separate facts**; exam attendance never
  mutates the Attendance Engine.
- **E-11 — No Certificate/Transcript mutation from the Examination Engine.** Upholds
  ADR-002; those engines consume official facts only through their existing upstreams.
- **E-12 — Events are transition-based and post-commit**, through the Outbox (ADR-006). A
  rolled-back transition emits nothing. (Command *rejections* — e.g. a capacity conflict —
  are not domain events.)
- **E-13 — The Grade Engine is the single grade writer.** The Examination Engine never
  writes a final grade; it publishes exam facts the Grade Engine imports (M2/M4).

Supporting invariants: every model is **tenant-scoped** by `organizationId` (server-side,
never client-supplied); repositories are the only Prisma layer; mutations go through
`BaseCommand` (`validate → authorize → execute`) with conditional writes; the append-only
`ExamEvent` log is the durable audit trail.

---

## 3. Domain Model

> Design shapes only. Phase 1 owns the Prisma schema, indexes, and filtered-unique
> constraints. All models: `organizationId` scoped; relations `onDelete/onUpdate NoAction`;
> soft delete via `deletedAt` where a record must be preserved; `createdAt`/`updatedAt`.
> String-literal enums via const objects (no native DB enums).

### 3.1 `ExamPeriod`
- **Purpose:** an examination window (e.g. "2026 Term 2 Finals") scoping sessions.
- **Key fields:** `name`, `academicYearId`, `academicTermId`, `status`, `opensAt`,
  `closesAt`, `branchId?`.
- **Relationships:** has many `ExamSession`.
- **State machine:** `DRAFT → OPEN → LOCKED → COMPLETED`, or `→ CANCELLED` (§4).
- **Source of truth:** the period lifecycle. **Immutability:** window frozen once `OPEN`;
  terminal once `COMPLETED`/`CANCELLED`. **Tenant:** org + optional branch.

### 3.2 `ExamSession`
- **Purpose:** a concrete sitting of one subject at one place/time — the scheduling unit.
- **Key fields:** `examPeriodId`, `subjectId` / `levelSubjectId`, `courseId?`, `levelId?`,
  `branchId`, `roomId?`, `startsAt`, `endsAt`, `durationMinutes`, `capacity`, `status`,
  `title?`, `maxScore`.
- **Relationships:** belongs to `ExamPeriod`, `ExamRoom`; has many `ExamCandidate`,
  `ExamInvigilatorAssignment`, `ExamIncident`; has one `ExamPublication`.
- **State machine:** `DRAFT → SCHEDULED → LOCKED → IN_PROGRESS → COMPLETED →
  RESULTS_RECORDED → PUBLISHED`, or `→ CANCELLED` (§4).
- **Source of truth:** the session lifecycle + scheduling facts. **Immutability:** time/
  room/capacity frozen once `LOCKED`; `maxScore` frozen once results exist. **Tenant:**
  org + branch.

### 3.3 `ExamAttempt` *(new — H2 / D12)*
- **Purpose:** a student's **attempt** at a level-subject — the first-class unit that makes
  re-sits explicit. Groups the candidacy + result of one sitting.
- **Key fields:** `enrollmentId`, `levelSubjectId`, `attemptNumber`, `status`,
  `outcome?` (exam outcome only — see D13), `examSessionId?` (the session sat).
- **Relationships:** has one `ExamCandidate`; has one `ExamResult`. (A re-sit is a **new**
  `ExamAttempt` with the next `attemptNumber`, typically on a different session.)
- **State machine:** `OPEN → SAT → RESULTED`, or `→ ABANDONED` (withdrawn/absent). The
  `outcome` (e.g. `PASSED_EXAM`/`FAILED_EXAM`/`ABSENT`/`DISQUALIFIED`) is an **exam
  outcome**, never a progression/grade decision (D13).
- **Source of truth:** owns attempt numbering + exam outcome per (enrollment, levelSubject).
- **Immutability:** `attemptNumber` unique per `(enrollmentId, levelSubjectId)`; a failed/
  absent/disqualified attempt is **historical and never overwritten**; a re-sit adds a row.
- **Tenant:** org.

### 3.4 `ExamCandidate`
- **Purpose:** a student's registration to sit a specific session; the eligibility record.
- **Key fields:** `examSessionId`, `examAttemptId`, `studentId`, `enrollmentId`,
  `eligibilityStatus`, `eligibilitySnapshot` (frozen facts + engine result at
  registration), `assignedSeat?`, `status`, `overriddenById?`, `overrideReason?`,
  `manualApprovalBy?`, `manualApprovalReason?`.
- **Relationships:** belongs to `ExamSession` and to exactly **one** `ExamAttempt`; has one
  `ExamAttendance`, one `ExamResult`.
- **State machine:** `PENDING_ELIGIBILITY → ELIGIBLE|INELIGIBLE → REGISTERED →
  WITHDRAWN|DISQUALIFIED` (§4).
- **Source of truth:** candidacy + the eligibility decision snapshot. **Immutability:**
  `eligibilitySnapshot` frozen at registration (ADR-005), re-evaluation creates a new
  snapshot with provenance. **Tenant:** org; unique active candidate per (session, student)
  — a duplicate is a **command-level** operational block (E-3a), not an engine decision.

### 3.5 `ExamAttendance`
- **Purpose:** whether/how a registered candidate showed up — independent of score.
- **Key stored fields:** `examCandidateId`, `attendanceStatus`, `checkedInAt?`, `markedBy?`,
  `remarks?`. *(Derived, not stored — see L3 note below.)*
- **Relationships:** belongs 1:1 to `ExamCandidate`.
- **State machine:** value-set `PRESENT | ABSENT | LATE | EXCUSED | DISQUALIFIED` (last
  transition wins; audited) (§4/§8).
- **Source of truth:** *exam* attendance only — never the Attendance Engine (E-10).
  **Immutability:** append audit per change; no hard delete. **Tenant:** org.

### 3.6 `ExamResult`
- **Purpose:** the official score outcome for a candidate/attempt — the engine's core fact.
- **Key stored fields:** `examCandidateId`, `examAttemptId`, `score?`, `maxScore`,
  `normalizedScore?`, `resultStatus`, `disqualificationReason?`, `markerId?`,
  `reviewedById?`, `reviewedAt?`, `publishedAt?`, `resultChecksum?` (integrity anchor at
  approval), `currentRevisionId?` (null = the original row is the official current result;
  otherwise points to the CURRENT `ExamResultRevision`).
- **`resultStatus` values:** `DRAFT | SUBMITTED | REVIEWED | APPROVED | PUBLISHED |
  INVALIDATED` (lifecycle, §4), plus the *exam-outcome* qualifier surfaced via the attempt
  (`PASSED_EXAM`/`FAILED_EXAM`/`ABSENT`/`DISQUALIFIED`) — an **exam** outcome only (D13).
- **Relationships:** belongs 1:1 to `ExamCandidate` and to one `ExamAttempt`; has many
  `ExamResultRevision`; referenced by `ExamAppeal`.
- **State machine:** `DRAFT → SUBMITTED → REVIEWED → APPROVED → PUBLISHED`; `INVALIDATED`
  only **before** publication; a **PUBLISHED result is never mutated** — it is *superseded*
  by an `ExamResultRevision` (§4, E-6a).
- **Source of truth:** the official exam score. **Immutability:** frozen at `APPROVED`
  (checksum computed once); after `PUBLISHED`, corrections are revisions, never edits.
  **Tenant:** org.

**L3 — derived, not stored:** `absentOrDisqualified` is a read-model helper, **not** a
column: `absentOrDisqualified = attendanceStatus ∈ {ABSENT, DISQUALIFIED} OR resultStatus
= (disqualified)`. Stored are `attendanceStatus`, `resultStatus`, `disqualificationReason?`.

### 3.7 `ExamResultRevision` *(new — H1 / D14)*
- **Purpose:** the append-only mechanism by which an appeal / retraction / correction
  changes the **official current** result **without mutating** the published original.
- **Key fields:** `examResultId`, `revisionNumber`, `previousScore`, `revisedScore`,
  `previousStatus`, `revisedStatus`, `reason`, `sourceType` (`APPEAL | RETRACTION |
  CORRECTION`), `createdBy`, `createdAt`, `approvedBy?`, `approvedAt?`, `isCurrent`.
- **Relationships:** belongs to `ExamResult`; may reference an `ExamAppeal`.
- **State machine:** `DRAFT → APPROVED → CURRENT`; `REJECTED`/`CANCELLED` terminal (§4).
- **Rules:** append-only; the original `ExamResult` is **never deleted or edited**; **at
  most one** revision is `isCurrent = true` per result; downstream consumers read the
  **current official result** (the current revision if any, else the original PUBLISHED
  row). **Tenant:** org; unique `(examResultId, revisionNumber)`; a partial-unique index
  enforces a single current revision per result.

### 3.8 `ExamAppeal`
- **Purpose:** a challenge to a **published** result and its adjudication.
- **Key fields:** `examResultId`, `requestedById`, `reason`, `status`, `decision?`,
  `reviewedById?`, `reviewedAt?`. On approval it **creates an `ExamResultRevision`**
  (`sourceType = APPEAL`) — it never writes a score onto `ExamResult`.
- **State machine:** `PENDING → UNDER_REVIEW → APPROVED|REJECTED → CLOSED` (§4).
- **Source of truth:** the appeal workflow. **Immutability:** original result preserved
  (E-8). **Tenant:** org.

### 3.9 `ExamPublication`
- **Purpose:** the visibility act for a session's results (the E-7 boundary).
- **Key fields:** `examSessionId`, `status`, `publishedAt?`, `publishedById?`,
  `retractedAt?`, `retractedById?`, `retractReason?`, `scope` (session — D9).
- **Relationships:** 1:1 with `ExamSession`.
- **State machine:** `DRAFT → PUBLISHED → RETRACTED` (→ `PUBLISHED` re-publish) (§4).
- **Source of truth:** publication visibility. **Immutability:** retraction never deletes
  results; it creates a retraction outcome + emits a downstream transition (E-8, §10/§11).
  **Tenant:** org.

### 3.10 `ExamIncident`
- **Purpose:** record irregularities (misconduct/medical/technical) during a session.
- **Key fields:** `examSessionId`, `examCandidateId?`, `type`, `description`, `severity`,
  `actionTaken?`, `reportedById?`.
- **State machine:** none (append-only). **Source of truth:** the incident record.
  **Immutability:** append-only. **Tenant:** org.

### 3.11 `ExamRoom` *(local v1 — M3 / D11)*
- **Purpose:** a physical exam location + capacity, for conflict/capacity checks.
- **Ownership (D11):** **local to the Examination Engine in v1**, but explicitly designed
  as a **candidate for future migration to a shared platform Location/Classroom model**.
  If/when a shared Location model is adopted, `ExamRoom` becomes an ACL view of it (a new
  ADR); no other engine should couple to `ExamRoom` in the meantime.
- **Key fields:** `branchId`, `name`, `capacity`, `status` (`ACTIVE | INACTIVE`).
- **Relationships:** referenced by `ExamSession`. **State machine:** value-set status.
  **Immutability:** soft delete; capacity change never retro-affects locked sessions.
  **Tenant:** org + branch.

### 3.12 `ExamInvigilatorAssignment`
- **Purpose:** assign a teacher/user to a session in a role.
- **Key fields:** `examSessionId`, `userId`/`teacherId`, `role`, `assignedById?`.
- **State machine:** none (assignment exists/removed; audited). **Immutability:** unique
  active assignment per (session, user, role); overlap conflict is a **command-level**
  block (E-3a). **Tenant:** org.

### 3.13 `ExamEvent`
- **Purpose:** the append-only lifecycle/audit log for every examination transition.
- **Key fields:** `organizationId`, `aggregateType`, `aggregateId`, `eventType`,
  `previousStatus?`, `newStatus?`, `actorId?`, `reason?`, `metadata?`.
- **State machine:** none (immutable rows). **Source of truth:** the durable audit trail
  (distinct from the bus events of §13). **Immutability:** **append-only** (no
  update/delete/upsert). **Tenant:** org.

---

## 4. State Machines

`A → B` allowed; everything unlisted is **forbidden** (a conditional write finding an
unexpected current status is a race-safe no-op → abort, per ADR-012).

### ExamPeriod
```
DRAFT → OPEN → LOCKED → COMPLETED
DRAFT|OPEN|LOCKED → CANCELLED
```
Forbidden: `COMPLETED|CANCELLED → *` (terminal); `LOCKED → OPEN` (no re-open). `OPEN`
required before sessions accept registration.

### ExamSession
```
DRAFT → SCHEDULED → LOCKED → IN_PROGRESS → COMPLETED → RESULTS_RECORDED → PUBLISHED
any (pre-PUBLISHED) → CANCELLED
```
Forbidden: skipping `LOCKED` before `IN_PROGRESS`; `PUBLISHED → *` (visibility changes go
through `ExamPublication`); `CANCELLED → *`. `RESULTS_RECORDED → PUBLISHED` requires every
candidate's result to be terminal-for-publication (`APPROVED`, or a derived
absent/disqualified result).

### ExamAttempt
```
OPEN → SAT → RESULTED
OPEN|SAT → ABANDONED
```
`RESULTED`/`ABANDONED` are historical; a re-sit is a **new** attempt (next `attemptNumber`),
never a transition back.

### ExamCandidate
```
PENDING_ELIGIBILITY → ELIGIBLE → REGISTERED
PENDING_ELIGIBILITY → INELIGIBLE
INELIGIBLE → REGISTERED     (only via exams.overrideEligibility; reason + audit)
REGISTERED → WITHDRAWN
REGISTERED → DISQUALIFIED
```
Forbidden: `WITHDRAWN|DISQUALIFIED → REGISTERED` (re-register = new candidate/attempt);
`→ REGISTERED` after the session is `LOCKED`. The `requiresApproval` gate (D2) must be
satisfied by recorded approval before `ELIGIBLE → REGISTERED`.

### ExamAttendance (value-set; last transition wins, audited)
```
{ PRESENT, ABSENT, LATE, EXCUSED, DISQUALIFIED }
```
Settable only for a `REGISTERED` candidate while the session is `IN_PROGRESS`/`COMPLETED`.

### ExamResult
```
DRAFT → SUBMITTED → REVIEWED → APPROVED → PUBLISHED
DRAFT|SUBMITTED|REVIEWED|APPROVED → INVALIDATED     (pre-publication only)
```
**A PUBLISHED result is never mutated and is never `INVALIDATED` in place.** After
publication, the official current result is changed **only** by superseding it with an
`ExamResultRevision` (below). Editing `score` after `APPROVED` is forbidden (frozen — E-6).

### ExamResultRevision *(supersedes a PUBLISHED result)*
```
DRAFT → APPROVED → CURRENT
DRAFT|APPROVED → REJECTED   (terminal)
DRAFT → CANCELLED           (terminal)
```
On reaching `CURRENT`: the previous current pointer (if any) is cleared and
`ExamResult.currentRevisionId` points here; `exam_result.superseded` is emitted. Only one
`CURRENT` revision per result.

### ExamAppeal
```
PENDING → UNDER_REVIEW → APPROVED → CLOSED
PENDING → UNDER_REVIEW → REJECTED → CLOSED
PENDING → CLOSED    (withdrawn)
```
Forbidden: `CLOSED → *`; appealing a non-`PUBLISHED` result. An `APPROVED` appeal creates
an `ExamResultRevision` (it does not edit the result).

### ExamPublication
```
DRAFT → PUBLISHED → RETRACTED → PUBLISHED
```
Forbidden: any path deleting results; publishing a session whose results are not all
terminal-for-publication. Retraction emits a downstream transition (§10/§11/L4).

---

## 5. Eligibility Engine

Mirrors ADR-003, with the M1 boundary made explicit.

- **`ExaminationEligibilitySource`** — loads `ExaminationEligibilityFacts` via the Academic
  read ACL (E-2), the finance read-model (D3), and engine-owned state (period open flag,
  previous attempts). Decides nothing.
- **`ExaminationEligibilityEngine`** — **pure, deterministic** `facts → result`. No I/O,
  clock, or randomness (`evaluatedAt` comes from the facts). The single authority for
  **academic/administrative** eligibility (E-3).
- **`ExaminationEligibilityFacts`** — enrollment status; subject registration/progress;
  class-attendance status (read-only, from the Attendance Engine); prerequisite status
  (Progression); financial clearance (finance read-model, D3); **previous exam attempts**
  (engine-owned, from `ExamAttempt` — powers re-sit rules); disciplinary restrictions; exam
  **period open flag** (loaded as a boolean fact, keeping the engine pure); manual-approval
  provenance.
- **`ExaminationEligibilityResult`** — `{ eligible, blockingReasons[], warnings[],
  requiresApproval, evaluatedAt, facts }`; `eligible === blockingReasons.length === 0`.

**Engine blocking reasons (academic/administrative):** `NO_ACTIVE_ENROLLMENT`,
`SUBJECT_NOT_REGISTERED`, `SUBJECT_ALREADY_PASSED`, `ATTENDANCE_BELOW_REQUIRED`,
`PREREQUISITE_NOT_MET`, `FINANCIAL_CLEARANCE_REQUIRED`, `DISCIPLINARY_BLOCK`,
`EXAM_PERIOD_CLOSED`.

**Non-blocking gate (D2):** `MANUAL_APPROVAL_REQUIRED` → sets `requiresApproval = true`
(not in `blockingReasons`). Registration to `REGISTERED` then needs recorded approval
(provenance in `ExamEvent`), mirroring the Certificate approval pattern.

**Command-level operational blockers — NOT the engine (E-3a / M1):** `SESSION_FULL`,
`ALREADY_REGISTERED`, seat/room/invigilator conflicts. These depend on **live** counts/
state and are decided by `RegisterExamCandidateCommand` / `ScheduleExamSessionCommand` via
**conditional writes + DB constraints** (race-safe, TOCTOU-proof). The same code strings
(`SESSION_FULL`, `ALREADY_REGISTERED`) may be returned to the caller, but the **authority
is the command**, not the eligibility engine.

---

## 6. Scheduling Engine

**Responsibilities:** create/lock sessions; assign room; assign invigilators; enforce
conflicts; capacity checks; period/branch constraints.

**Conflict rules — enforced at command time via conditional writes / constraints (E-3a,
E-9), race-safe:**
- **Student overlap:** no student is a `REGISTERED` candidate in two overlapping sessions.
- **Invigilator overlap:** no user holds an active assignment in two overlapping sessions.
- **Room double-booking:** no room hosts two overlapping sessions.
- **Capacity:** `active candidates ≤ session.capacity ≤ room.capacity` (`SESSION_FULL` is a
  command block, not an eligibility reason).
- **Period bounds:** session interval within the `OPEN` period window, same `branchId`.

`ExamRoom` is a **local v1 model** designed for later migration to a shared Location model
(D11); scheduling must not couple to internals that would block that migration.

---

## 7. Registration Flow

Registration produces an `ExamCandidate`, each belonging to exactly one `ExamAttempt`
(H2). A re-sit creates a **new** attempt (next `attemptNumber` for the
`(enrollment, levelSubject)`), never reusing a historical one.

**Flows:** manual (staff); bulk (orchestrates the single-candidate command, one tx per
item — ADR-007); **auto-registration from eligible students — deferred (D7)**.

**Status path:** `PENDING_ELIGIBILITY → ELIGIBLE|INELIGIBLE → REGISTERED →
WITHDRAWN|DISQUALIFIED`.

**Rules:**
- The eligibility engine decides academic fitness; the **command** enforces capacity
  (`SESSION_FULL`) and duplicate (`ALREADY_REGISTERED`) via conditional writes (E-3a).
- No direct `REGISTERED` if the engine says `INELIGIBLE` — **unless** a recorded override
  via `exams.overrideEligibility` exists (`INELIGIBLE → REGISTERED`, reason + audit; L1).
- `requiresApproval` (D2 gate) must be satisfied by recorded approval before `REGISTERED`.

---

## 8. Attendance Flow

Exam attendance is captured per registered candidate for a session in progress.

**Statuses:** `PRESENT | ABSENT | LATE | EXCUSED | DISQUALIFIED`.

**Rules:**
- Exam attendance is **not** class attendance. The engine **never** writes to the
  Attendance Engine (E-10, E-2); it only *reads* class-attendance facts for eligibility.
- Attendance may feed result derivation (e.g. `ABSENT`/`DISQUALIFIED` → a non-numeric
  result status), but does not itself produce a score.
- Exam absence does **not** directly affect progression (D8); only a published *result
  outcome* can, via the Progression seam.

---

## 9. Result Flow

**Rules:**
- Only `REGISTERED` candidates receive a result; each result belongs to the candidate's
  `ExamAttempt` (H2).
- `ABSENT`/`DISQUALIFIED` candidates receive a result with the corresponding derived
  status (no numeric score).
- A result carries `score`, `maxScore`, `normalizedScore` (policy scale).
- **Submission ≠ publication.** Markers submit (`DRAFT → SUBMITTED`); reviewers approve
  (`SUBMITTED → REVIEWED → APPROVED`); publication is separate (§10). A teacher cannot
  review their own marked result unless explicitly assigned as reviewer and not the marker
  (D6).
- At `APPROVED` the score freezes and `resultChecksum` is computed once. After
  `PUBLISHED`, the result is **never edited**; changes are `ExamResultRevision`s (E-6a).
- **Pass/fail ownership (D13):** a result may record an **exam outcome**
  (`PASSED_EXAM`/`FAILED_EXAM`) for information, but the Examination Engine **must not** set
  `StudentSubjectProgress` PASSED/FAILED or write a grade — Progression owns progression,
  the Grade Engine owns the final grade (E-13).

---

## 10. Publication Flow

Publication is the **visibility boundary** (E-7).

**Before publication:** admin/teacher/staff view per permission; the **student cannot** see
the official result; **no** transcript consumption, **no** certificate effect, and **no**
progression finalization (unless a subject is explicitly configured for draft-only
preview) (L4).

**After publication:** the student portal shows the **current official result** (current
revision if any, else the published original); downstream fact-consumers (Grade →
Progression → Transcript) may use it **if integration is enabled** (§12).

**Retraction** (`PUBLISHED → RETRACTED`) never deletes results; it records a retraction
outcome (an `ExamResultRevision` with `sourceType = RETRACTION` where a value changes) and
**emits a downstream transition** so consumers react (L4). Publication scope is **per
session** in v1 (D9).

---

## 11. Appeals Flow

**Rules:**
- An appeal must reference a **`PUBLISHED`** `ExamResult`.
- An appeal **never** overwrites the original score (E-8). An `APPROVED` appeal creates an
  `ExamResultRevision` (`sourceType = APPEAL`) that, on `CURRENT`, becomes the official
  current result; the original PUBLISHED row is preserved as historical fact.
- Every appeal action is audited (`ExamEvent` + audit log).
- An approved appeal **may** trigger progression recalculation **if configured** — via the
  Progression seam (an event), never by the Examination Engine writing progression.

---

## 12. Integration with Existing Engines

All consumer-side; the Examination Engine pushes facts/events and never reaches into
others' writes.

- **Grade Engine** — **single grade writer (E-13).** The Examination Engine publishes the
  official exam fact; an explicit Grade-Engine **integration command/adapter** imports/
  consumes it and decides the grade. No duplicate grade ownership (D1).
- **Attendance Engine** — **no mutation** of class attendance (E-10); read-only for
  eligibility.
- **Progression Engine** — consumes **published** exam outcomes **if configured**; it
  decides progression (D8/D13). The Examination Engine emits events; Progression reacts.
- **Transcript Engine** — consumes official facts **indirectly** through Grade/Progression,
  **not** raw exam tables (D5). A retraction/revision after a transcript version was issued
  flows through **existing Transcript supersession** → which drives the **Certificate STALE
  reaction** (ADR-009). The Examination Engine never touches transcripts/certificates (L4).
- **Certificate Engine** — **never** reads exam tables; uses the Transcript only (ADR-002).
- **Financial Engine** — provides the `financialClearance` fact to the eligibility source
  (finance read-model; snapshot into the eligibility decision if needed — D3).
- **Communication Center** — may subscribe to exam events to notify candidates; consumer
  only.

---

## 13. Events

Emitted **post-commit, transition-based, idempotent, audited**, through the Outbox
(ADR-006). Aligned 1:1 with the state transitions in §4:

```
exam_period.opened                exam_result.submitted
exam_period.locked                exam_result.reviewed
exam_period.completed             exam_result.approved
exam_period.cancelled             exam_result.published
exam_session.scheduled            exam_result.invalidated      (pre-publication only)
exam_session.locked               exam_result.revision_created
exam_session.started              exam_result.superseded
exam_session.completed            exam_appeal.created
exam_session.results_recorded     exam_appeal.decided
exam_session.cancelled            exam_publication.published
exam_candidate.registered         exam_publication.retracted
exam_candidate.withdrawn          exam_publication.completed   (period-level batch marker)
exam_candidate.disqualified
exam_candidate.eligibility_overridden
exam_attendance.marked
```

**Not domain events:** command *rejections* such as a capacity/room/invigilator conflict
(`exam_room.conflict_detected` and similar) are **not** bus events — a rejected command is
not a state transition (E-12). Such conflicts surface as command errors and, where useful,
as `ExamEvent`/audit entries, not on the bus. Every event above corresponds to a real
transition; there are no orphan events.

---

## 14. Permissions

CASL/RBAC, default-deny, server-side.

```
exams.view                exams.enterResults        exams.viewOwn
exams.manage              exams.reviewResults       exams.viewPublishedOwn
exams.schedule            exams.publishResults      exams.overrideEligibility
exams.registerCandidates  exams.manageAppeals       exams.reconcile
exams.markAttendance                                exams.operationsView
```

New/sensitive:
- **`exams.overrideEligibility`** — register a candidate despite an `INELIGIBLE` engine
  result. Requires a reason; audited; **not** granted to teacher/student/guardian by
  default (L1).
- **`exams.reconcile`** — run the operational reconcile command (missed transitions).
- **`exams.operationsView`** — read the operational dashboard (health/maintenance/metrics).

**Role suggestions:** ORG_ADMIN/SUPER_ADMIN — all. SECRETARY — view, register, schedule,
mark attendance, publish (if allowed), override (if allowed). TEACHER — view *assigned*
sessions, enter results, review *only if assigned reviewer and not marker* (D6). STUDENT —
`viewOwn`/`viewPublishedOwn`, create appeal. GUARDIAN — deferred (linked-student published
results only, if a future policy allows). Scoping: `organizationId` from context; TEACHER
scoped to assigned sessions; STUDENT/GUARDIAN self-scoped.

---

## 15. Portals

**Admin / Secretary** (`(org)`): periods, sessions, candidates, attendance, results,
publication, appeals, operational dashboard.
**Teacher** (`/teacher`): assigned sessions, candidate list, attendance marking, result
entry, incidents.
**Student** (`/student`): timetable, eligibility status, **published** results (current
official result), appeal request.
**Guardian** (`/guardian`): deferred; linked-student published results only if allowed.
(UI = Phase 12.)

---

## 16. API Surface (future — Phase 12)

Thin route shells over commands/read services (ADR-007):

**Admin**
```
GET  /api/exams/periods                         POST /api/exams/periods
POST /api/exams/sessions                         POST /api/exams/sessions/:id/register-candidates
POST /api/exams/sessions/:id/attendance          POST /api/exams/results
POST /api/exams/results/:id/review               POST /api/exams/results/:id/approve
POST /api/exams/publications/:id/publish         POST /api/exams/publications/:id/retract
POST /api/exams/candidates/:id/override          POST /api/exams/appeals/:id/decide
```
**Teacher**
```
GET  /api/teacher/exams                           POST /api/teacher/exams/:sessionId/results
```
**Student**
```
GET  /api/student/exams                           GET  /api/student/exams/results
POST /api/student/exams/appeals
```
(Full set — withdraw, bulk, appeals create, revision reads — enumerated at Phase 12.)

---

## 17. Operational Hardening (design intent — Phase 14, not implemented now)

Mirror the Certificate Engine's operational layer: **Outbox** (in-memory v1;
enqueue→publish; retry + backoff; dead-letter); **Maintenance** (read-only anomaly
detection — orphan sessions, stuck results, publication↔result-status drift, over-capacity
sessions, unassigned invigilators, results without a resolvable current revision);
**Health** (aggregate KPI counts); **Metrics** (windowed counts); **Bulk** (sequential
orchestration); **Dead-letter / Audit / Reconciliation** (`exams.reconcile`). All read-only
except the Outbox; aggregates only — no PII/score/checksum leakage.

---

## 18. Phase Roadmap

```
Phase 0  — Domain Design (this document) — CLOSED
Phase 1  — Data Model (Prisma) — IMPLEMENTED (2026-07-09; see notes below): incl. ExamAttempt (D12) and ExamResultRevision (D14),
           filtered-unique indexes (attemptNumber per enrollment+levelSubject; single
           current revision per result; unique active candidate per session+student)
Phase 2  — Repositories (tenant-safe, persistence-only) + ExaminationAcademicSource ACL
Phase 3A — ExaminationEligibilitySource
Phase 3B — ExaminationEligibilityEngine (pure; academic/admin only — freeze E-3/E-3a/E-4/E-5)
Phase 4  — Scheduling commands (conflicts + capacity as command-level conditional writes)
Phase 5  — Candidate registration (manual / bulk; override; [auto — deferred D7])
Phase 6  — Attendance
Phase 7  — Result entry (marker submission)
Phase 8  — Review / Approval (checksum on approve)
Phase 9  — Publication (visibility boundary + retraction)
Phase 10 — Appeals + ExamResultRevision (current-result supersession)
Phase 11 — Integration with Grade / Progression (import adapter; E-13; per D1/D5/D13)
Phase 12 — Portals / API
Phase 13 — Bulk operations
Phase 14 — Operational hardening
```

### Phase 1 — Implementation notes (2026-07-09)

Data model only — **no** repositories/commands/services/routes/UI/eligibility/
scheduling/publication/appeal logic; no Grade/Progression/Transcript/Certificate/Academic
Core change. Delivered exactly per ADR-013:

- **13 `Exam*` Prisma models** added (`prisma/schema.prisma`), all `organizationId`-scoped,
  all relations `onDelete/onUpdate: NoAction` (no cascade), all status/type fields `String`
  (no native enums), `@@map` snake_case tables + camelCase columns.
- **Actors are plain `String` pointers, not relations** (`markerId`, `reviewedById`,
  `createdById`, `teacherId`, `userId`, `actorId`, …), and `ExamResult.currentRevisionId`
  is a plain pointer — mirroring the Certificate Engine and keeping `User`/`Teacher` free
  of exam back-relations. Structural FKs go only to `Organization`, `Branch`, `Course`,
  `CourseLevel`, `LevelSubject`, `Student`, `Enrollment`, and the `Exam*` models.
- **No relation to** `AcademicTranscript*`, `Certificate*`, or `StudentSubject/Level/Course
  Progress` (E-11, D5, D13 upheld at the schema level).
- **Append-only `ExamEvent`** (no `updatedAt`/`deletedAt`); `deletedAt` present only on
  `ExamPeriod`, `ExamRoom`, `ExamSession`, `ExamAttempt`, `ExamCandidate`.
- **6 filtered-unique indexes are migration-only** (Prisma can't express them; introspection
  drift is expected) — hand-written in
  `prisma/migrations/20260709120000_examination_engine_models/migration.sql` (SQL-Server
  `BEGIN TRY / BEGIN TRAN … COMMIT / CATCH … THROW`): exam-room code, attempt number,
  active candidate, single current revision, invigilator-by-teacher, invigilator-by-user.
- **Constants/types:** `src/modules/examinations/constants.ts` (const objects + union
  types) and `src/modules/examinations/types/index.ts` (re-exports) — no behaviour.
- **Validation:** `prisma validate` ✅ · `prisma generate` ✅ · `tsc --noEmit` ✅ (0 errors).

### Phase 2 — Implementation notes (2026-07-09)

Persistence only — **no** commands/services/routes/UI; **no** eligibility /
scheduling / result / publication / appeal logic; **no** events published, **no**
audit; no schema/migration change. Delivered per the Phase-2 brief:

- **13 tenant-safe, transaction-aware repositories** under
  `src/modules/examinations/repositories/` (one per `Exam*` model + `index.ts`
  barrel). Every function ends with an optional `client?: PrismaClientOrTx` and
  falls back to `getDb()`, so the same code runs standalone or inside a
  `$transaction`. Every `where` and every `create.data` carries
  `organizationId`; reads use `findFirst`/`findMany`/`count` only — never
  `findUnique`, never update-by-id.
- **Persistence-shaped types** in `types/repository.ts` (`*Record` / `Create*Input`
  / `Update*MetadataInput` / `List*Filters`), re-exported from `types/index.ts`.
  Decimal columns (`ExamResult.score/maxScore/normalizedScore`,
  `ExamResultRevision.previousScore/revisedScore`) map to `number | null` via a
  copy-only `toNum` helper; JSON/NVarChar(Max) columns
  (`eligibilitySnapshot`, `metadata`, `description`) are carried as the raw
  stored `string` — never parsed or recomputed. No Prisma type leaks past the
  boundary.
- **Soft delete only where `deletedAt` exists** (ExamPeriod, ExamRoom,
  ExamSession, ExamAttempt, ExamCandidate); `list*` excludes soft-deleted by
  default. The other eight models expose no delete of any kind.
- **`ExamEvent` is append-only** — create + read only; no update / delete /
  upsert / soft delete.
- **`updateMetadata` writes are thin primitives** (`updateMany` returning
  `{ count }`) — they persist resolved columns and make no lifecycle/business
  decision; the allowed transitions belong to later command phases.
- **Scheduling conflict helpers are READ-ONLY** (`listSessionsInTimeRange`,
  `…ByRoom…`, `…ByInvigilator…`): overlap = `startsAt < endsAt AND endsAt >
  startsAt`, excluding CANCELLED and soft-deleted. They surface possible
  conflicts; the Phase-4 scheduling command decides. `getNextAttemptNumberCandidate`
  returns `max + 1` and is explicitly documented as NOT race-safe (the command +
  filtered-unique index enforce concurrency).
- **`findCurrentOfficialResult`** assembles the base `ExamResult` plus the
  pointed-to current `ExamResultRevision` (D14) — assembly only, no pass/fail
  decision, no score recomputation.
- **Tests:** `architecture-guards.test.ts` (static: no commands/services/event/
  audit/UI imports, no other-engine imports, no hard delete / upsert /
  findUnique, ExamEvent append-only, every write file mentions `organizationId`)
  + `examination-repositories.test.ts` (behavioural, incl. cross-tenant
  isolation) using the verbatim `_fake-db.ts`.
- **Validation:** `tsc --noEmit` ✅ (0 errors) · `vitest run src/modules/examinations`
  ✅ (40 passed) · `eslint src/modules/examinations` ✅ · `prisma validate` ✅.

### Phase 3A — Implementation notes (2026-07-09)

`ExaminationEligibilitySource` implemented as a pure **read-aggregation façade** —
it **loads facts and decides nothing** (ADR-013 E-3/E-4). No commands/routes/UI, no
writes, no events, no audit, no schema change.

- **`loadExaminationEligibilityFacts(input, client?)`**
  (`src/modules/examinations/services/examination-eligibility-source.service.ts`)
  returns `ExaminationEligibilityFacts` — fact containers only. There is **no**
  `eligible` / `blockingReasons` / `warnings` / `requiresApproval` /
  `canRegister` / `canSchedule` / `canOverride` (a static guard scans the code for
  that vocabulary). Facts are copied verbatim; no recalculation.
- **Reads (org-scoped, read-only):** Academic Core `Student` / `Enrollment` /
  `LevelSubject` (+ `Subject` name) / `StudentSubjectProgress` /
  `StudentSubjectAttendanceSummary` / `LevelSubjectPrerequisiteGroup` + `Item`
  (both keyed by `(organizationId, enrollmentId, levelSubjectId)` / `levelSubjectId`),
  plus the Examination repositories for previous attempts / period / session /
  existing candidate. **No** Transcript, Certificate, Grade-calculation,
  Attendance-mutation, or Progression-command reads (E-2/E-11/D5).
- **Missing integrations are explicit** — `financialClearance` and `disciplinary`
  are `UNKNOWN`, `manualApproval.requiredByPolicy` is `null` (no finance /
  disciplinary / exam-policy model exists yet); attendance/progress absent →
  `null` / `exists:false`. The source never invents data.
- **`existingCandidate`** is a **fact only** — the source does not decide
  `ALREADY_REGISTERED`; capacity/duplicate/conflict remain command-level (E-3a).
- **Determinism boundary:** `now` (input) is copied only into `metadata.loadedAt`
  (`sourceVersion: "examination-eligibility-source.v1"`); no fact is derived from
  the clock, keeping the future Phase-3B engine a pure function of the facts.
- **Validation:** `tsc --noEmit` ✅ · `vitest run src/modules/examinations` ✅
  (56 passed) · `eslint` ✅ · `prisma validate` ✅.

### Phase 3B — Implementation notes (2026-07-09)

`ExaminationEligibilityEngine` implemented as a **pure, synchronous, deterministic**
function (ADR-013 E-3/E-4/E-5). It consumes the Phase-3A `ExaminationEligibilityFacts`
and returns `ExaminationEligibilityResult`. It loads/writes nothing, calls no
repository/service/command/Prisma, publishes no events, writes no audit, and reads no
clock/random/env.

- **`evaluateExaminationEligibility(facts)`**
  (`src/modules/examinations/services/examination-eligibility.engine.ts`) →
  `{ eligible, blockingReasons[], warnings[], requiresApproval, evaluatedAt,
  evaluatedFacts, metadata.engineVersion }`. `eligible === blockingReasons.length
  === 0`; `evaluatedAt` is copied from `facts.metadata.loadedAt` (no clock);
  `evaluatedFacts` is the **same reference** (the engine mutates nothing).
- **Blockers (academic/administrative only):** NO_STUDENT, NO_ACTIVE_ENROLLMENT,
  LEVEL_SUBJECT_NOT_FOUND, SUBJECT_ALREADY_PASSED, ATTENDANCE_BELOW_REQUIRED,
  PREREQUISITE_NOT_MET, FINANCIAL_CLEARANCE_REQUIRED, DISCIPLINARY_BLOCK,
  EXAM_PERIOD_CLOSED, EXAM_SESSION_NOT_AVAILABLE.
  `SUBJECT_NOT_REGISTERED` is defined but **not emitted** yet (no such fact from
  Phase 3A — not invented; reserved for a future source fact).
- **`SESSION_FULL` and `ALREADY_REGISTERED` are NOT engine blockers** (nor room/
  invigilator/seat/timetable conflicts) — they are command-level operational blockers
  (E-3a), and a static test asserts they are absent from the blocker vocabulary.
- **Manual approval is a NON-blocking gate:** `manualApproval.requiredByPolicy ===
  true` sets `requiresApproval` + a warning; it never blocks.
- **UNKNOWN facts become warnings, never blockers** (attendance/prerequisite/finance/
  disciplinary unknown; period/session requested-but-missing; previous attempts
  found). Prerequisites: the engine reads the source's `allMet` verdict
  (`null`=unknown→warning, `false`→blocker) and never evaluates the graph itself.
- No Academic Core reads, no Grade writes, no Transcript/Certificate touch.
- **Validation:** `tsc --noEmit` ✅ · `vitest run src/modules/examinations` ✅
  (105 passed) · `eslint` ✅ · `prisma validate` ✅.

### Phase 4 — Implementation notes (2026-07-10)

First **mutating** phase — **scheduling only**. Delivered per ADR-013 (E-3a / §5 / §6):

- **Scheduling commands** (`src/modules/examinations/commands/`), all `BaseCommand`
  (`validate → authorize → execute`), all authorizing `PERMISSIONS.EXAMS_SCHEDULE`,
  each running in ONE `db.$transaction`:
  - **ExamPeriod:** `CreateExamPeriodCommand` (→ DRAFT), `Open`/`Lock`/`Complete`/
    `CancelExamPeriodCommand` (DRAFT→OPEN→LOCKED→COMPLETED and \*→CANCELLED).
  - **ExamRoom:** `Create`/`Update`/`ArchiveExamRoomCommand`. Archive is guarded by a
    command-level `findFutureSessionsByRoom` read (non-empty ⇒ `BusinessRuleError`) then
    a conditional archive (status → INACTIVE + `deletedAt`, freeing the filtered-unique code).
  - **ExamSession:** `CreateExamSessionCommand` (→ DRAFT after validating period exists +
    status ∈ {OPEN,LOCKED}, window inside the period, `LevelSubject` exists, and — when a
    room is given — capacity ≤ room and no overlapping non-cancelled session), plus
    `Schedule`/`Lock`/`Start`/`Complete`/`CancelExamSessionCommand`
    (DRAFT→SCHEDULED→LOCKED→IN_PROGRESS→COMPLETED and \*→CANCELLED).
  - **Invigilator:** `AssignExamInvigilatorCommand` — session assignable (DRAFT|SCHEDULED|
    LOCKED), exactly one of `teacherId`/`userId` (schema-enforced), duplicate + time-overlap
    command-level blocks.
- **Conflict / capacity / overlap checks are command-level (E-3a / E-9)**, not engine
  decisions: a read-check followed by a write. The overlap reads (room + invigilator) carry
  a **documented narrow read-race window** — the DB cannot range-exclude, so the filtered-
  unique indexes and a future operational reconciliation pass (Phase 14) are the backstop.
- **State transitions are race-safe conditional writes**: each `mark*` pins the expected
  current status in its `where`; the command asserts `count === 1`, else `BusinessRuleError`
  (a wrong / terminal / concurrently-moved state ⇒ `count 0`). Terminal-state rejection is
  enforced purely by the conditional `where`, not an ad-hoc status branch.
- **`ExamEvent` (append-only) + `AuditLog` are written INSIDE the same tx** (creates emit an
  audit row only — §13 events are transition-based). A rollback (lost race or a failed
  event/audit write) discards both — proven behaviourally by the fake-DB rollback tests.
  There is **NO domain-event bus / Outbox** here (deferred to Phase 14).
- **No** eligibility execution, candidate registration, attendance, results, publication,
  appeals, bulk, or routes/UI; **no** Grade/Progression/Transcript/Certificate import — a
  static `architecture-guards.test.ts` enforces the exclusions against comment-stripped source.
- Repository layer stays thin: new primitives are org-scoped conditional `updateMany`
  (returning `{ count }`) + `findFirst`/`findMany` reads with no business rule.
- **Validation:** `tsc --noEmit` ✅ · `vitest run src/modules/examinations` ✅
  (169 passed) · `eslint` ✅ · `prisma validate` ✅.

### Phase 5 — Implementation notes (2026-07-10)

Candidate **registration** — the first phase to WIRE the Phase-3A source + Phase-3B
pure engine into mutating commands (manual + override; bulk auto-registration stays
deferred per D7). No schema/migration change; no Grade/Progression/Transcript/
Certificate/Attendance touch; no routes/UI; no domain-event bus/Outbox.

- **The engine decides eligibility; the command enforces operational safety.**
  `runRegistration` (shared core, `commands/registration-shared.ts`) calls
  `loadExaminationEligibilityFacts` → `evaluateExaminationEligibility` verbatim (a
  static guard asserts both imports and that NO eligibility-rule identifier —
  attendance/prerequisite/finance/disciplinary/passing-grade — appears in the command
  layer). The command-level operational blockers are **`SESSION_FULL` /
  `ALREADY_REGISTERED` / `SEAT_UNAVAILABLE` / `SESSION_NOT_OPEN_FOR_REGISTRATION` /
  `ATTEMPT_NUMBER_CONFLICT`** — none of which is an engine/constants blocker (E-3a;
  asserted absent from the blocker vocabulary and the engine source).
- **Normal register** (`RegisterExamCandidateCommand`, perm `exams.registerCandidates`)
  requires the session to be **SCHEDULED**, the engine verdict **eligible**, and
  **not `requiresApproval`** (else `ELIGIBILITY_BLOCKED` with `{ blockingReasons }` /
  `MANUAL_APPROVAL_REQUIRED`; no candidate/attempt created).
- **Override** (`OverrideExamCandidateEligibilityCommand`, perm
  `exams.overrideEligibility`, **mandatory reason**) bypasses the **ELIGIBILITY verdict
  ONLY** — never the operational blockers — allows a **SCHEDULED or LOCKED** session
  (late registration), and records provenance in `eligibilitySnapshot`
  (`override.overridden/overriddenBy/overrideReason/originalBlockingReasons/
  originalRequiresApproval`) plus the `overriddenById`/`overrideReason` columns. It
  emits **`exam_candidate.eligibility_overridden` THEN `exam_candidate.registered`**.
- **The real engine verdict is never falsified:** an overridden candidate keeps its
  true `ELIGIBLE`/`INELIGIBLE` `eligibilityStatus`; only the operational `status`
  becomes `REGISTERED`.
- **ExamAttempt is created atomically** (status `OPEN`, `attemptNumber` via
  `getNextAttemptNumberCandidate`); a filtered-unique collision on `create` is caught
  and re-thrown as the typed `ATTEMPT_NUMBER_CONFLICT` — an attempt is never silently
  reused. **Capacity and seat are documented read-check race windows**, backstopped by
  the DB indexes and a future reconciliation pass (Phase 14).
- **Withdraw / disqualify** (`Withdraw`/`DisqualifyExamCandidateCommand`, perm
  `exams.registerCandidates`) load the candidate org-scoped (→ NotFound) and mark it
  via a **conditional `updateMany` pinning `status = 'REGISTERED'`**; the command
  asserts `count === 1` (double-op / concurrently-moved ⇒ `count 0` ⇒
  `BusinessRuleError`). Disqualify requires a reason. New repo primitives
  (`countActiveCandidatesBySession`, `findActiveCandidateBySessionStudent/Seat`,
  `markExamCandidateWithdrawn/Disqualified`) treat WITHDRAWN/DISQUALIFIED as inactive,
  so re-registration after a withdrawal is allowed.
- **`ExamEvent` (append-only) + `AuditLog` are written INSIDE the same tx** via
  `recordExamTransition`; a rollback (failed write / lost race) discards both — proven
  behaviourally by the fake-DB rollback test. There is **NO bus** (Phase 14). Phase-3A
  reports `manualApproval` as UNKNOWN, so the `requiresApproval` paths are driven in
  tests via a delegating engine spy (documented) — the source facts stay real.
- **Validation:** `tsc --noEmit` ✅ · `vitest run src/modules/examinations` ✅
  (223 passed) · `eslint src/modules/examinations` ✅ · `prisma validate` ✅.

---

### Phase 6 — Implementation notes (2026-07-10)

Exam **attendance** — records attendance for a REGISTERED candidate as an
Examination Engine fact. **COMPLETELY SEPARATE from the class Attendance Engine
(E-10):** it **never** writes class attendance and imports no `modules/attendance`
(static guard). It records ONLY — no results, no grades, no pass/fail, no
progression/transcript/certificate, no candidate-status mutation. No schema/
migration/constants change; no routes/UI; no domain-event bus/Outbox.

- **Mark** (`MarkExamCandidateAttendanceCommand`, perm `exams.markAttendance`)
  loads the candidate org-scoped (→ NotFound), requires `status = REGISTERED`
  (else `CANDIDATE_NOT_REGISTERED`), requires the session to be **LOCKED or
  IN_PROGRESS** (else `SESSION_NOT_OPEN_FOR_ATTENDANCE`), and creates the single
  attendance row. A **duplicate is rejected, never overwritten** —
  `ATTENDANCE_ALREADY_MARKED`, raised BOTH by the find-guard AND by a `P2002` on
  the `@unique examCandidateId` insert. `EXCUSED` requires a justification
  (`remarks` OR `reason`); `DISQUALIFIED` requires a `reason` (Zod `.strict()`).
- **Correct** (`CorrectExamCandidateAttendanceCommand`, perm
  `exams.correctAttendance`, **mandatory reason**) loads the existing row (missing
  ⇒ `ATTENDANCE_NOT_FOUND`), allows a **LOCKED / IN_PROGRESS / COMPLETED** session
  (rejects `RESULTS_RECORDED` / `PUBLISHED` / `CANCELLED` ⇒
  `SESSION_NOT_OPEN_FOR_CORRECTION`), and writes via a **conditional `updateMany`
  pinning the previously-read status**; the command asserts `count === 1` (a lost
  race ⇒ `count 0` ⇒ `ATTENDANCE_CORRECTION_CONFLICT`). The previous status is
  preserved in the ExamEvent (`previousStatus`) and the audit `oldValues`.
- **Bulk mark** (`BulkMarkExamAttendanceCommand`, perm `exams.markAttendance`,
  authorized **ONCE up-front**) is a **self-contained sequential runner** that
  re-uses the single Mark command once per item, **each in its OWN transaction** —
  no shared tx, the mark rules are never re-implemented. Per-item errors are
  captured (`{ code, message }`), never thrown; domain errors keep their code +
  message, unknown errors are sanitised to `INTERNAL_ERROR` with a generic
  message. `stopOnFailure` (default `false`) continues past failures; `true` skips
  the remaining items. Returns `{ total, succeeded, failed, skipped, items }` with
  the invariant `total === succeeded + failed + skipped`. It does NOT import the
  Certificate bulk runner.
- **`ExamAttendance.status = DISQUALIFIED` ≠ `ExamCandidate.status`:** a
  disqualified *attendance* row is an attendance fact only — the command **never**
  mutates the candidate (asserted) and **never** creates an `ExamResult`
  (asserted). No result derivation / pass-fail lives here (that is Phase 7+).
- **`ExamEvent` (append-only) + `AuditLog` are written INSIDE the same tx** via
  `recordExamTransition` (`exam_attendance.marked` / `exam_attendance.corrected`);
  a rollback (failed write / lost race) discards both — proven behaviourally by
  the fake-DB rollback test. There is **NO bus** (Phase 14).
- **Teacher assignment-scoped marking is DEFERRED:** Phase 6 restricts attendance
  to holders of `exams.markAttendance` / `exams.correctAttendance` (SUPER_ADMIN /
  ORG_ADMIN / SECRETARY). No `teacherId` is ever trusted from input; a permission
  test asserts a caller without the permission is denied. The repository additions
  (`updateExamAttendanceConditionally`, session-scoped roster reads,
  `listRegisteredCandidatesBySession`) are thin, org-scoped, and decide nothing
  (static guard: no throw / authorization / BusinessRuleError).
- **Validation:** `tsc --noEmit` ✅ · `vitest run src/modules/examinations` ✅
  (286 passed) · `eslint src/modules/examinations` ✅ · `prisma validate` ✅.

---

### Phase 7 — Implementation notes (2026-07-10)

Exam **result entry** — records the OFFICIAL EXAM RESULT for a candidate up to
**DRAFT / SUBMITTED ONLY**. It records exam **facts**: it does **not** calculate a
final subject grade, decide pass/fail, touch `StudentSubject`/`Level`/`Course`
progress, write a Transcript/Certificate, publish, review, approve, or run appeals
(all later phases / out of scope, asserted by a static guard). **No schema / migration
change**; it adds the `exams.enterResults` / `exams.submitResults` permissions, the
`ExamResultCode` constant (`SCORED` / `ABSENT` / `EXCUSED` / `DISQUALIFIED`), and the
`exam_result.created` / `exam_result.updated` event types (`exam_result.submitted`
already existed). No routes / UI; no domain-event bus / Outbox.

- **The attendance fact drives the `resultCode`** (deterministic, §9): `PRESENT` /
  `LATE` → `SCORED` (numeric score required, `0 ≤ score ≤ maxScore`, `maxScore > 0`);
  `ABSENT` → `ABSENT`; `EXCUSED` → `EXCUSED`; `DISQUALIFIED` → `DISQUALIFIED` (reason
  required). Every non-`SCORED` code forces `score` **and** `normalizedScore` to
  `null`. A client-supplied `resultCode` may only CONFIRM the derived one — a
  mismatch is `RESULT_CODE_MISMATCH`; it is never a free choice. Attendance is
  **never inferred**: create with no attendance row ⇒ `ATTENDANCE_NOT_MARKED`.
- **`normalizedScore` is exam-score normalization ONLY** — `round((score / maxScore)
  * 100)` to 2 dp (e.g. `45/60 → 75.00`). It is **not** a subject grade, carries no
  pass/fail meaning, and feeds no progression. It lives in the command/shared layer;
  the repository does no arithmetic (static guard: no `* 100` / `/ maxScore` /
  `normalizeExamScore` in the repo).
- **Create** (`CreateExamResultCommand`, perm `exams.enterResults`) requires the
  candidate `status = REGISTERED` (else `CANDIDATE_NOT_REGISTERED`) and the session
  **IN_PROGRESS | COMPLETED** (else `SESSION_NOT_OPEN_FOR_RESULTS`), derives the
  facts, and creates the single **DRAFT** row. `studentId` / `enrollmentId` /
  `examAttemptId` are copied from the candidate, `levelSubjectId` from the session —
  never trusted from input. A **duplicate is rejected, never overwritten**
  (`RESULT_ALREADY_EXISTS`, raised BOTH by the find-guard AND by a `P2002` on the
  `@unique examCandidateId`). `markerId = ctx.userId`.
- **Update-draft** (`UpdateDraftExamResultCommand`, perm `exams.enterResults`) edits
  a **DRAFT** result only (else `RESULT_NOT_DRAFT`), re-derives the resultCode /
  score / normalizedScore from the **current** attendance (a correction may have
  changed it), and writes via a **conditional `updateMany` pinning status =
  'DRAFT'**; the command asserts `count === 1` (a lost race ⇒ `count 0` ⇒
  `RESULT_CONCURRENTLY_CHANGED`). Before/after values are preserved in the ExamEvent
  and the audit `oldValues` / `newValues`.
- **Submit** (`SubmitExamResultCommand`, perm `exams.submitResults`) moves **DRAFT →
  SUBMITTED**, requiring a **COMPLETED** session (else `SESSION_NOT_COMPLETED`) and
  an internally-consistent row (`SCORED` ⇒ score + maxScore + normalizedScore all
  present; non-`SCORED` ⇒ score + normalizedScore null; else `RESULT_INCOMPLETE`).
  **Submit = freeze, not recalculate:** it re-loads the **current** attendance and
  VALIDATES that `resultCodeForAttendance(status)` still equals the draft's
  `resultCode`; a divergence (e.g. attendance corrected `PRESENT → ABSENT` after the
  draft, without an intervening update-draft) is rejected with `RESULT_STALE`
  (missing attendance ⇒ `ATTENDANCE_NOT_MARKED`) — it NEVER silently re-derives or
  mutates the draft, forcing an explicit update-draft first. It uses the same
  conditional DRAFT pin (double-submit ⇒ `RESULT_CONCURRENTLY_CHANGED`), stamps
  `submittedAt`, and **preserves `markerId`** — the submitter is recorded in the
  ExamEvent / audit metadata (the schema has no `submittedById`).
- **Post-DRAFT immutability:** the update/submit conditional writes pin status
  `DRAFT`, so a `SUBMITTED` / `REVIEWED` / `APPROVED` / `PUBLISHED` / `INVALIDATED`
  row matches zero rows and is rejected. There is **NO `ExamResultRevision`** logic
  here (post-publication correction is a future phase).
- **Bulk create / submit** (`BulkCreateExamResultsCommand` /
  `BulkSubmitExamResultsCommand`, authorized **ONCE up-front**) are **self-contained
  sequential runners** that re-use the single command once per item, **each in its
  OWN transaction** — no shared tx, no re-implemented rule, and they do **NOT** import
  the Certificate bulk runner. The **`examSessionId` contract is enforced, not
  decorative:** each runner loads the session's live candidate ids (create) / result
  ids (submit) ONCE up-front and fails any item that does not belong to the indicated
  session per-item (`CANDIDATE_NOT_IN_SESSION` / `RESULT_NOT_IN_SESSION`) — it never
  reaches the single command; a missing / soft-deleted / cross-session target is
  treated identically. Per-item errors are captured (`{ code, message }`), never
  thrown; unknown errors are sanitised to `INTERNAL_ERROR`. `stopOnFailure` (default
  `false`) continues past failures; `true` skips the rest. Returns
  `{ total, succeeded, failed, skipped, items }` with `total === succeeded + failed
  + skipped`.
- **Never mutates the candidate / session status** and **writes no
  `StudentSubject`/`Level`/`Course` progress row** (both asserted behaviourally +
  static guard). **`ExamEvent` (append-only) + `AuditLog` are written INSIDE the same
  tx** via `recordExamTransition` (`exam_result.created` / `.updated` / `.submitted`);
  a rollback discards both (proven by the fake-DB rollback tests). There is **NO bus**
  (Phase 14).
- **Teacher assignment-scoped entry is DEFERRED:** Phase 7 restricts result entry to
  holders of `exams.enterResults` / `exams.submitResults` (admin / secretary). No
  `teacherId` / `markerId` is ever trusted from input.
- **Validation:** `tsc --noEmit` ✅ · `vitest run src/modules/examinations` ✅
  (379 passed) · `eslint src/modules/examinations` ✅ · `prisma validate` ✅.

---


## 19. Resolved Decisions (closed for Phase 1)

All schema-blocking decisions are **closed**. No open decision remains.

| # | Decision | Resolution |
|---|----------|------------|
| **D1** | Exam result ownership | Examination Engine owns the **official exam fact**; the **Grade Engine owns the grade write** and imports exam facts via an explicit integration adapter (E-13). |
| **D2** | Manual approval | **Non-blocking gate** (`requiresApproval`), not a hard blocker. |
| **D3** | Financial clearance | Loaded through the **finance read-model** by the EligibilitySource; **snapshot** into the eligibility decision (`eligibilitySnapshot`) when recorded. |
| **D4** | Appeals | Use **`ExamResultRevision`** — no silent rewrite; original preserved. |
| **D5** | Transcript consumption | Transcript **does not read exam raw tables**; it consumes via Grade/Progression unless a later ADR approves direct official-result consumption. |
| **D6** | Teacher review | A teacher **cannot review their own marked result** unless explicitly assigned as reviewer **and** not the marker. |
| **D7** | Auto-registration | **Deferred** from v1.0 (manual + bulk only) unless explicitly enabled later. |
| **D8** | Exam attendance | **Separate** from class attendance; may feed result rules but **never mutates** the Attendance Engine, and exam absence does not directly finalize progression. |
| **D9** | Publication scope | **Per `ExamSession`** in v1.0; a period-level publish orchestrates sessions individually. |
| **D10** | Retraction | Creates a **revision/retraction outcome** + a **downstream transition event**; **never deletes** the published result. |
| **D11** | ExamRoom ownership | **Local v1 model**, explicitly designed for **future migration to a shared Location model** (via a later ADR). |
| **D12** | Attempts / Re-sits | **`ExamAttempt` is first-class** and **required in Phase 1**; `attemptNumber` scoped by `(enrollment, levelSubject)`; historical attempts never overwritten. |
| **D13** | Pass/fail ownership | An exam **outcome** (`PASSED_EXAM`/`FAILED_EXAM`) is **not** academic progression; Progression owns progression, Grade owns the final grade. |
| **D14** | Result revision model | **`ExamResultRevision`** is the append-only, single-current-revision mechanism; consumers read the **current official result** projection. |

---

## 20. Validation (Phase 0 self-check)

- ✅ **Only docs changed** — this file + [ADR-013](./adr/ADR-013-examination-engine.md).
- ✅ **No schema/code/migration/route/UI** — §3 describes design shapes; Phase 1 owns the
  schema. No existing engine changed.
- ✅ **Internally consistent** — the ExamResult lifecycle (§4), appeals (§11), publication
  (§10), integration (§12), and events (§13) all agree: **published results are immutable
  and superseded by `ExamResultRevision`** (H1 resolved). Attempts are modelled end-to-end
  (H2). Eligibility purity vs command-level operational checks is explicit (M1). Grade
  ownership is single-writer (E-13; M2/M4). ExamRoom ownership and result-revision are
  decided (M3/D11, D14).
- ✅ **No open schema-blocking decision remains** — D1–D14 closed (§19).
- ✅ **Consistent with frozen rules** — E-11/D5 uphold ADR-002 (Certificate/Transcript
  never read exam tables); E-2/E-10/D8/D13 uphold Academic Core / Attendance / Progression
  ownership (ADR-001); eligibility mirrors ADR-003; read/write separation ADR-007; Outbox
  ADR-006; snapshot immutability ADR-005; downstream staleness reuses ADR-009.

**Phase 1 Data Model may start.** The architecture is **frozen**; changes require a new ADR.
