# Changelog

All notable, release-level changes to the platform are recorded here. The format is based
on [Keep a Changelog](https://keepachangelog.com/). Per-engine release notes live under
[`docs/releases/`](docs/releases/).

## [examination-engine-v1.0] — 2026-07-10

**Examination Engine v1.0 — IMPLEMENTED & FROZEN.** Full official exam lifecycle as a
bounded context, with a live Grade/Progression integration. Governed by
[ADR-013](docs/adr/ADR-013-examination-engine.md) and
[ADR-014](docs/adr/ADR-014-exam-grade-component-binding.md). Full notes:
[docs/releases/examination-engine-v1.0.0.md](docs/releases/examination-engine-v1.0.0.md).

### Added
- Phases 0–11B + 13: 14 `Exam*` Prisma models (incl. `ExamGradeComponentBinding`), pure
  eligibility engine, scheduling, registration + eligibility override, exam attendance,
  result entry, three-eyes review/approval, session publication + retraction, appeals with
  append-only `ExamResultRevision`, and bulk runners.
- Live, one-way Grade/Progression integration adapter (`integrations/production-ports.ts`)
  driven by the explicit `ExamGradeComponentBinding` (no heuristic); additive
  `GRADE_CHANGE_SOURCE.EXAMINATION`; idempotent with `officialVersion` staleness tracking and
  reconciliation repair.
- Live-database integration script proving the real adapter end-to-end
  (`src/modules/examinations/__tests__/grade-integration-production.integration.ts`), plus
  CI architecture guards for the adapter seam.

### Changed / Hardened
- Repository metadata patch types (Period/Session/Candidate/Result/Appeal) can no longer
  mutate lifecycle `status` or immutable `ExamResult` fields (global-review H1). API surface
  reduced only — no behaviour change.
- Docs/ADR refreshed to the v1.0 status; ADR-014 documents the `maxScore == maxGrade`
  integration precondition; stale in-code integration comments corrected to the live 11B
  behaviour.

### Deferred (post-v1.0)
- Phase 12 (portals / API layer) and Phase 14 (domain-event bus / Outbox).
- First-class non-scored grade representation; auto-registration; multi-component mappings.

### Validation
- `prisma validate` ✓ · `prisma generate` ✓ · `tsc --noEmit` ✓ (0) ·
  `vitest run src/modules/examinations` ✓ (732/25) · grade + progression suites ✓ ·
  `eslint` ✓ (0) · live integration script ✓ (8/8 scenarios, clean teardown).
- No schema/migration change in the v1.0-hardening release.

## [certificate-engine-v1.0.0] — 2026-07-09

Certificate Engine v1.0 — issue / verify / export / lifecycle for official certificates,
architecture frozen ([ADR-002](docs/adr/ADR-002-certificate-engine-architecture.md)). Full
notes: [docs/releases/certificate-engine-v1.0.0.md](docs/releases/certificate-engine-v1.0.0.md).
