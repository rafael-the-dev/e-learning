# Examination Engine — Release Notes v1.0.0

- **Release:** v1.0.0
- **Date:** 2026-07-10
- **Tag:** `examination-engine-v1.0`
- **Scope:** Examination Engine (`src/modules/examinations/**`) + the sanctioned
  Grade/Progression integration adapter (`src/modules/examinations/integrations/production-ports.ts`)
  and the additive `GRADE_CHANGE_SOURCE.EXAMINATION`. Architecture **FROZEN** — see
  [ADR-013](../adr/ADR-013-examination-engine.md) and [ADR-014](../adr/ADR-014-exam-grade-component-binding.md).
- **Downstream of (frozen):** Academic Core ([ADR-001](../adr/ADR-001-academic-core-freeze.md)),
  Academic Transcript Engine, Certificate Engine ([ADR-002](../adr/ADR-002-certificate-engine-architecture.md), v1.0).

The Examination Engine is a bounded context that manages the full official exam
lifecycle — periods, rooms, sessions, attempts, candidates, exam attendance, official
results, review/approval, publication, appeals and append-only revisions — and pushes an
official **PUBLISHED** result into the Grade Engine (the single grade writer), which
cascades Progression. It **consumes** Academic Core facts, never owns them; it never
writes the Grade/Progression tables directly (it calls injected ports) and never mutates
the Transcript or Certificate engines.

---

## Highlights

Feature-complete across **Phases 0–11B + 13**:

| Area | Delivered |
|------|-----------|
| Foundation & data model | 14 `Exam*` Prisma models (incl. `ExamGradeComponentBinding`), const-object vocabularies, filtered-unique invariants, append-only `ExamEvent` ledger |
| Eligibility | Pure, deterministic `ExaminationEligibilityEngine` (academic/admin only) fed by one read-only source; command-level operational blockers (E-3/E-3a/E-4/E-5) |
| Scheduling | Period + session + room lifecycle as race-safe conditional writes; invigilator assignment; conflict/capacity checks |
| Registration | Manual + eligibility **override** (real verdict preserved + provenance), attempt/candidate atomic creation |
| Attendance | Exam attendance (separate from class attendance, E-10) + explicit correction |
| Results | Attendance-driven resultCode + normalization; DRAFT → SUBMITTED → REVIEWED → APPROVED with strict marker≠reviewer≠approver separation and attendance revalidation |
| Publication | Session-level visibility boundary + retraction (blocked after consumption) |
| Appeals | Post-publication appeals → append-only `ExamResultRevision` (one current revision); official-result resolver |
| Grade/Progression integration | **LIVE** one-way anti-corruption adapter via the explicit binding (ADR-014); idempotent + staleness-tracked; reconciliation repair |
| Bulk | Sequential single-command runners (one tx per item, partial-success counts) |

**Surface:** 44 command classes · 22 `exams.*` permissions · 14 Prisma models · 42 `ExamEvent`
types. Full design detail: [examination-engine.md](../examination-engine.md).

---

## Changes in this release (global-review hardening)

**Fix (H1 — repository metadata-surface hardening)**
- The five `Update*MetadataInput` patch types (Period, Session, Candidate, Result, Appeal)
  can no longer carry lifecycle `status` or immutable `ExamResult` fields (score, maxScore,
  normalizedScore, resultCode, marker/reviewer/approver, submitted/reviewed/approved/published
  stamps, currentRevisionId). Lifecycle changes flow **only** through the dedicated
  conditional-write primitives. The `ExamAppeal` metadata patch is now structurally empty
  (`Record<string, never>`). No behaviour change — the API surface simply got smaller.
- New guards: a repository architecture guard fails if any command imports/calls a metadata
  helper; a static API guard fails (at `tsc` and at runtime) if a forbidden field reappears.

**Test (H2 — live production integration proof)**
- New CI guards on `production-ports.ts` (§13/§15): the adapter routes through the canonical
  `gradeMutationService`, never imports a Progression repository / Transcript / Certificate,
  never writes a progression table; the integration commands default to the real production
  ports.
