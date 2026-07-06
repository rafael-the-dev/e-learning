# Academic Transcript Engine — Domain Model Specification

> ## ⚖️ Governing Rule
>
> **The Academic Transcript Engine is an append-only certification engine. It never
> mutates issued academic history; it only appends newer certified versions.**
>
> Every decision in this document derives from this single rule: immutable versions,
> snapshots, regeneration, supersession, auditing, checksums, export, and compliance.
> The division of labour is absolute:
>
> **Academic Core decides. Transcript Engine observes, freezes, and certifies. Never the
> reverse.**

> **Status:** Domain-modelling phase only. This document specifies models, lifecycles,
> flows, and rules. It contains **no code, no migrations, no UI**. Nothing here changes
> the existing academic engines. Terminology and field names are grounded in the real
> Prisma schema (`prisma/schema.prisma`) and the existing command/event/audit
> infrastructure verified in the codebase.

---

## 1. Executive Summary

The **Academic Transcript Engine** is the *official academic record layer*. It is a
**read-and-freeze** subsystem: it consumes the already-computed outputs of the Academic
Core and produces **immutable, versioned, auditable, reproducible** academic documents.

It **never** computes grades, statuses, attendance percentages, eligibility, or
completion. Those are owned — and remain owned — by the Grade Engine,
`GradeResolutionEngine`, `SubjectEligibilityEngine`, `LevelProgressionEngine`,
`CourseCompletionEngine`, and the Attendance Engine. The Transcript Engine's only job
is to **snapshot** the official outputs (`StudentSubjectProgress`,
`StudentLevelProgress`, `StudentCourseProgress`, `StudentSubjectAttendanceSummary`,
`StudentPeriodAttendanceSummary`, `StudentAssessmentResult`) together with the
**identity** of the academic structure at that moment (course/level/subject names and
codes) so the document stays historically accurate even when the live data later
changes.

Core design pillars:

1. **Source of truth is upstream.** Transcript rows are copies, not calculations.
2. **Snapshot immutability.** An `ISSUED` version is frozen; corrections create a *new
   version*, never a mutation.
3. **Versioning with supersession.** `v1 → v2 → v3`; only one `ISSUED` version is
   `current`; old versions are `SUPERSEDED`, never deleted.
4. **Staleness, not silent drift.** When upstream academic data changes after issue, the
   transcript is *marked* `needsRegeneration` — the issued document is untouched.
5. **Integrity via checksum.** Each issued version carries a deterministic checksum over
   its snapshot payload for tamper detection and reproducibility proof.
6. **Hybrid materialisation.** Portal *views* (student/guardian) read **live progress
   DTOs**; official documents read **persisted snapshot versions**. These are two
   distinct read paths and must never be conflated.

The engine slots into the existing architecture as a new domain module
`src/modules/transcripts/` with the standard layering
(`schemas → repositories → services/engines → commands → actions → components`), driven
by the `BaseCommand` pattern, wired to the existing `eventPublisher`/`CascadeContext`
event bus and `auditService`, and gated by CASL/RBAC. Note the permission key
`transcripts.view` **already exists** (`src/server/auth/permissions.ts:441`, currently
granted to `SECRETARY` and `STUDENT`); the remaining transcript permissions are net-new.

---

## 2. Domain Model (overview)

Persisted (official) models — all organization-scoped, all `@@map`-ed snake_case:

| Model | Grain | Mutability |
|---|---|---|
| `AcademicTranscript` | root aggregate per (student, scope, type) | mutable *metadata only* (status, currentVersion, stale flags) |
| `AcademicTranscriptVersion` | one immutable snapshot | immutable once `ISSUED` |
| `AcademicTranscriptLevel` | snapshot of one level in a version | immutable (child of version) |
| `AcademicTranscriptSubject` | snapshot of one subject in a level | immutable |
| `AcademicTranscriptAssessment` | snapshot of one component result | immutable |
| `AcademicTranscriptAttendance` | snapshot of attendance figures | immutable |
| `AcademicTranscriptEvent` | append-only history | append-only |
| `AcademicTranscriptRequest` *(optional)* | workflow for requested issuance | mutable status |
| `AcademicTranscriptExport` *(optional)* | export/render tracking | append-only |

Not persisted (display-only) — **DTOs, never tables**: `GUARDIAN_SUMMARY`,
`STUDENT_PORTAL_VIEW`, and all `Transcript*Dto` shapes in §13.

---

## 3. Relationship Diagram

```
                         AcademicTranscript (root)
                         │  organizationId, studentId, enrollmentId?, courseId?
                         │  transcriptNumber, transcriptType, status
                         │  currentVersionId ──────────────┐ (points to the current ISSUED version)
                         │  needsRegeneration, staleReason  │
                         │                                  │
        ┌────────────────┼──────────────────────┐          │
        │ 1..*           │ 1..*                  │ 1        │
        ▼                ▼                        ▼          │
 AcademicTranscript  AcademicTranscript     (metadata)      │
   Version              Event                               │
   │ versionNumber       transcriptId                       │
   │ status, checksum    eventType, actorId  ◄──────────────┘
   │ snapshotDate        previous/newStatus
   │ issuedAt/By
   │
   ├──1..*──► AcademicTranscriptLevel
   │            │ levelName/Code/Order (frozen identity)
   │            │ finalGrade, status, completedAt, earnedCredits, workloadHours
   │            │
   │            └──1..*──► AcademicTranscriptSubject
   │                         │ subjectName/Code/Order (frozen identity)
   │                         │ finalGrade, status, minimumPassingGrade
   │                         │ attendancePercentage, minimumAttendancePercentage
   │                         │ completedAt, earnedCredits, workloadHours, isRequired
   │                         │
   │                         ├──0..*──► AcademicTranscriptAssessment
   │                         │            title, componentName, sourceType,
   │                         │            grade, maxGrade, normalizedGrade, status
   │                         │
   │                         └──0..1──► AcademicTranscriptAttendance (subject-level)
   │
   └──0..*──► AcademicTranscriptAttendance (version/period-level, transcriptSubjectId null)

 AcademicTranscriptRequest ─(fulfilledTranscriptVersionId, optional)─► AcademicTranscriptVersion
 AcademicTranscriptExport  ─(transcriptVersionId)──────────────────► AcademicTranscriptVersion

 READ-ONLY SOURCES (never written by this engine):
   Student · Enrollment · Course · CourseLevel · Subject · LevelSubject ·
   StudentAssessmentResult · StudentSubjectProgress · StudentLevelProgress ·
   StudentCourseProgress · StudentSubjectAttendanceSummary ·
   StudentPeriodAttendanceSummary · AssessmentComponent · Assessment · AttendancePolicy
```

**Cardinality rules**

- `AcademicTranscript` 1 — N `AcademicTranscriptVersion` (versionNumber unique per root).
- `AcademicTranscript.currentVersionId` → at most one `ISSUED` version.
- A `Version` fully owns its Level/Subject/Assessment/Attendance rows (composition; they
  are meaningless outside the version and are created/frozen atomically with it).
- `AcademicTranscriptSubject.transcriptLevelId` is required (every subject snapshot
  belongs to a level snapshot, even for a single-level course).

---

## 4. Field-by-Field Model Specification

