# Student Examination Portal — Architecture & Product Closure (v1.0.1)

> **Official closure document for the Student Examination Portal.** It consolidates,
> at freeze time, what the module does, how it is built, why the key decisions were
> made, and what was intentionally left for v1.1. A maintainer 6–12 months out should
> be able to understand and evolve it from this document.

---

## 1. Introduction

| | |
|---|---|
| **Module** | Student Examination Portal (the student-facing exam experience) |
| **Version** | **v1.0.1** (v1.0.0 initial build + the three UX-audit fixes) |
| **Status** | **Production Ready · Frozen** (UX Audit: Overall 7.5/10, 0 Critical / 0 High) |
| **Lifecycle** | **Maintenance** |
| **Date** | 2026-07-18 |
| **Runs over** | The **frozen** Examination Engine ([ADR-013](adr/ADR-013-examination-engine.md)). No engine behaviour, schema, or migration changed. |
| **Sibling** | [Examination Administration Portal v1.1.0](examination-portal-v1.1-closure.md) (admin/secretary). This is the second portal on the same engine. |

### Objective

Let a student **manage their entire exam experience without contacting the
secretariat**: see upcoming exams and their details/eligibility, read published
results, file / track / withdraw appeals, and browse their full exam history — with
tenant isolation, strict ownership, and published-only visibility.

### Scope

**In scope:** a dedicated `/student/examinations` module (own routes, DTOs,
repository, services, components) plus two student-scoped API endpoints for the appeal
create/withdraw actions.

**Out of scope (by design):** any engine change; teacher/guardian exam portals;
pass/fail semantics, appeal deadlines, PDF export, notifications, calendar (all v1.1+).

---

## 2. Features

| Area | What the student can do | Route |
|---|---|---|
| **Overview** | KPIs (próximo exame / esta semana / resultados por publicar / recursos pendentes), next-exam highlight, short lists, alerts | `/student/examinations` |
| **Upcoming** | Full list of future sittings (disciplina, data, hora, sala, duração, estado) → detail | `/student/examinations/upcoming` |
| **Exam Details** | Header, "Informações", "Informações para o exame" (free-text instructions + derived duration + room), eligibility verdict + reasons, 4-step timeline (Inscrito → Elegível → Realizado → Resultado publicado), result summary when published | `/student/examinations/[examId]` |
| **Results** | Published results (Nota, Percentagem do exame, Resultado, Publicado) → detail | `/student/examinations/results` |
| **Result Details** | Score, Percentagem do exame, result code, related appeal, and a create-appeal action | `/student/examinations/results/[resultId]` |
| **Appeals** | List of own appeals; file an appeal (single "Motivo do recurso"); track status/decision; withdraw (confirm-guarded) | `/student/examinations/appeals[/appealId]` |
| **History** | Candidacy-based history (includes exams with no published result, absences, withdrawals), filtered (ano/disciplina/estado, URL-persisted) + server-side paginated | `/student/examinations/history` |
| **Dashboard card** | Next exam + "resultados por publicar" summary with a link into the module | `/student` |

The normalized score is always **"Percentagem do exame"**, never a final subject grade.

---

## 3. Architecture

A strict layered, student-scoped read stack over the frozen engine.

```
UI (server pages guarded by STUDENT_PORTAL_VIEW; client only for the appeal form,
    the withdraw confirm, and the history filter bar)
      ↓
Services  studentExaminationService (plain params: organizationId + studentId)
      ↓
Repository  student-exam.repository (ONLY layer importing Prisma; EVERY read
            filtered by organizationId AND studentId)
      ↓
Prisma 7 → SQL Server (reuses the frozen exam_* tables; no new models)

Mutations (appeals): thin student API routes → the frozen Create/Withdraw commands.
```

**Own module, no admin reuse.** The portal does **not** import the admin
`types/portal.ts` DTOs or the `services/admin/*` read services. It has its own
privacy-safe DTOs, its own repository, and its own service — so the student and admin
experiences evolve independently.

**Integrations:** none new. Reads reuse the frozen `exam_*` tables; appeal mutations
reuse the frozen `CreateExamAppealCommand` / `WithdrawExamAppealCommand` (which write
`ExamEvent` + `AuditLog` in-tx). No Grade/Transcript/Certificate/Outbox/Notification
involvement.

---

## 4. Domain Model

**No new models.** The portal reads the engine's existing entities
([ADR-013](adr/ADR-013-examination-engine.md) §4): `ExamCandidate` (the student's
registration, the spine of the student view), `ExamSession`, `ExamRoom`,
`ExamAttendance`, `ExamResult` (surfaced **only** when PUBLISHED), `ExamAppeal`
(create/withdraw), `LevelSubject`/`CourseLevel`/`Course` (names). The student view is
candidacy-centric: everything hangs off the student's `ExamCandidate` rows.

---

## 5. Flows

```
Dashboard card → Exames → Overview
   → Próximos → Exam Detail (eligibility + timeline)
   → Resultados → Result Detail → Submeter recurso
                                     → Appeals → Appeal Detail → Retirar recurso
   → Histórico (filtrado, paginado) → Result/Exam detail
```

