# ADR-019 — Guardian Examination Portal Product Freeze

- **Status:** **Accepted** · Portal **frozen v1.0.0** · Lifecycle **Maintenance** (2026-07-19)
- **Date:** 2026-07-19
- **Scope:** Guardian Examination Portal (`/guardian/examinations`)
- **Builds on:** [ADR-013](./ADR-013-examination-engine.md) (Examination Engine),
  [ADR-015](./ADR-015-examination-portal-freeze.md) (admin portal freeze),
  [ADR-016](./ADR-016-student-examination-portal-freeze.md) (student portal freeze),
  [ADR-018](./ADR-018-teacher-examination-portal-freeze.md) (teacher portal freeze).

> **Related:** [Architecture & Product Closure v1.0.0](../guardian-examination-portal-v1.0-closure.md),
> [Release Notes](../releases/guardian-examination-portal-v1.0.0.md),
> [CHANGELOG](../guardian-examination-portal-CHANGELOG.md).

## Context

The Examination Engine is frozen (ADR-013), and the admin (ADR-015), student (ADR-016) and
teacher (ADR-018) portals are frozen. The **fourth and final** portal on the same engine is
the **encarregado de educação supervision** surface: a guardian follows each linked student's
exam cycle — upcoming, detail, results/appeals status, and history — without the student or
admin portal. It is explicitly a *supervision* experience (acompanhamento), **read-only**,
scoped by `GuardianStudent` links and per-link visibility flags. This ADR records the portal
decisions and freezes it. **No engine change was needed or made** (no new ADR for the engine).

## Decisions

### 1. An independent supervision contract, over a REUSED data primitive

- **Context.** The guardian view could reuse admin/student read services/DTOs, but admin DTOs
  carry lifecycle `allowedActions` and reviewer/approver internals a guardian must never see,
  and the student module is a different (self-service) bounded experience. Re-implementing the
  studentId-scoped read logic, however, would duplicate tested domain queries.
- **Decision.** A self-contained `src/modules/guardian-examinations` with its **own**
  supervision DTOs and service (no import of admin `types/portal.ts`, admin read services, or
  student DTOs), whose **data layer reuses the tested `student-examinations` repository** —
  studentId-scoped reads only. This is safe because the `studentId` passed to those reads is
  always a **validated linked student**, never an id from the URL. Reusing a low-level
  data-access primitive is not reusing a portal contract.
- **Consequences.** The four portals evolve independently at the contract level, with no
  duplication of the underlying exam read queries and no cross-leak of admin/student contracts.

### 2. Visibility derives ONLY from an active link + its flags

- **Context.** A guardian must see exactly their linked students, at exactly the granularity
  the school granted.
- **Decision.** Every read resolves the guardian's active `GuardianStudent` links first
  (`findGuardianLinks`/`findGuardianLink`, org + guardianUserId + studentId). `canViewAcademic`
  gates all exam academic data (schedule/results/appeals/history); `canViewAttendance` gates
  attendance. `guardianUserId` is `context.userId`, never from the URL/input; a `studentId` in
  the URL is only a *selection*, validated against the links.
- **Consequences.** IDOR-safe by construction; a guardian never sees a student they are not
  linked to, nor data a flag withholds. `canViewAcademic=false` means the exam read layer is
  never queried for that student.

### 3. Read-only — no write surface at all

- **Context.** Supervision must not become a second write path into the exam domain, and any
  write endpoint is attack surface.
- **Decision.** The portal exposes **no `/api/guardian/**`, no fetch/POST/PATCH/DELETE, and no
  mutation affordance**. All pages are server-rendered reads; the only client interactivity is
  navigation (history pager, filters, drill-through links). The GUARDIAN role holds no
  `exams.*` permission.
- **Consequences.** There is no write path to authorize or attack; the guardian can only
  observe.

### 4. Published-only results; read-only appeal status

- **Context.** A guardian must not see provisional grades or the private internals of an appeal.
- **Decision.** Results are masked to **PUBLISHED** in the service before the DTO is built, and
  shown as a percentage ("Percentagem do exame"), never "Nota Final"; no PASSED/FAILED is
  derived. Appeals expose **status only** (estado, public decision, dates) — never the private
  `decisionReason`, and with no create/withdraw affordance.
- **Consequences.** The guardian sees a faithful, non-misleading, non-privileged view; the
  student portal remains the only place an appeal is created/withdrawn.

### 5. Fail-closed, no DTO leakage

- **Decision.** A not-linked / other-guardian / other-org / inactive-link / no-academic-
  visibility case returns null → `notFound()` (404), never a 403/500 that leaks existence; an
  explicit invalid `student` selection fails closed rather than silently falling back to another
  child. Supervision DTOs never carry reviewer/approver/publisher ids, `decisionReason`,
  `markerId`, audit, integration payloads, admin `allowedActions`, or the raw eligibility
  snapshot.

## Consequences (overall)

**Positive.** A safe, isolated, read-only supervision portal: link- and flag-scoped and
IDOR-safe, published-only, fail-closed, with zero write surface and zero engine change. It
**completes the exam ecosystem** — admin + student + teacher + guardian, all frozen over one
unchanged engine.

**Negative.** Some read logic is expressed through the student repository rather than a
guardian-specific one (accepted, and safe: studentId is always validated). A few Low a11y/UX
polish items are deferred to v1.1 (documented; non-blocking).

## Freeze decision

UX Audit Overall **7.8/10**, **0 Critical / 0 High**, verdict **GO** (weighted: Supervisão 9,
Security-UX 9, Clareza 8, Responsividade 8, Navegação 7, Multi-educando 7, Acessibilidade 6).
The before-freeze UX fixes (M1 back-link origin preservation, M2 stale-filter self-heal on
student switch, L4 "Ação"→"Detalhe") are applied. Security Review passed. **Guardian
Examination Portal is frozen at v1.0.0 · Production Ready · Maintenance.** The Examination
Engine is unchanged.

## Backlog (v1.1) & Review

v1.1: active nav-tab state on detail, `aria-current`, a student caption above the history
table, empty-state component unification, badge/alert theme-tokens + dark-mode (system-wide),
loading skeletons, a friendly "sem visibilidade" message instead of a raw 404; product-level:
multi-educando comparison, finance/documents supervision surfaces, notification deep-links.

Revisit this ADR if: guardians must gain any write authority (e.g. request an appeal on the
student's behalf — a domain/authority change); the link/visibility model changes (new flags,
or `GuardianStudent` semantics change); or the engine contract changes. Any such change is a
new ADR — this document is not edited in place once Accepted.