- New live-database integration script `__tests__/grade-integration-production.integration.ts`
  (run via `npx tsx`, excluded from CI by convention) that exercises the **real** production
  adapter end-to-end and was **executed green against SQL Server** (see Validation below).

**Documentation**
- `examination-engine.md` status/header + roadmap refreshed to v1.0 (all delivered phases
  IMPLEMENTED; Phases 12 & 14 explicitly deferred). ADR-014 SCORED matrix now states the
  `maxScore == maxGrade` precondition. Stale in-code "resolver returns null / no write"
  comments corrected to the live Phase-11B behaviour.

---

## Architecture guarantees (frozen)

Bounded context: consumes Academic Core facts, never owns them · single eligibility
authority (pure engine) · `ExamResult` is an official exam fact, **not** a final grade ·
published result immutable; post-publication corrections are append-only revisions ·
publication is the visibility boundary · Grade Engine stays the single grade writer and
Progression the single owner (Examination calls injected ports, never writes their tables) ·
no heuristic exam→component mapping — only the explicit `ExamGradeComponentBinding` · every
mutation is one transaction with conditional writes + `ExamEvent` + `AuditLog` written
inside the tx · repositories are the only Prisma layer, always `organizationId`-scoped ·
never mutates Transcript / Certificate. Rationale: [ADR-013](../adr/ADR-013-examination-engine.md),
[ADR-014](../adr/ADR-014-exam-grade-component-binding.md).

---

## Known limitations (deferred beyond v1.0)

- **Phase 12 — Portals / API layer not built.** No `exams.*` route/action/UI layer yet; the
  engine is exercised via its command classes. `EXAMS_VIEW` / `EXAMS_MANAGE` /
  `EXAMS_OVERRIDE_SCHEDULING` / `EXAMS_OPERATIONS_VIEW` are defined but not yet enforced by a
  read/UI surface.
- **Phase 14 — no domain-event bus / Outbox.** `ExamEvent` + `AuditLog` are the durable
  trail (written in-tx). Consequently, exam-originated grade writes do not currently emit the
  Grade cascade's domain events to reactive consumers (timeline/notifications) — a documented
  v1 limitation to be closed when the Outbox lands.
- **Non-scored outcomes are `UNSUPPORTED`** (never converted to `0`) — first-class absence/
  excused grade representation is a future Grade Engine contract (ADR-014 review trigger).
- **Auto-registration (D7)** and **multi-component exam→grade mappings** are deferred.

---

## Validation at release

- `pnpm exec prisma validate` — valid · `pnpm exec prisma generate` — ok
- `pnpm exec tsc --noEmit` — 0 errors
- `pnpm exec vitest run src/modules/examinations` — **732/732 green (25 files)**
- Grade/Progression suites (`src/modules/grades`, `src/modules/prerequisites`) — green
- `pnpm exec eslint` (examination module + changed cross-engine files) — 0 problems
- **Live integration** (`npx tsx …/grade-integration-production.integration.ts` against SQL
  Server, after `prisma migrate deploy` + `db:seed`) — **all 8 scenarios PASS, clean teardown**:
  real canonical Grade write + `GradeChangeLog.source = EXAMINATION`; Progression cascade
  (StudentSubjectProgress → PASSED, course COMPLETED); idempotency (UNCHANGED, no duplicate);
  revision reconciliation (15→18, single row, one recalc); retraction-after-consumption blocked;
  non-scored → UNSUPPORTED; maxScore mismatch → UNSUPPORTED (refused before progression);
  binding enforcement (unbound & archived → UNSUPPORTED, never a fallback).

**No schema or migration change in this release** (H1/H2 are type + test + docs only).

---

## Compatibility

Requires the frozen Academic Core and Grade/Progression engines. The Grade integration is
additive (`GRADE_CHANGE_SOURCE.EXAMINATION`) and writes through the canonical grade mutation
path only. Any structural change to this engine requires a new ADR superseding
[ADR-013](../adr/ADR-013-examination-engine.md).
