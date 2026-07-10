# ADR-013 — Examination Engine Architecture (v1.0 design freeze)

- **Status:** **Accepted** · **Implemented & frozen v1.0** (2026-07-10) — see
  [release notes](../releases/examination-engine-v1.0.0.md). Phases 0–11B + 13 delivered;
  Phases 12 (portals/API) and 14 (Outbox) deferred beyond v1.0.
- **Date:** 2026-07-09
- **Scope:** Examination Engine (new bounded context)
- **Builds on:** [ADR-001](./ADR-001-academic-core-freeze.md) (Academic Core),
  [ADR-002](./ADR-002-certificate-engine-architecture.md) (Certificate Engine), and the
  Certificate decision records [ADR-003](./ADR-003-single-eligibility-engine.md),
  [ADR-004](./ADR-004-transcript-acl.md), [ADR-005](./ADR-005-snapshot-immutability.md),
  [ADR-006](./ADR-006-outbox-pattern.md), [ADR-007](./ADR-007-read-write-separation.md),
  [ADR-009](./ADR-009-stale-reactive-model.md).

> **Related:** [Examination Engine — Domain Design & Architecture](../examination-engine.md)
> (the full Phase 0 design this ADR freezes).

## Context

The platform's academic lifecycle is owned by the Academic Core (frozen, ADR-001) and its
official record by the Transcript Engine; the Certificate Engine (frozen v1.0, ADR-002)
consumes the Transcript. The platform now needs an **official examination layer** —
scheduling, eligibility, sessions, exam attendance, result capture, review, publication,
appeals — as defensible, auditable, integrable facts. A Phase-0 review found the initial
design directionally correct but not schema-ready; this ADR records the **resolved** design
so Phase 1 (Data Model) can begin.

## Problem

An examination layer is tempted to: **duplicate grade ownership** (writing subject grades),
**reach into other engines' writes** (class attendance, transcripts, certificates),
**scatter eligibility** across commands, **overwrite published results in place** on appeal,
**let the eligibility engine own race-sensitive capacity checks**, and **omit re-sit
modelling**. Each corrupts a single source of truth, breaks race-safety, or destroys
auditability.

## Decision

Adopt the design in [examination-engine.md](../examination-engine.md) with binding rules
**E-1…E-13** (see that document §2). In particular:

- **Bounded context** (E-1); **consumes, never owns, Academic Core** via a read-only ACL
  (E-2, mirrors ADR-004).
- **Single eligibility authority** for academic/administrative fitness (E-3), with a
  **pure** engine and a fact-loading source (E-4); commands only execute (E-5).
  **Race-sensitive operational checks** (capacity, duplicate registration, seat/room/
  invigilator conflicts) are **command-level conditional writes, not engine decisions**
  (E-3a).
- **Results are official facts** (E-6); a **published result is immutable and is never
  mutated** — corrections/appeals/retractions produce an append-only **`ExamResultRevision`**
  with a single current revision; consumers read the **current official result** (E-6a, E-8).
- **Publication is the visibility boundary** (E-7).
- **Exam attendance ≠ class attendance**; never mutates the Attendance Engine (E-10).
- **No Certificate/Transcript mutation** (E-11, upholds ADR-002); downstream staleness after
  a revision/retraction flows through existing Transcript supersession → Certificate STALE
  (ADR-009).
- **Events transition-based, post-commit, via the Outbox** (E-12, ADR-006).
- **The Grade Engine is the single grade writer** (E-13); exams publish facts a Grade
  adapter imports.

### Resolved decisions (D1–D14)

- **D1** — Examination owns the official exam **fact**; the **Grade Engine owns the grade
  write** (import adapter).
- **D2** — Manual approval is a **non-blocking gate** (`requiresApproval`).
- **D3** — Financial clearance loaded via the **finance read-model**; snapshot into the
  eligibility decision when recorded.
- **D4** — Appeals use **`ExamResultRevision`**; no silent rewrite.
- **D5** — Transcript **does not read exam raw tables**; consumes via Grade/Progression.
- **D6** — A teacher **cannot review their own marked result** unless assigned reviewer and
  not marker.
- **D7** — **Auto-registration deferred** from v1.0.
- **D8** — Exam attendance is **separate**; does not mutate the Attendance Engine nor
  directly finalize progression.
- **D9** — Publication is **per `ExamSession`** in v1.0.
- **D10** — Retraction creates a **revision/retraction outcome + downstream transition**;
  never deletes.
- **D11** — **`ExamRoom` is a local v1 model**, designed for future migration to a shared
  Location model.
- **D12** — **`ExamAttempt` is first-class** and required in Phase 1 (re-sits are explicit).
- **D13** — Exam outcome is **not** academic progression; Progression/Grade retain
  authority.
- **D14** — **`ExamResultRevision`** is the append-only, single-current mechanism.

## Consequences

**Positive.** One source of truth per fact (grades → Grade Engine, exam facts →
Examination Engine); race-safe registration/scheduling; a defensible, append-only history
(no in-place rewrites); explicit, opt-in integration with Progression/Transcript/
Certificate; re-sits modelled from day one; consistency with the frozen Certificate patterns
(reusable ACL/eligibility/Outbox/STALE shapes → low ramp-up).

**Negative.** Discipline over convenience: recording an exam result does not "update the
gradebook" — integration is an explicit adapter; appeals cost a revision record instead of
an edit; capacity/duplicate live in commands, not the tidy engine result. Some shape
duplication with the Certificate Engine (eligibility source/engine, Outbox), accepted for
isolation.

## Rejected alternatives

- **Examination Engine writes grades directly** — rejected: duplicates grade ownership and
  breaks the single-writer invariant (E-13). The Grade Engine imports exam facts instead.
- **Published results overwritten in place on appeal/retraction** — rejected: destroys the
  historical fact and auditability (E-6a/E-8). Superseded via `ExamResultRevision`.
- **Eligibility engine owns capacity / duplicate-registration checks** — rejected: live
  counts create a TOCTOU race; these belong to command-level conditional writes (E-3a).
- **Certificate/Transcript read exam raw tables directly** — rejected: violates ADR-002 and
  the bounded-context boundary (E-11/D5). They consume via Grade/Progression.
- **Attempts / re-sits modelled later** — rejected: the candidate/result 1:1 shape would
  block re-sits and force schema churn; `ExamAttempt` is first-class in Phase 1 (D12).

## Phase roadmap

Phase 0 (design, this ADR) → 1 Data Model (incl. `ExamAttempt`, `ExamResultRevision`) →
2 Repositories + Academic ACL → 3A/3B Eligibility source/engine → 4 Scheduling →
5 Registration → 6 Attendance → 7 Result entry → 8 Review/Approval → 9 Publication →
10 Appeals/revisions → 11 Grade/Progression integration → 12 Portals/API → 13 Bulk →
14 Operational hardening. (Detail in [examination-engine.md §18](../examination-engine.md).)

## Review

Revisit if: examinations must own subject grades directly (D1/E-13 reversal); regulation
requires a different official-record or appeal model; a shared Location model is adopted
(D11); a downstream consumer needs direct official-result reads (D5); auto-registration is
enabled (D7); or the upstream Academic Core / Transcript contract changes. Any such revision
is a new ADR that supersedes or amends this one; this document is not edited in place once
Accepted.
