# ADR-004 — Transcript Anti-Corruption Layer (ACL)

- **Status:** Accepted
- **Date:** 2026-07-09
- **Scope:** Certificate Engine
- **Refines:** [ADR-002](./ADR-002-certificate-engine-architecture.md) (Rule C-1)

## Context

The Certificate Engine is downstream of the Academic Transcript Engine. It needs
academic facts (student/course identity, levels, subjects, assessments, attendance)
to build a certificate — but those facts live in the transcript's persistence model,
which is owned and evolved by another engine.

## Problem

If certificate code reads transcript tables directly, the two engines become
coupled: a transcript schema change ripples across every certificate file, and
academic-recompute logic can leak in (reading raw grade/attendance rows and
"just checking" a value). ADR-001/ADR-002 forbid reaching past the Transcript.

## Decision

**Exactly one file may read Transcript tables:**
`repositories/certificate-transcript-source.repository.ts` — an **anti-corruption
layer**. It translates the transcript's internal model into Certificate DTOs
(`types/transcript-source.ts`); everything else consumes those DTOs and never names a
transcript table.

Binding properties of the ACL:

- **Read-only.** No create/update/delete/upsert/mark-stale on transcript rows; no
  lifecycle, numbering, checksum, events, or audit on transcript data.
- **No business logic.** It copies stored snapshot facts verbatim — no grade,
  attendance, completion, or eligibility calculation, no derived fields. (It parses
  the stored `{ course, courseProgress }` JSON envelope into two DTO fields, copied
  verbatim.)
- **Tenant-scoped.** Every query carries `organizationId` and uses
  `findFirst`/`findMany`/`count`; only ISSUED versions are surfaced for certification.
- **DTO-only surface.** It exposes no Prisma entity, relation, or persistence detail.

Consequence: if the transcript schema changes, **only this file changes**; the DTO
contract keeps every downstream certificate component untouched.

## Consequences

**Positive.** The cross-engine coupling is confined to one file; academic recompute
cannot leak in; the transcript team can evolve their schema behind the DTO contract.

**Negative.** A new transcript fact a certificate needs must be added to the DTOs and
mapped in the ACL first — you cannot read it ad hoc elsewhere.

## Enforcement

`repositories/__tests__/architecture-guards.test.ts` asserts the ACL contains no
write-shaped Prisma call or exported write-shaped function, and that **no other**
certificate file references `AcademicTranscript*` or imports the ACL module. Module-
wide guards forbid importing the Grade/Attendance engines entirely.

## Review

Revisit only if the transcript stops being the sole academic source, or if a
certificate capability genuinely cannot be served by a verbatim snapshot copy (which
would first require the upstream to expose it — see ADR-002).