> **Type conventions** mirror the existing schema: ids are `String @id @default(cuid())`;
> grades/percentages are `Decimal @db.Decimal(5, 2)` (nullable where the source is
> nullable); status vocabularies are **String columns with a documented const-object
> union** (the project uses **no native DB enums** — see CLAUDE.md). All FKs use
> `onDelete: NoAction, onUpdate: NoAction` (the schema-wide convention). Snapshot child
> tables have **no `deletedAt`** — they are never soft-deleted (see §29/§32).

### 4.1 `AcademicTranscript` (root aggregate)

| Field | Type | Null | Notes |
|---|---|---|---|
| `id` | String cuid | no | PK |
| `organizationId` | String | no | tenant scope; every query filters on it |
| `studentId` | String | no | FK → `Student` |
| `enrollmentId` | String | yes | FK → `Enrollment`; **null for `FULL_ACADEMIC_HISTORY`** |
| `courseId` | String | yes | FK → `Course`; null for `FULL_ACADEMIC_HISTORY` |
| `transcriptType` | String | no | union — see §23 (`COURSE_TRANSCRIPT`, `LEVEL_TRANSCRIPT`, `TERM_REPORT`, `SUBJECT_REPORT`, `CERTIFICATE_SUPPORT`, `FULL_ACADEMIC_HISTORY`) |
| `scopeRef` | String | yes | disambiguator for level/term/subject-scoped roots (holds `courseLevelId` / `academicTermId` / `levelSubjectId` **as an operational pointer only**, never trusted for display) |
| `transcriptNumber` | String | no | human-facing document number, **unique per organization** |
| `status` | String | no | `DRAFT` \| `ISSUED` \| `SUPERSEDED` \| `REVOKED` (root-level lifecycle mirror; see §8 Q) |
| `currentVersionId` | String | yes | FK → `AcademicTranscriptVersion`; the current `ISSUED` version |
| `needsRegeneration` | Boolean | no | default `false`; set by stale-detection (§25) |
| `staleReason` | String | yes | last stale trigger (`grade.updated`, `attendance.subject_marked_incomplete`, …) |
| `staleDetectedAt` | DateTime | yes | when marked stale |
| `issuedAt` | DateTime | yes | first issuance timestamp (denormalised convenience) |
| `issuedBy` | String | yes | userId |
| `createdAt` / `updatedAt` | DateTime | no | standard |
| `deletedAt` | DateTime | yes | root may be soft-deleted (e.g. created-in-error `DRAFT`); **issued versions are never deleted** |

**Relations:** `student`, `enrollment?`, `course?`, `versions[]`, `events[]`, `currentVersion?`.

### 4.2 `AcademicTranscriptVersion`

| Field | Type | Null | Notes |
|---|---|---|---|
| `id` | String cuid | no | PK |
| `organizationId` | String | no | tenant scope |
| `transcriptId` | String | no | FK → `AcademicTranscript` |
| `versionNumber` | Int | no | 1-based; **unique per transcript** |
| `snapshotDate` | DateTime | no | the "as-of" moment the facts were frozen (passed in; see §32 on `Date.now()`) |
| `status` | String | no | `DRAFT` \| `ISSUED` \| `SUPERSEDED` \| `REVOKED` |
| `reason` | String (NVarChar Max) | yes | why this version exists (correction note) |
| `generatedBy` | String | yes | userId (or null for system-generated DRAFT) |
| `issuedBy` | String | yes | userId set on issue |
| `issuedAt` | DateTime | yes | set on issue |
| `supersededAt` | DateTime | yes | set when a newer version is issued |
| `revokedAt` | DateTime | yes | set on revocation |
| `revokedBy` | String | yes | userId |
| `revokeReason` | String (NVarChar Max) | yes | required when revoking |
| `checksum` | String | yes | sha256 hex of canonical snapshot payload (§26); set on issue |
| `studentSnapshot` | String (NVarChar Max) JSON | no | frozen student identity (name, code, dob, idNumber) |
| `courseSnapshot` | String (NVarChar Max) JSON | yes | frozen course identity (name, code, category) |
| `createdAt` | DateTime | no | standard |

**Relations:** `transcript`, `levels[]`, `attendances[]`, `exports[]`.
**No `updatedAt`, no `deletedAt`** — an issued version is append-then-freeze.

> Student/course identity is captured **both** as denormalised JSON on the version
> (`studentSnapshot`, `courseSnapshot`) *and* on the structured child rows for levels /
> subjects. JSON gives a cheap reproducible payload for checksum + PDF; structured rows
> give queryable/reportable snapshots.

### 4.3 `AcademicTranscriptLevel`

Snapshots `StudentLevelProgress` + `CourseLevel` identity.

| Field | Type | Null | Source |
|---|---|---|---|
| `id` | String cuid | no | — |
| `organizationId` | String | no | tenant |
| `transcriptVersionId` | String | no | FK → version |
| `courseLevelId` | String | yes | operational pointer → `CourseLevel` (may later be deleted; snapshot survives) |
| `levelName` | String | no | frozen ← `CourseLevel.name` |
| `levelCode` | String | yes | frozen ← `CourseLevel.code` |
| `levelOrder` | Int | no | frozen ← `CourseLevel.order` |
| `finalGrade` | Decimal(5,2) | yes | ← `StudentLevelProgress.finalGrade` |
| `status` | String | no | ← `StudentLevelProgress.status` (`NOT_STARTED`…`COMPLETED`, see §6) |
| `completedAt` | DateTime | yes | ← `StudentLevelProgress.completedAt` |
| `startedAt` | DateTime | yes | optional ← derived from first progress `createdAt` (documented derivation, not a recalculation) |
| `earnedCredits` | Int | yes | ← `StudentLevelProgress.earnedCredits` |
| `workloadHours` | Int | yes | frozen ← `CourseLevel.totalHours` |

### 4.4 `AcademicTranscriptSubject`

Snapshots `StudentSubjectProgress` + `LevelSubject` + `Subject` identity + subject
attendance summary status.

| Field | Type | Null | Source |
|---|---|---|---|
| `id` | String cuid | no | — |
| `organizationId` | String | no | tenant |
| `transcriptVersionId` | String | no | FK → version (denormalised for query convenience) |
| `transcriptLevelId` | String | no | FK → level snapshot |
| `levelSubjectId` | String | yes | pointer → `LevelSubject` |
| `subjectId` | String | yes | pointer → `Subject` |
| `subjectName` | String | no | frozen ← `Subject.name` |
| `subjectCode` | String | yes | frozen ← `Subject.code` |
| `subjectOrder` | Int | no | frozen ← `LevelSubject.order` |
| `finalGrade` | Decimal(5,2) | yes | ← `StudentSubjectProgress.finalGrade` |
| `status` | String | no | ← `StudentSubjectProgress.status` (incl. `INCOMPLETE`, `RECOVERY_REQUIRED`, `BLOCKED`) |
| `minimumPassingGrade` | Decimal(5,2) | yes | frozen ← `LevelSubject.minimumPassingGrade` |
| `attendancePercentage` | Decimal(5,2) | yes | ← `StudentSubjectProgress.attendancePercentage` (already reconciled by the Attendance Engine; **not recomputed**) |
| `minimumAttendancePercentage` | Decimal(5,2) | yes | frozen ← `LevelSubject.minimumAttendancePercentage` |
| `completedAt` | DateTime | yes | ← `StudentSubjectProgress.completedAt` |
| `earnedCredits` | Int | yes | frozen ← `LevelSubject.credits` (only if subject passed; copied as-is) |
| `workloadHours` | Int | yes | frozen ← `LevelSubject.workloadHours` |
| `isRequired` | Boolean | no | frozen ← `LevelSubject.isRequired` |
| `recoveryStatus` | String | yes | optional; derived label when `status = RECOVERY_REQUIRED` / recovered (copied from progress, no recompute) |

