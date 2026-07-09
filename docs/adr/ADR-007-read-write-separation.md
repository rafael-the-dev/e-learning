# ADR-007 — Read/Write Separation (Commands · Services · Repositories)

- **Status:** Accepted
- **Date:** 2026-07-09
- **Scope:** Certificate Engine
- **Refines:** [ADR-002](./ADR-002-certificate-engine-architecture.md)

## Context

The engine has three kinds of work: mutating certificate state (issue, revoke, …),
reading it for portals/operations, and persisting/loading rows. Without a strict
separation these blur — routes grow rules, repositories grow decisions, services
start writing.

## Problem

Mixed responsibilities make behaviour hard to reason about and test: a rule
implemented in a repository cannot be unit-tested without a DB; a service that writes
can corrupt state on a read path; a route with inline logic bypasses the command
pipeline (validation/authorization/transaction).

## Decision

**Three layers, one direction, one responsibility each.**

- **Commands (`commands/`) are the only layer that mutates.** Each extends
  `BaseCommand`: `run()` → `validate()` (Zod) → `authorize()` (CASL/RBAC) →
  `execute()` (one transaction). State transitions use conditional writes
  (`WHERE status = expected`, assert `count === 1`); the audit `CertificateEvent` is
  written inside the transaction; events dispatch after commit via the Outbox.
- **Services (`services/`) are read-only.** They compose repository reads into DTOs
  and never write to the DB, never reference `eventPublisher`. Pure domain logic (the
  eligibility engine) lives here too and stays pure.
- **Repositories (`repositories/`) are the only Prisma importers.** They persist and
  read, always scoped by `organizationId`, and contain **no business logic** — no
  eligibility, no grade/attendance math, no lifecycle decision, no numbering/checksum,
  no events/audit. Soft delete only; the event repository is append-only.
- **Routes** are thin transport shells: authenticate, delegate to a command or read
  service, map typed errors to HTTP. No rules.

Dependency direction is strictly one-way: `route → command/service → repository →
Prisma`; services never import commands; repositories never import services/commands.

## Consequences

**Positive.** Each layer is independently testable (repositories with a fake DB,
services for authz/scoping, commands for the transition + concurrency, engine as a
pure function); mutations always pass validation/authorization/transaction; reads
cannot corrupt state.

**Negative.** More files and indirection than a "fat service" approach; a trivial
change may touch a schema, a repository, a service and a route.

## Enforcement

Guard tests: repositories carry no lifecycle helper, no events/audit/checksum/
numbering, no hard delete; the event repo is append-only; operational services
perform no DB write and never reference `eventPublisher`; operational routes import no
repository or command.

## Review

Revisit only if the layering demonstrably blocks a needed capability. Collapsing
layers for convenience is explicitly rejected.
