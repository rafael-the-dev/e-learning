# Teacher Examination Portal — Architecture & Product Closure (v1.0.0)

> **Official closure document for the Teacher Examination Portal.** It consolidates, at
> freeze time, what the module does, how it is built, why the key decisions were made,
> and what was intentionally left for v1.1. A maintainer 6–12 months out should be able
> to understand and evolve it from this document.

---

## 1. Introduction

| | |
|---|---|
| **Module** | Teacher Examination Portal (the examiner/invigilator operational surface) |
| **Version** | **v1.0.0** |
| **Status** | **Production Ready · Frozen** — UX Audit Overall **8.4/10**, 0 Critical / 0 High, verdict GO |
| **Lifecycle** | **Maintenance** |
| **Date** | 2026-07-19 |
| **Runs over** | The Examination Engine, **amended by [ADR-017](adr/ADR-017-assignment-scoped-teacher-execution.md) and re-frozen** (assignment-scoped teacher execution). Otherwise unchanged. |
| **Siblings** | [Examination Administration Portal v1.1.0](examination-portal-v1.1-closure.md) (frozen), [Student Examination Portal v1.0.1](student-examination-portal-v1.0-closure.md) (frozen). Third portal on the same engine. |

### Purpose

Let a teacher **run a complete exam session — attendance → results → submission — for
their assigned sessions, without the admin portal**, with strict per-assignment
isolation and the engine as the sole authority.

### Scope

**In scope:** a dedicated `/teacher/examinations` module (own types/repository/service/
components) + teacher-scoped API endpoints for attendance and result writes.

**Out of scope (by design):** creating periods/sessions, registering candidates,
assigning rooms/invigilators, and — critically — **review / approve / publish /
integrate / appeals / operations**. The teacher flow ends at `SUBMITTED`.

---

## 2. Architecture

A layered, assignment-scoped stack. Reads scope in the repository; writes delegate to
the hardened engine commands (the sole authority).

```
UI (server pages guarded by TEACHER_PORTAL_VIEW; client sections for attendance/results)
      ↓ reads                                   ↓ writes
Service teacherExaminationService          Teacher API endpoints (thin shells)
  (org + teacherId, capabilities)               ↓
Repository teacher-exam.repository          Hardened engine commands (ADR-017):
  (every read filtered by org +               Mark/Correct attendance, Create/Update/
   invigilators.some.teacherId)                Submit results + bulk runners
      ↓                                         ↓  in-tx assignment + role gate
Prisma 7 → SQL Server (reuses exam_* tables; NO new models, NO new engine behaviour)
```

**Own module, no reuse of admin/student contracts.** It does not import admin
`types/portal.ts`, admin read services, or the student module. Its DTOs, repository, and
service are its own.

### Dependency on the Examination Engine + ADR-017

The engine (ADR-013) originally **deferred** teacher assignment-scoped writes. ADR-017
implemented that deferred behaviour as additive hardening: the mark/correct/enter/update/
submit commands now allow, besides the unchanged admin path, an actor holding
`exams.executeAssignedSessions` **who has an active `ExamInvigilatorAssignment` on the
target session in an authorizing role** — checked **inside the mutation transaction**.
This portal is the consumer of that gate. No further engine change was made.

---

## 3. Assignment model

Teacher visibility and write authority derive **exclusively** from an active
`ExamInvigilatorAssignment` (`teacherId` + `role`). Never inferred from teaching the
subject/class. `teacherId` is always resolved server-side from the authenticated user
(`getTeacherByUserId`), never from the URL/input.

### Role → operation matrix (ADR-017)

| Operation | CHIEF | INVIGILATOR | MARKER | OBSERVER |
|---|:---:|:---:|:---:|:---:|
| Read the session | ✅ | ✅ | ✅ | ✅ |
| Mark / correct attendance | ✅ | ✅ | ✅ | ❌ |
| Create / update / submit results | ✅ | ❌ | ✅ | ❌ |

The teacher write ceiling is **`SUBMITTED`** for every role.

---

## 4. Routes

- `/teacher/examinations` — **Resumo** (operational KPIs, next/today, recently completed).
- `/teacher/examinations/sessions` — **Sessões** list (URL-persisted filters: estado /
  disciplina / período / papel / pendência; server-side pagination).
- `/teacher/examinations/sessions/[sessionId]` — **Detalhe**: header (subject, date/time,
  room, role badge, state badge), info, instructions, a capabilities panel, and two
  interactive sections — **Assiduidade** and **Resultados** — plus a fail-closed
  `notFound()` when the teacher is not assigned.
- A `TeacherExamSummaryCard` on the `/teacher` dashboard + an "Exames" nav entry
  (`teacherPortal.view`).

---

## 5. Endpoints (teacher-scoped; teacherId never accepted)

**Attendance:** `POST`/`PATCH /candidates/[candidateId]/attendance` (mark/correct),
`POST /sessions/[sessionId]/attendance/bulk`, `GET /sessions/[sessionId]/candidates`
(roster). **Results:** `POST /candidates/[candidateId]/results` (create), `PATCH
/results/[resultId]` (update draft), `POST /results/[resultId]/submit`, `POST
/sessions/[sessionId]/results/bulk` (bulk create), `POST …/results/submit-bulk`, `GET
…/results` (roster). All under `/api/teacher/examinations/`.

Write endpoints are **thin shells** over the hardened commands (the command enforces org +
assignment + role in-tx). Read endpoints resolve the teacher server-side and are
**fail-closed** (404 when unassigned). No admin/teacher endpoint from another portal is
reused.

---

## 6. Capabilities (the portal's own — NOT admin `allowedActions`)