### 4.5 `AcademicTranscriptAssessment`

Snapshots component-level `StudentAssessmentResult` rows. Present only for **detailed**
transcripts (§12).

| Field | Type | Null | Source |
|---|---|---|---|
| `id` | String cuid | no | — |
| `organizationId` | String | no | tenant |
| `transcriptSubjectId` | String | no | FK → subject snapshot |
| `studentAssessmentResultId` | String | yes | pointer → `StudentAssessmentResult` |
| `assessmentComponentId` | String | yes | pointer → `AssessmentComponent` |
| `assessmentEventId` | String | yes | pointer → `Assessment` (nullable there too) |
| `title` | String | yes | frozen ← `Assessment.title` (null for pure `CONTINUOUS`) |
| `componentName` | String | no | frozen ← `AssessmentComponent.name` |
| `componentType` | String | yes | frozen ← `AssessmentComponent.componentType` (`TEST`…`FINAL_EXAM`\|`RECOVERY`) |
| `sourceType` | String | no | frozen ← `StudentAssessmentResult.sourceType` (`CONTINUOUS`\|`SCHEDULED_EVENT`\|`RECOVERY`) |
| `grade` | Decimal(5,2) | no | ← `StudentAssessmentResult.grade` |
| `maxGrade` | Decimal(5,2) | no | ← `StudentAssessmentResult.maxGrade` |
| `normalizedGrade` | Decimal(5,2) | no | ← `StudentAssessmentResult.normalizedGrade` |
| `status` | String | no | ← `StudentAssessmentResult.status` (`DRAFT`\|`SUBMITTED`\|`GRADED`\|`CANCELLED`) |
| `gradedAt` | DateTime | yes | ← `StudentAssessmentResult.gradedAt` |
| `isRecovery` | Boolean | no | derived: `sourceType === "RECOVERY"` (copied, not computed grade-wise) |
| `recoveryAttemptNumber` | Int | yes | optional ← `AssessmentRetake.attemptNumber` when linkable |

> **Only `status = GRADED` results are eligible for a snapshot.** `CANCELLED`/`DRAFT`
> results are excluded (they are not official). This is a *filter*, not a recalculation.

### 4.6 `AcademicTranscriptAttendance`

Freezes attendance figures used in the transcript. Can attach at subject grain (from
`StudentSubjectAttendanceSummary`) or period grain (from
`StudentPeriodAttendanceSummary`).

| Field | Type | Null | Source |
|---|---|---|---|
| `id` | String cuid | no | — |
| `organizationId` | String | no | tenant |
| `transcriptVersionId` | String | no | FK → version |
| `transcriptSubjectId` | String | yes | FK → subject snapshot (null for period-level rows) |
| `levelSubjectId` | String | yes | pointer |
| `academicYearId` | String | yes | pointer (period-level) |
| `academicTermId` | String | yes | pointer (period-level) |
| `attendancePercentage` | Decimal(5,2) | yes | ← summary `attendancePercentage` |
| `totalSessions` | Int | no | ← summary `totalSessions` |
| `totalPresentMinutes` | Int | no | ← summary `totalPresentMinutes` |
| `totalScheduledMinutes` | Int | no | ← summary `totalScheduledMinutes` |
| `status` | String | no | ← summary `status` (subject: `SUFFICIENT`\|`AT_RISK`\|`BELOW_REQUIRED`; period: `GOOD`\|`AT_RISK`\|`BELOW_REQUIRED`) |
| `policyId` | String | yes | pointer ← `attendancePolicyId` in effect |
| `policyName` | String | yes | frozen ← `AttendancePolicy.name` |
| `minimumAttendancePercentage` | Decimal(5,2) | yes | frozen ← `LevelSubject.minimumAttendancePercentage` |
| `calculatedAt` | DateTime | yes | ← summary `calculatedAt` (proves which recalculation was frozen) |

### 4.7 `AcademicTranscriptEvent`

Append-only history (parallel to, and in addition to, the platform `auditLog`).

| Field | Type | Null | Notes |
|---|---|---|---|
| `id` | String cuid | no | — |
| `organizationId` | String | no | tenant |
| `transcriptId` | String | no | FK → root |
| `transcriptVersionId` | String | yes | FK → version (null for root-only events) |
| `eventType` | String | no | see §14 list |
| `previousStatus` | String | yes | |
| `newStatus` | String | yes | |
| `reason` | String (NVarChar Max) | yes | |
| `actorId` | String | yes | null when system-triggered (mirrors course-completion convention) |
| `metadata` | String (NVarChar Max) JSON | yes | e.g. checksum, exportType, staleTrigger |
| `createdAt` | DateTime | no | append-only |

### 4.8 `AcademicTranscriptRequest` *(optional, Phase 3)*

| Field | Type | Null | Notes |
|---|---|---|---|
| `id`, `organizationId` | | | standard |
| `studentId` | String | no | FK |
| `enrollmentId` | String | yes | FK |
| `courseId` | String | yes | FK |
| `requestedBy` | String | no | userId |
| `requestType` | String | no | maps to a `transcriptType` |
| `status` | String | no | `PENDING`\|`APPROVED`\|`REJECTED`\|`FULFILLED`\|`CANCELLED` |
| `reason` | String (NVarChar Max) | yes | |
| `reviewedBy` | String | yes | userId |
| `reviewedAt` | DateTime | yes | |
| `fulfilledTranscriptVersionId` | String | yes | FK → the issued version that fulfilled it |
| `createdAt` / `updatedAt` | DateTime | no | |

### 4.9 `AcademicTranscriptExport` *(optional, Phase 2/3)*

| Field | Type | Null | Notes |
|---|---|---|---|
| `id`, `organizationId` | | | standard |
| `transcriptVersionId` | String | no | FK → the exported version |
| `exportType` | String | no | `PDF`\|`EXCEL`\|`API`\|`MINISTRY` |
| `fileUrl` | String | yes | from `storage.getUrl`/`getSignedUrl` (`src/infrastructure/storage`) |
| `fileChecksum` | String | yes | sha256 of the rendered artifact (distinct from version checksum) |
| `status` | String | no | `PENDING`\|`READY`\|`FAILED` |
| `exportedBy` | String | yes | userId |
| `exportedAt` | DateTime | yes | |
| `createdAt` | DateTime | no | |

---

## 5. Lifecycle / State Machines

### 5.1 `AcademicTranscriptVersion.status`

```
        generate                 issue                 (newer version issued)
  ∅ ───────────► DRAFT ─────────────────► ISSUED ─────────────────────────► SUPERSEDED
                  │  ▲                       │                                    │
       regenerate │  │ regenerate            │ revoke                             │ revoke
                  ▼  │ (new DRAFT)           ▼                                    ▼
                 DRAFT (discardable)       REVOKED  ◄──────────────────────── REVOKED
```

Transitions & guards:

