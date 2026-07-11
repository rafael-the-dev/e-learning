# Release Notes

Latest release. Historical entries: [CHANGELOG.md](CHANGELOG.md); per-engine detail:
[`docs/releases/`](docs/releases/).

---

## Examination Administration Portal v1.0.0 — 2026-07-11 (tag `examination-portal-v1.0`)

**Status: IMPLEMENTED.** Phase 12 of the Examination Engine — the admin/secretary
administration portal (API layer, read services and React UI) over the **frozen** engine
backend (`examination-engine-v1.0.1`). No engine behaviour, schema or migration changed.
Governed by [ADR-013](docs/adr/ADR-013-examination-engine.md) and
[ADR-014](docs/adr/ADR-014-exam-grade-component-binding.md).

### The one invariant — the frontend decides nothing
Every action is gated by a **server-computed `allowedActions` flag**, never a status
comparison in a component, and the UI always surfaces the command's typed error — the backend
command is the sole authority. Enforced by a static UI architecture guard (no status-literal
compare, no repository / `@/server/db` import in any component or page).

### What's in the portal
- **Dashboard** — KPIs / summaries / alerts from the overview service only (no recalculation).
- **Periods / Rooms / Sessions** — list + create + full lifecycle; **Session detail with 7
  tabs** (Overview + lifecycle, Candidates, Attendance, Results, Publication, Integration,
  Activity).
- **Appeals** — list + detail with the **original → current-official** visual comparison
  (append-only revisions; the published original is never overwritten) + decision panel.
- **Operations** (`exams.operationsView`) — detection-only conflicts (room / invigilator /
  scheduling gaps) and integration-health KPIs.

### Guarantees
- No route/DTO exposes `eligibilitySnapshot`, `ExamEvent.metadata`, audit blobs, or
  Transcript/Certificate/Grade internals; org is always resolved server-side; batched reads
  (no N+1). The normalized score is labelled **"Percentagem do exame"**, never "Nota Final".
- No new permissions — reuses the 22 existing `exams.*`.

### Known limitations (future — behaviour unaffected)
- Register-candidate / create-session use id-based references (picker UI deferred; commands
  still validate every id). Admin/secretary scope only (no Teacher/Student/Guardian portals).

### Validation at release
`tsc --noEmit` ✓ (0) · `vitest run src/modules/examinations` **809/809 (37 files, incl. the UI
architecture guard)** ✓ · `eslint` ✓ (0) · `prisma validate` ✓. **No schema/migration change.**
The repo-wide `next build` fails only on the pre-existing, unrelated prerequisites circular
import ([BUG-PREREQ-001](docs/bugs/BUG-PREREQ-001.md)) — out of scope.

Full detail: [docs/releases/examination-portal-v1.0.0.md](docs/releases/examination-portal-v1.0.0.md).