Appeal lifecycle the student sees: `Submetido (PENDING) → Em análise (UNDER_REVIEW) →
Decidido (APPROVED/REJECTED)`, or `Retirado (WITHDRAWN)` while still PENDING.

---

## 6. State Machines (read-only projections)

The student reads the engine's states (values English, labels PT-PT via the render
registry): session `SCHEDULED…PUBLISHED`; candidate `REGISTERED/WITHDRAWN/
DISQUALIFIED`; attendance `PRESENT/ABSENT/LATE/EXCUSED/DISQUALIFIED`; appeal
`PENDING/UNDER_REVIEW/APPROVED/REJECTED/WITHDRAWN`. A result is shown **only** in
`PUBLISHED`. No pass/fail state exists (the engine owns none).

---

## 7. Permissions

- **`studentPortal.view`** gates the whole `/student/examinations` area (every page).
- **`exams.createAppeal`** / **`exams.withdrawAppeal`** (held by the STUDENT role) gate
  the two mutations — enforced by the frozen commands, not the route.

`studentId` is **always** resolved server-side (`getStudentByUserId(orgId, userId)`),
**never** from the URL/query. No new permissions were added.

---

## 8. Security model

| Invariant | How it's guaranteed |
|---|---|
| **Ownership** | Every repository read is filtered by `organizationId` AND server-resolved `studentId` AND the `resourceId`; a non-owned id simply doesn't match. |
| **Published-only** | Result detail read pins `status = "PUBLISHED"`; list/history results are masked in the service (a non-published result is never surfaced). |
| **Fail closed** | A missing / non-owned / non-published resource returns `null` → the page calls `notFound()` (404) — never a 403/500 that leaks existence. |
| **No DTO leakage** | DTOs never carry `reviewer`/`approver`/`decisionReason`/`decidedById`/`allowedActions`/audit/integration state/raw `eligibilitySnapshot`; `publicComment` is reserved-null (internal `remarks` is never exposed); only the public decision enum is shown. |
| **No admin endpoints** | The UI calls only `/api/student/examinations/*`; no `/admin`, `/teacher`, `/organization`, or admin-exam endpoint is reused. Mutations delegate to the frozen commands (which re-resolve the acting student and enforce ownership + PUBLISHED + single-active-appeal + PENDING-only). |

Verified by 18 service tests + an explicit Security Review at freeze.

---

## 9. Known limitations (v1.1 backlog)

Intentional deferrals — behaviour is unaffected:
- **No pass/fail outcome** (the engine owns none — ADR-013 D13). Results show percentage
  + result code only.
- **No appeal deadline** (the engine has none). The real create-block is
  duplicate/not-published.
- **Single free-text appeal reason** (the engine models one field; no category).
- **`publicComment` reserved-null** — no designated public comment on the frozen result.
- **UX polish (from the UX Audit):** hardcoded amber/emerald colors on alerts/timeline
  bypass theme tokens; timeline steps lack `aria-current`; minor badge label/variant
  drift vs the admin registry (masculine vs feminine session labels); no
  `loading.tsx`/skeletons; no text search on results/appeals.
- **Deferred features (explicitly out of scope):** PDF download, push notifications,
  external/Google calendar, AI, structured Exam Policy domain.

---

## 10. Architectural decisions

Full rationale: [ADR-016 — Student Examination Portal Freeze](adr/ADR-016-student-examination-portal-freeze.md).

- **D1 — Independent module, no admin-DTO reuse.** Own DTOs/repository/service so the
  student and admin experiences evolve without coupling.
- **D2 — studentId resolved server-side, always.** Never from the URL; the single
  source is `Student.userId`.
- **D3 — IDOR-safe by construction + published-only masking.** Every read scoped by
  org+studentId; results masked to PUBLISHED.
- **D4 — Fail closed to `notFound()`**, never 403/500 for a non-owned/missing resource.
- **D5 — Reuse the frozen appeal commands via thin student endpoints.** No new domain
  command; the engine stays frozen.
- **D6 — Engine-faithful semantics.** No pass/fail, no appeal deadline, single reason —
  the portal never invents domain concepts the engine doesn't own.

---

## Closure statement

The Student Examination Portal is **frozen at v1.0.1 · Production Ready · Maintenance**.
It answers its central question — a student can run their whole exam experience without
the secretariat — with a fail-closed security posture and zero engine change. v1.0.1
folds in the three UX-audit fixes (history drill-through, appeal discoverability,
explanatory empty states); the remaining v1.1 backlog (§9) is separated from this
release.

**Related:** [ADR-016](adr/ADR-016-student-examination-portal-freeze.md) ·
[CHANGELOG](student-examination-portal-CHANGELOG.md) ·
[Release Notes v1.0.1](releases/student-examination-portal-v1.0.1.md) ·
[Admin portal closure](examination-portal-v1.1-closure.md) ·
[ADR-013 (engine)](adr/ADR-013-examination-engine.md).