- `∅ → DRAFT` — `GenerateTranscriptSnapshotCommand`. Requires `transcripts.generate`.
- `DRAFT → DRAFT` — regeneration overwrites/creates a fresh DRAFT (a DRAFT is
  **discardable and re-computable**; not immutable).
- `DRAFT → ISSUED` — `IssueTranscriptCommand`. Freezes rows, computes `checksum`, sets
  `issuedAt`/`issuedBy`, supersedes the prior `ISSUED` version (if any), updates
  `AcademicTranscript.currentVersionId`. Requires `transcripts.issue`.
- `ISSUED → SUPERSEDED` — side-effect of issuing a newer version. Never a direct action.
- `ISSUED → REVOKED` / `SUPERSEDED → REVOKED` — `RevokeTranscriptCommand`. Sets
  `revokedAt`/`revokedBy`/`revokeReason`. Requires `transcripts.revoke`.
- **No transition mutates snapshot child rows.** Only metadata columns change.

Terminal states: `REVOKED` (cannot leave). `SUPERSEDED` can only go to `REVOKED`.

### 5.2 `AcademicTranscript.status` (root mirror)

`DRAFT` (no issued version yet) → `ISSUED` (has a current issued version) →
`SUPERSEDED` is **not** used at root (root stays `ISSUED` while any version is current)
→ `REVOKED` (all versions revoked). Root staleness is orthogonal
(`needsRegeneration` flag), it does **not** change `status`.

### 5.3 `AcademicTranscriptRequest.status`

```
PENDING ──approve──► APPROVED ──fulfil──► FULFILLED
   │                    │
   │reject              │(generate+issue links fulfilledTranscriptVersionId)
   ▼                    │
REJECTED                └─► (cancel any time before fulfil) ─► CANCELLED
PENDING ──cancel──► CANCELLED
```

---

## 6. Source-of-Truth Rules

**The Transcript Engine reads; it never writes to, and never recomputes, the Academic
Core.** Field-by-field provenance (verified against `prisma/schema.prisma`):

| Snapshot field | Authoritative source | Rule |
|---|---|---|
| level `finalGrade`, `status`, `completedAt`, `earnedCredits` | `StudentLevelProgress` | copy verbatim |
| subject `finalGrade`, `status`, `completedAt`, `attendancePercentage` | `StudentSubjectProgress` | copy verbatim |
| subject `minimumPassingGrade`, `minimumAttendancePercentage`, `isRequired`, `workloadHours`, `earnedCredits` | `LevelSubject` | freeze identity/thresholds |
| course `finalGrade`, `status`, `completedAt` | `StudentCourseProgress` | copy verbatim |
| assessment `grade`, `maxGrade`, `normalizedGrade`, `status`, `sourceType`, `gradedAt` | `StudentAssessmentResult` | copy verbatim (`GRADED` only) |
| attendance figures & status | `StudentSubjectAttendanceSummary` / `StudentPeriodAttendanceSummary` | copy verbatim |
| level/subject/course **names & codes** | `CourseLevel` / `Subject` / `LevelSubject` / `Course` | freeze at snapshot time |
| student identity | `Student` (`firstName`, `lastName`, `code`, `idNumber`, `dateOfBirth`) | freeze at snapshot time |
| policy identity | `AttendancePolicy.name` | freeze |

**Status vocabularies are copied as-is** — the transcript stores the exact upstream
string, it does not re-derive PASS/FAIL. Authoritative unions (from schema comments):

- Subject: `NOT_STARTED | IN_PROGRESS | PASSED | FAILED | RECOVERY_REQUIRED | INCOMPLETE | BLOCKED`
- Level: `NOT_STARTED | IN_PROGRESS | PASSED | FAILED | RECOVERY_REQUIRED | ELIGIBLE_TO_PROGRESS | PROMOTED | PROMOTED_WITH_PENDING_SUBJECTS | BLOCKED | COMPLETED`
- Course: `NOT_STARTED | IN_PROGRESS | PASSED | FAILED | RECOVERY_REQUIRED | COMPLETED`
- Subject attendance: `NOT_STARTED | SUFFICIENT | AT_RISK | BELOW_REQUIRED`
- Period attendance: `GOOD | AT_RISK | BELOW_REQUIRED`

**Forbidden inside the engine:** averaging grades, deriving pass/fail, recomputing
attendance %, evaluating eligibility, deciding completion. If a number isn't present
upstream, the transcript shows it as null/absent — it does **not** compute a substitute.

---

## 7. Snapshot / Versioning Rules

1. A version freezes **facts + identity** at `snapshotDate`.
2. Issued versions are **immutable**: no update to grades, statuses, attendance,
   identity, or child rows; no deletion of child rows.
3. Every correction ⇒ a **new** version (`versionNumber = max + 1`). The old version is
   preserved and marked `SUPERSEDED`.
4. Exactly **one** `ISSUED` version is `current` per root (`currentVersionId`), enforced
   by a **filtered unique index** (§32) — SQL Server cannot express "one current" with a
   plain unique.
5. `versionNumber` is **unique per transcript** (`@@unique([transcriptId, versionNumber])`).
6. Downstream identity drift (course renamed, subject archived, level reordered) does
   **not** touch issued snapshots — the whole point of freezing names/codes/orders.
7. A version's checksum makes it **reproducible**: regenerating the same source data at
   the same `snapshotDate` yields the same checksum (§26).

---

## 8. Generation Flow — `GenerateTranscriptSnapshotCommand`

Follows `BaseCommand.run()` → `validate()` → `authorize()` → `execute()`
(`src/shared/lib/command.ts`).

**Input** (`organizationId`/`userId` come from `ServiceContext`, **never** from input):
`{ studentId, enrollmentId? | courseId?, transcriptType, scopeRef?, detailLevel: "SUMMARY"|"DETAILED", reason?, snapshotDate }`.

- `validate()`: Zod parse; verify student/enrollment/course exist **and belong to
  `context.organizationId`** (throws `NotFoundError`/`ValidationError`). For
  `FULL_ACADEMIC_HISTORY`, `enrollmentId`/`courseId` may be null.
- `authorize()`: `getUserPermissions(context.userId, context.organizationId)` +
  `createAbility(perms).can(PERMISSIONS.TRANSCRIPTS_GENERATE)`; else `AuthorizationError`.
  Portal self-service requests route through `transcripts.request`, not `generate`.
- `execute()` inside `db.$transaction(tx => …)`:
  1. Load `Student` (identity) scoped by org.
  2. Load `Enrollment` (+ `Course`) or the set of enrollments (full history).
  3. Load `StudentCourseProgress` (per enrollment).
  4. Load `CourseLevel[]` + `StudentLevelProgress[]`.
  5. Load `LevelSubject[]` + `Subject` + `StudentSubjectProgress[]`.
  6. If `DETAILED`: load `StudentAssessmentResult[]` (status `GRADED`) + component/event identity.
  7. Load `StudentSubjectAttendanceSummary[]` (+ optional `StudentPeriodAttendanceSummary`) + `AttendancePolicy` names.
  8. Assemble the **canonical snapshot payload** (deterministic ordering — §26).
  9. Create `AcademicTranscript` if none exists for (student, scope, type); else reuse root.
  10. Create `AcademicTranscriptVersion` (`status = DRAFT`, `versionNumber = max+1`) + all child rows.
  11. Compute and store `checksum` (also computed for DRAFT so diffs are cheap).
  12. `auditService.log(context, { entity: "AcademicTranscriptVersion", entityId, action: "transcript.generated", newValues }, tx)`.
  13. Collect `transcript.generated` event via `CascadeContext.emitOrCollect`; publish **post-commit** through `eventPublisher.publish`.