Derived from `assignment role + session state + candidate/attendance/result state +
engine rules`, kept in lockstep with the commands.

- **Session-level:** `canMarkAttendance`, `canCorrectAttendance`, `canBulkMarkAttendance`
  (= markable AND pending exist), `canEnterResults`, `canUpdateResults`,
  `canSubmitResults`, `canBulkEnterResults` (= eligible-to-create exist),
  `canBulkSubmitResults` (= drafts exist), `attendanceBlockReason`, `resultsBlockReason`.
- **Per-candidate (results):** `canCreateResult`, `canUpdateDraft`, `canSubmitResult` +
  `create/update/submitBlockReason`.

The **attendance → result** relationship follows the engine exactly (reuses
`resultCodeForAttendance`): PRESENT/LATE → SCORED (numeric score 0..maxScore); ABSENT →
ABSENT; EXCUSED → EXCUSED; DISQUALIFIED → DISQUALIFIED (reason). The code is derived from
attendance, never invented; a candidate without attendance cannot get a result. **No
PASSED/FAILED is derived.**

---

## 7. Flows

```
/teacher dashboard (Exames card) → Resumo → Sessões (filtered) → Ver
   → session detail → Assiduidade (mark / correct / bulk) → Resultados (create draft →
     save → submit) → SUBMITTED  [ceiling]
```

Submission is the only irreversible teacher action and is confirm-gated; after it, the
teacher can read but not edit. Everything downstream (review/approve/publish/integrate)
is the admin/secretary's, not the teacher's.

---

## 8. Security

| Invariant | How |
|---|---|
| **Read scoping** | Every repository read filtered by `organizationId` AND `invigilators.some.teacherId`; candidate reads reached only after `findAssignedSession`. |
| **Write authority = the command** | Endpoints are thin; the hardened commands enforce org + active assignment + authorizing role **in the mutation transaction** (no check-then-mutate window). |
| **Fail closed** | An unassigned/other-org/missing session → service returns null → page `notFound()` (404); read endpoints 404. Never a 403/500 that leaks existence. |
| **teacherId server-resolved** | Always `getTeacherByUserId(org, userId)`; never from URL/body. A permissioned user without a Teacher record is denied (no admin fallback). |
| **No DTO leakage** | Teacher DTOs never carry `reviewedById`/`approvedById`/`publishedById`/`decisionReason`/`markerId`/audit/integration/`allowedActions`/raw `eligibilitySnapshot`. |
| **Concurrency** | Commands use conditional writes → `RESULT_STALE` / `RESULT_CONCURRENTLY_CHANGED` / `ATTENDANCE_CORRECTION_CONFLICT`; the UI keeps confirmed server data. |
| **No admin authority** | TEACHER holds no review/approve/publish/integrate permission and the portal exposes no such endpoint. |

---

## 9. Tests

- **Engine gate (ADR-017):** `execution-scope-shared.test.ts` — admin path unchanged;
  CHIEF/INVIGILATOR/MARKER/OBSERVER × attendance/results matrix; denied for no-assignment /
  other-session / other-org / permission-without-Teacher; in-tx scoping.
- **Teacher module (25):** repository assignment+org scoping / filters-keep-scope /
  candidate reads org+session scoped; capabilities matrix (incl. OBSERVER-reads-only,
  state gates, `canBulk*`); fail-closed attendance + results views; result-view create
  gated by attendance, INVIGILATOR-can't-create, DRAFT-updatable / submit-only-COMPLETED /
  SUBMITTED-read-only; DTOs expose no admin fields.
- Validation at freeze: `tsc --noEmit` 0 errors · `eslint` clean · module 25/25 · full
  suite green (except the pre-existing flaky grades/notifications files, which pass in
  isolation).

---

## 10. UX Audit + remediation

Overall **8.4/10**, 0 Critical / 0 High, **GO** (weighted: Produtividade 9, Bulk/escala 9,
Responsividade 9, Security-UX 9, Navegação 8, Clareza 8, Acessibilidade 6). Fixed before
freeze: the **misleading filtered-list empty state** (now distinguishes "no assignments"
from "no filter match"), **`aria-current`** on the active nav tab, and **accessible names**
on the section search inputs.

## 11. Known debt (v1.1 backlog)

Non-blocking, deferred: back-link should preserve the list filter/scroll; add
`DialogDescription`/`aria-describedby` to the reason/bulk dialogs (the critical submission
dialog already has it); badge palette → theme tokens with dark-mode (system-wide, not
portal-specific); hide the results scaffold/max-score field for results-blocked roles;
trim dormant admin result-lifecycle labels from the teacher registry; inline "why" on
disabled bulk buttons; keyboard shortcuts; deeper mobile/tablet-compact polish; controlled
autosave of drafts; export / printable attendance sheet; granular loading; browser-back
navigation; operational analytics. **No engine change without a new ADR.**

---

## Closure statement

The Teacher Examination Portal is **frozen at v1.0.0 · Production Ready · Maintenance**. A
teacher can run a complete many-candidate session — attendance → results → submission —
without the admin portal, fail-closed and assignment-scoped, with the engine as the sole
write authority and a hard ceiling at `SUBMITTED`. The v1.1 backlog (§11) is separated
from this release.

**Related:** [ADR-018](adr/ADR-018-teacher-examination-portal-freeze.md) ·
[ADR-017](adr/ADR-017-assignment-scoped-teacher-execution.md) ·
[CHANGELOG](teacher-examination-portal-CHANGELOG.md) ·
[Release Notes v1.0.0](releases/teacher-examination-portal-v1.0.0.md).
