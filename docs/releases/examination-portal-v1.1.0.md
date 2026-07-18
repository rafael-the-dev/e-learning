# Examination Administration Portal v1.1.0 — 2026-07-17

**Status: Production Ready.** A scalability, productivity, and UX release for the
admin/secretary examination portal. Builds on
[v1.0.0](examination-portal-v1.0.0.md); runs over the **frozen** Examination Engine with
**no schema, migration, or engine behaviour change**. Frozen after UX Audit #3
(*YES WITH MINOR UX DEBT*, Overall UX 7.4/10, 0 Critical / 0 High open).

Full detail: [Architecture & Product Closure v1.1.0](../examination-portal-v1.1-closure.md) ·
[CHANGELOG](../examination-portal-CHANGELOG.md) ·
[ADR-015](../adr/ADR-015-examination-portal-freeze.md).

---

## What's new

### Do the whole exam at scale
Sessions with 20, 100, or 300 candidates are now practical to run:
- **Bulk registration** — pick candidates from the roster, see a preview (who's eligible,
  already registered, or out of seats) *before* you commit, and get a clear per-candidate
  report of anything skipped or failed.
- **Mark everyone present in one click** — whole-session attendance, not row-by-row, with a
  confirmation and a summary.
- **Submit / review / approve the whole session at once** — no need to select hundreds of
  rows; enter scores inline and save all drafts together.

### Find things by name, not by id
- **Search everywhere it matters** — sessions, appeals, candidates, and periods are
  searchable by real names (student, subject, room, session) rather than internal ids.
- **Searchable pickers** for student, enrolment, period, subject, and room — with your
  recent choices and full keyboard support. (You no longer paste ids anywhere.)
- **Names, not codes** — the Operations panel and appeals show people and rooms by name.

### A calmer, faster interface
- **No more full-page reloads** inside a session — each action refreshes only what changed,
  keeping your place and scroll position.
- **Instant attendance marking** with automatic undo if the server rejects a change.
- **Operations control panel** — one place to spot scheduling gaps and room/invigilator
  clashes and jump straight to the session that needs fixing.

### Safer, clearer results workflow
- **Publishing now asks you to confirm** before making results visible to candidates —
  matching the existing "retract" safeguard.
- **Integration status is fully in Portuguese**, including failure states, so the gradebook
  hand-off reads clearly.

---

## Compatibility

- **No data changes.** No database schema change and **no migration is required**.
- **No new permissions.** Reuses the existing 22 `exams.*` permissions and roles — existing
  users keep exactly the access they had.
- **Compatible with existing modules.** The portal remains a read/command surface over the
  frozen engine; Grade/Progression integration behaviour is unchanged. Transcript and
  Certificate engines are unaffected (they only ever react downstream).
- **Backwards compatible** with v1.0.0 — same routes, same URLs, same APIs.

---

## Upgrade

This is a code-only release for the portal layer.

1. Deploy the application build containing this release. **No migration step.**
2. No configuration or environment change is required.
3. No data backfill or re-index is required.
4. Verify after deploy: open `/examinations`, confirm the dashboard loads, and confirm
   `Publicar` on a ready session now shows a confirmation dialog.

**Rollback:** redeploy the previous build. Because there is no schema or data change,
rollback is immediate and lossless.

---

## Not in this release (planned for v1.2)

One-click cross-session bulk integration; notifications/Outbox; teacher/student/guardian exam
portals; and UX polish (invigilator search picker, Attendance-tab search, more filter
options, a results-pipeline stepper, unified tables with sorting/sticky headers,
click-through Operations KPIs, command palette). Rationale in
[ADR-015](../adr/ADR-015-examination-portal-freeze.md).

---

## Validation at release

`tsc --noEmit` ✓ (0) · `vitest run src/modules/examinations` **821/821 (41 files, incl. the
UI architecture guard, the publish-confirmation test, and the integration-i18n tests)** ✓ ·
`eslint` ✓ (0). **No schema/migration change.**

> As with v1.0.0, the repo-wide `next build` fails only on a **pre-existing, unrelated**
> circular import in the Prerequisites/Academic-Core module
> ([BUG-PREREQ-001](../bugs/BUG-PREREQ-001.md)) — zero examination involvement.