**Answering the §8 open questions (recommendations):**

- **One transcript per enrollment or per course?** The official grain is
  **per (student, transcriptType, scopeRef)**. For `COURSE_TRANSCRIPT` the scope is the
  enrollment (`StudentCourseProgress.enrollmentId` is `@unique`, so one course transcript
  per enrollment). `FULL_ACADEMIC_HISTORY` is student-scoped (spans enrollments).
- **Multiple transcript types per student?** Yes — the `transcriptType` discriminator on
  the root allows a course transcript, a certificate-support transcript, and a full
  history to coexist.
- **`transcriptNumber` unique per organization?** Yes.
- **Can a DRAFT be regenerated?** Yes — a DRAFT is discardable and recomputable; only
  `ISSUED` is frozen.

---

## 9. Issue Flow — `IssueTranscriptCommand`

- `authorize()`: `PERMISSIONS.TRANSCRIPTS_ISSUE`.
- `execute()` in a transaction:
  1. Load target `DRAFT` version; assert it is `DRAFT` and belongs to org (`BusinessRuleError` otherwise).
  2. Recompute checksum from stored child rows and confirm it matches the stored DRAFT checksum (integrity gate before freezing).
  3. Set `status = ISSUED`, `issuedAt`, `issuedBy`, freeze checksum.
  4. If a prior `ISSUED` version exists: set it `SUPERSEDED`, `supersededAt`.
  5. Update `AcademicTranscript.currentVersionId`, `status = ISSUED`, `issuedAt`/`issuedBy` (first issue), clear `needsRegeneration`/`staleReason`/`staleDetectedAt`.
  6. Audit `transcript.issued` (+ `transcript.superseded` for the prior version); emit both events post-commit.
- **After issue:** the only permitted mutations are `revoke`, `supersede` (by newer
  issue), `export`, and `mark stale` (root flag). No snapshot mutation. Ever.

---

## 10. Regeneration / Correction Flow — `RegenerateTranscriptCommand`

When academic data changes after issuance:

1. Do **not** mutate the issued version.
2. Run generation again → produces a new `DRAFT` (`versionNumber = current + 1`) with a
   fresh checksum. Emit `transcript.regenerated`.
3. Optional **diff**: compare new DRAFT payload vs current `ISSUED` payload (field-level
   diff surfaced in review UI) so an operator confirms the change is intended.
4. On approval, `IssueTranscriptCommand` issues it as the new current version; the prior
   `ISSUED` becomes `SUPERSEDED`.
5. Events, in order: `transcript.regenerated` → (`transcript.superseded`) → `transcript.issued`.

---

## 11. Revocation Flow — `RevokeTranscriptCommand`

- Applies to an `ISSUED` or `SUPERSEDED` version.
- Sets `revokedAt`, `revokedBy`, `revokeReason`, `status = REVOKED`.
- **Never deletes** any row. If the revoked version was `current`, clear
  `AcademicTranscript.currentVersionId` (or point it to the newest non-revoked issued
  version, per policy — see Open Decisions).
- Audit + `transcript.revoked` event.

---

## 12. Eligibility to Issue

The Transcript Engine can produce a transcript **at any time** (a DRAFT of an in-progress
course is valid). It does **not** own certificate/diploma eligibility. It **exposes
facts** (course status, pending required subjects, attendance status) for consumption by
a future `CertificateEligibilityEngine`.

`CERTIFICATE_SUPPORT` transcripts *may* be gated at the **command layer** (not inside the
snapshot logic) by asserting, before issue:

- `StudentCourseProgress.status === "COMPLETED"`,
- no `AcademicTranscriptSubject` with `isRequired = true` in a non-passing status,
- attendance satisfied where `AttendancePolicy.enforceAttendanceForProgress` was on,
- (optional) financial clearance / certificate approval — delegated, not decided here.

This gating is a **validation guard**, not a recalculation of eligibility.

**Summary vs Detailed:** support both. `SUMMARY` snapshots levels + subjects (final
grades/status/attendance). `DETAILED` additionally snapshots `AcademicTranscriptAssessment`
component rows. Controlled by the `detailLevel` input, not by a separate model.

---

## 13. Transcript Types & DTOs

### 13.1 Official (persisted snapshot versions)

`COURSE_TRANSCRIPT`, `LEVEL_TRANSCRIPT`, `TERM_REPORT`, `SUBJECT_REPORT`,
`CERTIFICATE_SUPPORT`, `FULL_ACADEMIC_HISTORY`.

### 13.2 Display-only (DTOs, **never persisted as versions**)

`GUARDIAN_SUMMARY`, `STUDENT_PORTAL_VIEW` — these read **live** progress via read DTOs
(§24 hybrid). They are not documents; they must never carry a `transcriptNumber` or
`checksum`.

### 13.3 DTO catalogue (read models)

- `TranscriptSummaryDto` — root + current version header (number, type, status, issuedAt, checksum, isCurrent, needsRegeneration).
- `TranscriptDetailDto` — full snapshot tree of one version (levels → subjects → [assessments] + attendance).
- `TranscriptVersionDto` — version metadata + lineage (supersededBy/supersedes).
- `TranscriptLevelDto`, `TranscriptSubjectDto`, `TranscriptAssessmentDto`, `TranscriptAttendanceDto` — row projections.
- **Live** portal DTOs (`GuardianSummaryDto`, `StudentPortalAcademicDto`) — assembled
  from `StudentCourseProgress`/`StudentLevelProgress`/`StudentSubjectProgress` at read
  time; **explicitly labelled "não-oficial / pré-visualização"** in the UI to avoid being
  mistaken for an issued document.

All user-visible strings are **PT-PT**; enum/status values stay English and are mapped
through label lookup tables at render time (per `.claude/skills/i18n.md`).

---

## 14. Events & Audit

### 14.1 Transcript domain events (net-new `DomainEventType` entries)

To be added under `src/server/events/event-types.ts`, aggregate type `TRANSCRIPT`
(net-new in `DomainAggregateType`):

- `transcript.generated`
- `transcript.issued`
- `transcript.superseded`
- `transcript.revoked`
- `transcript.regenerated`
- `transcript.exported`
- `transcript.marked_stale`

Emission uses the existing `CascadeContext.emitOrCollect` (buffer in tx, publish
post-commit) and `eventPublisher.publish`, exactly as the grade/completion cascades do.

### 14.2 Academic events the engine *listens to* (for staleness — §25)

Confirmed existing `DomainEventType` strings the stale-detector subscribes to:

- `student_subject.passed`, `student_subject.failed`
- `student_course.completed`, `student_course.reopened`, `student_course.invalidated`, `student_course.restored`
- `attendance.subject_marked_incomplete`, `attendance.subject_recovered_from_incomplete`
- `attendance.summary_recalculated`, `attendance.period_summary_recalculated`
- `assessment.results_published`

