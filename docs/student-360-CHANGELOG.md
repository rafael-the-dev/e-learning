# Changelog — Student 360

Based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); follows
[Semantic Versioning](https://semver.org/). Scope: the `/students/[studentId]`
Student 360 aggregator and the academic/finance figures it shares with the Student
Portal and Guardian Portal. See the [module document](student-360.md).

---

## [Unreleased]

Architectural-review hardening of the Student 360 aggregator (H1 security boundary,
H2 single-source academic average). On feature branch `feat/transcript-engine`;
validation at commit: `tsc` 0 · 228 module tests · `eslint` 0.

### Security
- **Finance permission boundary at the aggregator.** Student 360 no longer queries,
  computes, or returns any finance figure to a viewer without finance permission — the
  gate is at the service boundary, not the UI (no finance query, no computation, no
  payload). Previously a viewer with `STUDENTS_READ` but no finance permission (e.g. the
  default TEACHER role) could see outstanding balance, wallet balance, the finance health
  axis and finance alerts.
- **Split finance into two independent capabilities** so the RBAC policy is explicit
  instead of "whoever sees invoices also sees the wallet": billing (invoices / payments /
  dívida) ← `INVOICES_VIEW`; wallet (saldo / movimentos / reembolsos) ← `WALLETS_VIEW`.
  Each half is a projection carrying only its own fields, so a billing-only viewer never
  receives a wallet figure in the payload (and vice-versa). The health finance axis is
  excluded and the weights renormalized when billing is not authorized; `overdue-balance`
  alerts require `INVOICES_VIEW` and `pending-refund` alerts require `WALLETS_VIEW`. Same
  boundary fixed in the Guardian Portal (previously masked at render but still fetched).

### Changed
- Standardized the displayed academic average across Student 360, Student Portal and
  Guardian Portal.
- The displayed "Média das Disciplinas" is now derived from the canonical
  StudentSubjectProgress final grades rather than legacy assessment-result samples.
- Introduced a single canonical read model (`student-academic-summary.service`) computed
  once per request and consumed by every surface; it exposes both `subjectAverage`
  ("Média das Disciplinas", simple mean) and `courseFinalGrade` (the weighted course
  rollup already shown by the Academic Transcript), plus the subject tallies, current
  level and progression-status label — removing three duplicated academic-status-label
  derivations and four divergent average definitions.
- The Academic Transcript is intentionally **not** routed through the new function: it
  already reads the same canonical persisted source (`StudentCourseProgress.finalGrade`),
  so the value is consistent by origin. The invariant is the canonical origin of the
  value, not that every consumer traverses the exact same function.

### Fixed
- The Student 360 "Média" KPI on the Notas tab was computed over only the current
  paginated slice of assessment results (10 rows), so the headline average changed as the
  user paged. It now shows the canonical `subjectAverage` over the student's whole record.

### Notes
- **Visible-number change (intentional):** because the Student Portal and Guardian Portal
  previously averaged the legacy `AssessmentResult` table (published-only, capped at 15
  rows), their displayed average value will change to the canonical figure. No API,
  schema, or migration change. Secretary/Admin already hold both finance permissions →
  finance experience unchanged; Teacher holds neither → zero finance queries.

### Out of scope (flagged, not addressed here)
- The **attendance** average is still recomputed in several places (review finding H5) —
  the same single-source consolidation applied to grades has not yet been applied to
  attendance.
