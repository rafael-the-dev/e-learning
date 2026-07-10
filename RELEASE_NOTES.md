# Release Notes

Latest release. Historical entries: [CHANGELOG.md](CHANGELOG.md); per-engine detail:
[`docs/releases/`](docs/releases/).

---

## Examination Engine v1.0.0 — 2026-07-10 (tag `examination-engine-v1.0`)

**Status: IMPLEMENTED & FROZEN.** The Examination Engine ships as a complete bounded
context covering the full official exam lifecycle, with a live, verified Grade/Progression
integration. Frozen under [ADR-013](docs/adr/ADR-013-examination-engine.md) and
[ADR-014](docs/adr/ADR-014-exam-grade-component-binding.md).

### What's in v1.0 (Phases 0–11B + 13)
Exam periods, rooms, sessions, attempts, candidates (with eligibility override), exam
attendance, official results with three-eyes review/approval, session publication +
retraction, appeals with append-only revisions, bulk operations, and a **live** one-way
Grade/Progression integration via the explicit `ExamGradeComponentBinding` (no heuristic),
idempotent and staleness-reconciled.

### Highlights of this release
- **Live integration proven end-to-end** against SQL Server (real production adapter, no
  fakes): canonical grade write (`GradeChangeLog.source = EXAMINATION`), progression cascade,
  idempotency, revision reconciliation, retraction-after-consumption block, non-scored and
  scale-mismatch refusals, and binding enforcement — all green with clean teardown.
- **Repository metadata surface hardened** so no metadata helper can bypass a state machine
  or rewrite a published result (type-level + guard-enforced; no behaviour change).

### Deferred beyond v1.0
- **Phase 12** — portals / API layer (the engine currently has no route/action/UI surface).
- **Phase 14** — domain-event bus / Outbox (so exam-driven grade writes don't yet notify
  reactive consumers).
- First-class non-scored grade representation, auto-registration, and multi-component mappings.

### Validation at release
`prisma validate`/`generate` ✓ · `tsc --noEmit` ✓ (0) · `vitest run src/modules/examinations`
**732/732 (25 files)** ✓ · grade + progression suites ✓ · `eslint` ✓ (0) · live integration
script **8/8 scenarios** ✓. No schema/migration change.

Full detail: [docs/releases/examination-engine-v1.0.0.md](docs/releases/examination-engine-v1.0.0.md).