> **⚠ Gap to resolve (Open Decision):** *level progression emits no domain event.* In the
> codebase `level_progression.approved` / `level_progression.blocked` exist **only as
> `auditLog` action strings** (`src/modules/prerequisites/actions/prerequisite.actions.ts`),
> **not** in `DomainEventType`. Also `grade.updated` and
> `assessment_result.invalidated` (named in the brief) are **audit actions, not domain
> events** today. So stale-detection on grade edits / level promotion cannot rely on an
> event bus subscription yet. Options: (a) promote these to real domain events;
> (b) have the transcript engine additionally hook the grade/level commands; (c) run a
> periodic reconciliation that compares a lightweight source-hash against issued
> checksums. **Recommendation:** (a) for level progression + grade update (small, aligns
> with "transition-only events"), plus (c) as a safety net.

### 14.3 Audit

Every state change also writes `auditService.log(context, { entity, entityId, action,
oldValues, newValues }, tx)` (`src/modules/audit-logs/services/audit.service.ts`), joining
the command transaction. Audit **actions** (dotted strings, matching existing convention):
`transcript.generated`, `transcript.issued`, `transcript.superseded`, `transcript.revoked`,
`transcript.regenerated`, `transcript.exported`, `transcript.marked_stale`. Each carries
`actor` (`context.userId`, or `null` for system-triggered stale marks — mirroring the
course-completion `actorId: null` convention), `reason`, `oldValues.status`,
`newValues.status`, and `transcriptVersionId` in `newValues`.

`AcademicTranscriptEvent` is the **domain-specific append-only history** (queryable per
transcript for the document's own timeline UI); `auditLog` is the **platform-wide** trail.
Both are written — they serve different consumers.

---

## 15. RBAC / Security Model

### 15.1 Permissions (`src/server/auth/permissions.ts`)

`transcripts.view` **already exists** (line 441). Net-new keys (dot convention, camelCase
module to match newer academic keys):

| Key | Purpose |
|---|---|
| `transcripts.view` *(exists)* | view any org transcript |
| `transcripts.viewOwn` | student self-view of own issued transcripts |
| `transcripts.generate` | create DRAFT snapshot |
| `transcripts.issue` | issue / regenerate-then-issue |
| `transcripts.revoke` | revoke a version |
| `transcripts.export` | render/export a version |
| `transcripts.request` | student/guardian request issuance |

### 15.2 Role mapping (`ROLE_PERMISSIONS`)

| Role | Grants |
|---|---|
| `SUPER_ADMIN` | all (`Object.values(PERMISSIONS)`) — tenant-safe |
| `ORG_ADMIN` | all transcript perms |
| `SECRETARY` | `view`, `generate`, `issue` (if org policy allows), `export`, `request` |
| `TEACHER` | `view` **only for scoped students** (via `resolveDataAccessScope`), if policy allows |
| `STUDENT` | `viewOwn`, `request` |
| `GUARDIAN` | `view` linked student **only if `GuardianStudent.canViewAcademic`** |

### 15.3 Tenant & scope enforcement (server-side, always)

- `organizationId` derives from `context` only — never from input/URL.
- Every generate/issue validates that student/enrollment/course belong to the org.
- **Teacher:** `resolveDataAccessScope(context)` → when `type === "teacher"`, restrict
  reads to that teacher's students (`teacher-scope.ts`).
- **Student:** `resolveStudentDataAccessScope(context)` → `studentId` locked to the
  caller; `viewOwn` returns only `ISSUED` versions belonging to that student.
- **Guardian:** `validateGuardianStudentAccess(context, studentId)` must return an active
  link **and** `canViewAcademic === true`; otherwise deny (`guardian-scope.ts`).
- **Cross-tenant:** an id from another org resolves to `NotFoundError` (never leaks
  existence). No `include`/`select` that returns `passwordHash`, tokens, or unrelated
  tenant data.
- Portal DTOs mask unpublished grades exactly as the existing student portal does
  (published-grade masking is a pre-existing rule — the transcript live view must reuse
  it, not bypass it).

---

## 16. SQL Server Constraints & Indexes

Grounded in the schema's existing SQL-Server conventions and the project's migration
gotchas (see memory: *SQL Server migration gotchas*):

- **`transcriptNumber` unique per org** → filtered unique index
  `WHERE deletedAt IS NULL` (a plain `@@unique` blocks re-use after soft-delete and SQL
  Server treats multiple NULLs as duplicates).
- **`versionNumber` unique per transcript** → `@@unique([transcriptId, versionNumber])`
  (non-nullable, plain unique is fine).
- **One current issued version** → **filtered unique index** on
  `(transcriptId) WHERE status = 'ISSUED'`  *(or on `currentVersionId` presence)* — Prisma
  `@@unique` cannot express the predicate; declare it hand-written in the migration.
- **Immutable issued rows** enforced at the **application layer** (SQL Server lacks cheap
  row-immutability); optionally a trigger later, but the command layer is the guard.
- **Cascade deletes restricted:** all FKs `onDelete: NoAction, onUpdate: NoAction`
  (schema-wide convention) — a deleted source `CourseLevel`/`Subject` must **not** cascade
  into snapshot rows.
- **No hard-delete of snapshot tables** (Level/Subject/Assessment/Attendance have no
  `deletedAt` and are never removed).
- **Indexes** (all lead with `organizationId` per convention):
  - `AcademicTranscript`: `(organizationId, studentId)`, `(organizationId, enrollmentId)`, `(organizationId, courseId)`, `(organizationId, status)`, `(organizationId, transcriptType)`, `(organizationId, needsRegeneration)`.
  - `AcademicTranscriptVersion`: `(organizationId, transcriptId)`, `(organizationId, status)`, `(organizationId, issuedAt)`, `(organizationId, checksum)`.
  - child rows: `(organizationId, transcriptVersionId)` and the level→subject FK columns.
  - `AcademicTranscriptEvent`: `(organizationId, transcriptId)`, `(organizationId, createdAt)`.
- **Migration ordering gotcha:** split `ALTER TABLE … ADD COLUMN` from statements that
  reference the new column in the same batch (SQL Server compiles the batch before the
  column exists).
- **Decimals:** grades/percentages `Decimal @db.Decimal(5, 2)` to match every upstream
  source column exactly (no precision drift on copy).
- Long text (`reason`, `staleReason`, JSON snapshots, `metadata`) → `@db.NVarChar(Max)`.

---

## 17. DTOs (read-model summary)

Reiterating §13.3 for the "output required" checklist:

- **Official read path** (snapshot): `TranscriptSummaryDto`, `TranscriptDetailDto`,
  `TranscriptVersionDto`, `TranscriptLevelDto`, `TranscriptSubjectDto`,
  `TranscriptAssessmentDto`, `TranscriptAttendanceDto` — all projected from persisted
  `AcademicTranscript*` rows, safe to serve to PDF/Excel/API/ministry consumers.
- **Live read path** (portals): `StudentPortalAcademicDto`, `GuardianSummaryDto` —
  assembled from live progress models, labelled non-official, subject to guardian
  visibility flags + published-grade masking.

No DTO exposes `organizationId`-crossing data, internal ids beyond what the client needs,
or any sensitive relation.

---

## 18. Test Plan

Mapping the 20 required scenarios to concrete assertions (vitest, per `pnpm test`):

| # | Scenario | Assertion |
|---|---|---|
| 1 | Generates snapshot from existing progress | version + child rows created; values equal source rows |
| 2 | Does not recalculate grades | mutate `StudentSubjectProgress.finalGrade` after generate → issued snapshot unchanged |
| 3 | Does not recalculate attendance | same for `attendancePercentage` |
| 4 | Issued version immutable | any mutate attempt on an `ISSUED` version's rows rejected (`BusinessRuleError`) |
| 5 | Regeneration creates v2 | `versionNumber === 2`; new checksum |
| 6 | v1 remains unchanged | v1 rows byte-identical after v2 issue |
| 7 | Supersede prior on v2 issue | v1 `status = SUPERSEDED`, `supersededAt` set; `currentVersionId = v2` |
| 8 | Revocation does not delete | rows persist; `status = REVOKED` |
| 9 | Checksum changes when snapshot changes | different source data ⇒ different checksum |
| 10 | Checksum stable for same snapshot | identical source + `snapshotDate` ⇒ identical checksum |
| 11 | Guardian sees only linked student (+`canViewAcademic`) | cross-link / flag-off ⇒ deny |
| 12 | Student sees only own transcripts | other student's id ⇒ `NotFoundError` |
| 13 | Teacher sees only scoped students | out-of-scope student ⇒ deny |
| 14 | Cross-tenant blocked | other-org id ⇒ `NotFoundError`, no existence leak |
| 15 | Marked stale after grade change | `needsRegeneration = true`, `staleReason` set; issued version untouched |
| 16 | Marked stale after attendance change | same via `attendance.summary_recalculated` |
| 17 | Portal DTO live, official uses snapshot | portal reflects new grade instantly; issued snapshot does not |
| 18 | Export logs event | `AcademicTranscriptExport` row + `transcript.exported` event + audit |
| 19 | Deleted subject/course name persists | archive `Subject` after issue → snapshot still shows original `subjectName`/`subjectCode` |
| 20 | Changed policy doesn't mutate old transcript | edit `AttendancePolicy` after issue → snapshot `policyName`/thresholds unchanged |

Plus: pure-function tests for the canonical-payload serializer and checksum determinism;
authorization tests per command (`validate`/`authorize` paths).

---

## 19. Closed Decisions

> Reviewed and closed in the Architecture Review & Decision Closure pass. These are
> **final** — the backend starts without ambiguity. The review also folded four schema
> corrections into the spec (see the change note at the end of this section).

**D1 — Academic events → promote 4 audit strings to `DomainEventType`.**
`grade.updated`, `assessment_result.invalidated`, `level_progression.approved`,
`level_progression.blocked` become real domain events (AuditLog kept in parallel).
`aggregateType = STUDENT`, `aggregateId = studentId`, emitted **only on real change**
(`GradeChangeLog` is the "real change" gate for grades), published post-commit via
`CascadeContext.emitOrCollect`. Payloads in §14.1. Duplication with
`student_subject.passed/failed` is harmless — stale-marking is idempotent.

**D2 — Stale detection → in-scope events + nightly reconciliation safety net.**
Stale triggers: the D1 events + `student_subject.passed/failed` +
`student_course.completed/reopened/invalidated/restored` +
`attendance.summary_recalculated/subject_marked_incomplete/subject_recovered_from_incomplete`.
Only marks when a **current `ISSUED`** version exists **and** the changed entity is in the
transcript's scope. Marking is idempotent and only sets a flag — never auto-regenerates,
so no loop (`transcript.marked_stale` has no academic consumer). Reconciliation job
compares a source-hash to the issued checksum as a backstop. `needsRegeneration` cleared
on successful `IssueTranscriptCommand`.

**D3 — Revocation of current version → Option B: `currentVersionId = null`.**
Plus `needsRegeneration = true`, `staleReason = "current_version_revoked"`. Root `status`
→ `REVOKED` only if **all** versions are revoked. Rejected: (A) reviving a superseded
(corrected) version as current re-exposes wrong data; (C) auto-generation violates
deliberate, authorized issuance.

**D4 — Root status → keep denormalized, as a transactional projection.**
`root.status` is a read-model cache written only by the commands, in the **same
transaction** as version transitions (single-writer), never an independent decision.
Documented invariant, verified by the reconciliation job. Rejected: pure-derive (subquery
cost on list pages, no benefit given single-writer).

**D5 — `FULL_ACADEMIC_HISTORY` → Option B: one transcript per student, all enrollments.**
Student-scoped root (`enrollmentId`/`courseId` null), levels grouped by frozen course
identity. Per-enrollment remains `COURSE_TRANSCRIPT`. Rejected: (A) per-enrollment is
incoherent with the type's definition.

**D6 — Checksum → content-only now; organizational signature is a separate export-layer field (Phase 4).**
`Version.checksum = sha256(canonical payload)` (no secret, reproducible). HMAC-SHA256 org
signature lives on `AcademicTranscriptExport`, added with the PDF/ministry pipeline.
Folding the signature into the version checksum is rejected: rotating the signing key
would invalidate all historical checksums.

**D7 — Auto-generation → only `student_course.completed` creates a DRAFT.**
Idempotent (only if no DRAFT/current version exists for that enrollment+type). Runs in the
handler's **own transaction, post-commit** of course completion (a transcript failure
never rolls back completion). All other events (`restored`, `invalidated`, `reopened`,
`grade.updated`, `attendance.summary_recalculated`) **mark stale**, never auto-generate.

