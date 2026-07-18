# Changelog — Student Examination Portal

Based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); follows
[Semantic Versioning](https://semver.org/). Scope: the student-facing
`/student/examinations` module over the frozen Examination Engine. No engine
behaviour, schema, or migration is changed by any release.

---

## [1.0.0] — 2026-07-18

Initial Student Examination Portal. Frozen as **Production Ready** after a UX Audit
(Overall 7.5/10, 0 Critical / 0 High) and an explicit Security Review. See the
[closure document](student-examination-portal-v1.0-closure.md) and
[ADR-016](adr/ADR-016-student-examination-portal-freeze.md).

### Added
- **Dedicated `/student/examinations` module** with a secondary nav
  (Resumo / Próximos / Resultados / Recursos / Histórico) — the first
  `/student/<submodule>` route tree.
- **Overview** — KPIs (próximo exame / exames esta semana / resultados por publicar /
  recursos pendentes), next-exam highlight, short lists, alerts.
- **Upcoming exams** list → **Exam Details** (informações, "Informações para o exame"
  = free-text instructions + derived duration + room, eligibility verdict + reasons,
  4-step timeline, result summary when published).
- **Results** list → **Result Details** (score, Percentagem do exame, result code,
  related appeal, create-appeal action).
- **Appeals** — list + detail; file an appeal (single "Motivo do recurso"); track
  status/decision; withdraw (confirm-guarded). Two student-scoped API routes delegate
  to the frozen Create/Withdraw commands.
- **History** — candidacy-based (includes exams with no published result, absences,
  withdrawals), server-side paginated, URL-persisted filters (ano/disciplina/estado)
  with facet options.
- **Dashboard summary card** on `/student` (next exam + results-pending) and a global
  nav entry "Exames" (`studentPortal.view`).
- **Student capabilities** — `canCreateAppeal`/`canWithdraw` + blocked reasons (not
  admin `allowedActions`).

### Security
- studentId resolved **server-side** always (never from the URL); every read scoped by
  organizationId + studentId + resourceId.
- Results **masked to PUBLISHED-only**; non-owned/missing/non-published → `notFound()`
  (fail closed, never 403/500 for a resource read).
- DTOs never expose reviewer/approver/decisionReason/audit/integration/allowedActions
  or the raw eligibilitySnapshot; `publicComment` reserved-null.
- Only `/api/student/*` endpoints — no admin/teacher/organization endpoint reuse.

### UX (at freeze)
- Empty states explain **why** they're empty and **what happens next** (upcoming,
  results, appeals, history, overview panels).
- Appeal creation is discoverable from the Recursos empty state (links to Resultados).
- History rows link out (to the result or exam detail) — no dead ends.

### Notes
- **No schema/migration change; no new permissions; no engine change.**
- Validation at freeze: `tsc --noEmit` 0 errors · `eslint` clean · module tests 18/18 ·
  full suite green.

### Deferred to v1.1 (see [ADR-016](adr/ADR-016-student-examination-portal-freeze.md))
- Theme-token colors on alerts/timeline; `aria-current` on timelines; badge
  reconciliation with the admin registry; loading skeletons; text search on
  results/appeals. Out of scope entirely: PDF download, push notifications, external
  calendar, AI, structured Exam Policy domain, pass/fail semantics, appeal deadlines.

---

[1.0.0]: #100--2026-07-18