**D8 — Issue → `ORG_ADMIN` + `SUPER_ADMIN` by default; `SECRETARY` via org custom-role.**
`transcripts.issue` defaults to admin roles. Secretary gets `generate` + `export` +
`request`; issuance only if the org grants `transcripts.issue` through the **existing
custom-roles system** (single authorization source — no parallel policy flag). Rejected:
dedicated org-setting flag (second source of truth alongside RBAC).

**D9 — Transcript number → `TRN-{YYYY}-{NNNNNN}` (e.g. `TRN-2026-000001`).**
Sequence per `(organizationId, year)`, resets annually, **assigned at first issue** (not
at DRAFT). Unique per org via filtered unique index. Concurrency-safe via a
`TranscriptNumberCounter(organizationId, year, lastSeq)` row incremented
(`SET lastSeq = lastSeq + 1`) inside the issue transaction (row-lock serializes). Naive
`max+1` rejected (race).

### 19.1 Schema corrections folded in by the review

- **`AcademicTranscriptSubject`:** replace `earnedCredits (only if passed)` with
  `credits` copied **unconditionally** from `LevelSubject.credits` (identity). Earned
  credits exist only at level grain (`StudentLevelProgress.earnedCredits`). *(Removes a
  hidden pass/fail decision.)*
- **`AcademicTranscript.transcriptNumber`:** now **nullable**, assigned at first issue;
  filtered unique index `WHERE transcriptNumber IS NOT NULL AND deletedAt IS NULL`.
- **Root scope:** replace the overloaded `scopeRef` with typed nullable columns
  `scopeCourseLevelId` / `scopeAcademicTermId` / `scopeLevelSubjectId` (only the relevant
  one set per `transcriptType`).
- **`AcademicTranscriptLevel.startedAt`:** drop the derivation; if kept, copy
  `StudentLevelProgress.calculatedAt`/`createdAt` verbatim (no computation).

---

## 20. Recommended Implementation Phases

> Sequencing per the mandated flow: **backend → frontend integration → QA + security**.
> **Phase 0 is part of the implementation, not a pre-step** — it lands foundations with
> **no Prisma yet**, so contracts are frozen before any schema is written. The ordering
> below is the agreed build sequence.

- **Phase 0 — Foundations (no Prisma).** Decisions are closed (§19). Deliver, in order:
  1. new **Domain Events** — promote the 4 audit strings to `DomainEventType` +
     `TRANSCRIPT` aggregate, with the §14.1 payloads (D1);
  2. new **Permission Keys** + role mappings (D8);
  3. **checksum utility** under `src/shared/lib` (content-only sha256, D6);
  4. **transcript numbering** — format + `TranscriptNumberCounter` contract (D9);
  5. **snapshot builder interfaces** — the canonical-payload builder + deterministic
     serializer contracts (pure, testable);
  6. **DTO contracts** — official read DTOs and live portal DTOs (§13.3).
- **Phase 1 — Schema.** Prisma models `AcademicTranscript`, `AcademicTranscriptVersion`,
  `Level`/`Subject`/`Assessment`/`Attendance`, `AcademicTranscriptEvent` (+ optional
  `Request`/`Export`), with the §19.1 corrections. Migration with the filtered unique
  indexes (§16). No commands yet.
- **Phase 2 — Repositories.** Org-scoped repositories (the only Prisma layer) + read-only
  loaders over the Academic Core sources (§17). No writes back to source models.
- **Phase 3 — Snapshot Builder.** ✅ **IMPLEMENTED** (see §20.1). Pure builder +
  canonical serializer + checksum against the Phase-0 contracts. Fully unit-testable
  without I/O.
- **Phase 4 — Generate Transcript Command.** `GenerateTranscriptSnapshotCommand`
  (`BaseCommand` run→validate→authorize→execute), auditing + `transcript.generated`
  event; auto-DRAFT handler on `student_course.completed` (D7).
- **Phase 5 — Issue / Supersede / Revoke.** `IssueTranscriptCommand`,
  `RegenerateTranscriptCommand` (+ diff), `RevokeTranscriptCommand`; stale-detection
  handler + reconciliation safety-net job (D2/D3).
- **Phase 6 — Portal + Export.** Read models + management UI under `(org)`; live portal
  DTOs for `/student` and `/guardian` (labelled non-official, visibility-flag gated,
  nav-config PT-PT); `AcademicTranscriptExport` + PDF template
  (`src/infrastructure/pdf/templates`) + storage + org signature (D6) +
  `transcript.exported`.
- **Later — Certificate hand-off.** Expose transcript facts to a future
  `CertificateEligibilityEngine` (no eligibility logic inside the Transcript Engine).

Each phase closes only with `backend ✔ / frontend ✔ / qa ✔ / security ✔`. Any Security
finding of severity C or H blocks deploy (per CLAUDE.md flow).

---

### 20.1 Phase 3 implementation notes (as built)

The Snapshot Builder is a **pure, read-only, in-memory** service under
`src/modules/transcripts/services/`. It reads official Academic Core outputs through the
Phase-2 **source repository only** and assembles a deterministic
`TranscriptSnapshotPayload`. It performs **no** DB writes, emits **no** events, writes
**no** audit, allocates **no** transcript numbers, creates **no** transcript/version rows,
and decides **no** status transitions or eligibility. Enforced by static architecture-guard
tests (no `getDb`, no `.create/.update/.delete`, no engine/eventPublisher/auditService/
number-allocator imports).

**Copies, never calculates.** Grades, statuses, attendance percentages, `earnedCredits`
(course/level from progress; subject copied unconditionally from `LevelSubject.credits`),
minimum thresholds and identity names/codes are copied verbatim from the source rows
(Decimal→number surface only). Identity (student, course + category, level, subject,
policy) is **frozen** into the payload so later live renames never mutate an issued
snapshot. `level.startedAt` is the documented derivation `StudentLevelProgress.createdAt`
(§4.3), not a recomputation.

**Supported transcript types (Phase 3):**

| Type | Support | Requires | Notes |
|---|---|---|---|
| `COURSE_TRANSCRIPT` | full | `enrollmentId` | one enrollment/course |
| `CERTIFICATE_SUPPORT` | full | `enrollmentId` | same assembly; **facts only**, eligibility decided later (not here) |
| `LEVEL_TRANSCRIPT` | full | `enrollmentId` + `scopeRef` = `courseLevelId` | course assembly filtered to one level (structural filter, not outcome filter) |
| `SUBJECT_REPORT` | full | `enrollmentId` + `scopeRef` = `levelSubjectId` | course assembly filtered to one subject |
| `TERM_REPORT` | **fail-fast** | — | throws `NotImplementedError`; term membership needs interpretation, not a copy |
| `FULL_ACADEMIC_HISTORY` | **fail-fast** | — | throws `NotImplementedError`; spans multiple enrollments (Phase 4+) |

Unsupported types **fail fast** with a typed `NotImplementedError` — the builder never
silently produces an incomplete snapshot. Missing **required** student/enrollment →
`NotFoundError`; invalid `transcriptType`/`detailLevel`/missing required scope →
`ValidationError`. Missing **optional** data (course progress, subject attendance) yields
`null`/`[]`, never invented values.

**SUMMARY vs DETAILED.** `SUMMARY` omits assessment component rows (the `assessments` key
is absent on subjects); `DETAILED` includes only `StudentAssessmentResult` rows with
`status = GRADED` (a filter, not a recalculation — `CANCELLED`/`DRAFT` excluded), including
`sourceType = RECOVERY` recovery rows. `StudentAssessmentResult` is the only grade source.

**Deterministic ordering** (checksum stability): levels by `levelOrder`, `levelName`,
`courseLevelId`; subjects by `subjectOrder`, `subjectName`, `levelSubjectId`; assessments
by component `order`, `gradedAt`, `id`; attendance by `academicYearId`, `academicTermId`,
`id`. Null sort keys are ordered last, deterministically.

**Canonical payload / checksum** (`transcript-canonical-payload.service.ts`) delegates to
the Phase-0 `@/shared/lib/checksum` (sorted keys, Decimal→number, Date→ISO, `undefined`
omitted, `null` preserved, array order significant). It checksums **content only** — the
resolved `scope`, `detailLevel`, and all academic content — and deliberately **excludes**
the envelope (`snapshotDate`, `metadata.generatedBy`, counts) so identical academic content
hashes identically regardless of when/by whom it was generated. `SUMMARY` and `DETAILED`
never collide (`detailLevel` is part of the content).

**Source-repository extension (read-only, org-scoped).** Two identity fields were added to
existing source selects for the freeze: `Course.category { id, name }` (via the enrollment
read) and `AssessmentComponent.order` (assessment-results read, for deterministic
assessment ordering). No new writes; no schema change.

---

### Strict-scope reminder

This is a **modelling** deliverable. No code, no migrations, no UI were produced. No
existing academic engine is modified. The Transcript Engine **snapshots** the Academic
Core and **never recalculates** grades, statuses, attendance, eligibility, or completion.
Every model, field, status vocabulary, and integration point above is anchored to the
verified current schema and infrastructure; items that do **not** yet exist (transcript
events, level-progression events, a checksum util, PDF templates) are flagged as net-new
in §14.2, §16, and §20 rather than assumed.
