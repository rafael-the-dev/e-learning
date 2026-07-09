# ADR-010 — Export Adapter Architecture

- **Status:** Accepted
- **Date:** 2026-07-09
- **Scope:** Certificate Engine (Phases 8, 11)
- **Refines:** [ADR-002](./ADR-002-certificate-engine-architecture.md)

## Context

Certificates are exported as artifacts: a rendered PDF (Phase 8) and a ministry
payload in JSON/CSV/XML (Phase 11). Rendering and storage are infrastructure concerns
that will change over time (a different PDF engine, a different storage backend, a
real ministry API).

## Problem

If a command renders PDFs or talks to storage directly, the domain becomes coupled to
infrastructure: the renderer/storage cannot be swapped without editing commands, and
slow I/O risks leaking into transactions and into the service layer.

## Decision

**Export is composed from swappable adapters behind interfaces; commands depend on the
interfaces, not the implementations.**

- **Adapters live in `export/`, deliberately outside `services/`.** The service-layer
  guards forbid PDF/storage dependencies in a service; these are infrastructure
  adapters, not domain services.
- **Interfaces in `types/export.ts` / `types/ministry.ts`.** The command depends on
  `CertificatePdfRenderer`, `CertificateExportStorage`, and the ministry
  payload/formatter/transport contracts — so any adapter can be replaced wholesale.
- **PDF path:** `certificate-pdf-renderer.ts` (bytes only, no rule, no repository) +
  `certificate-export-storage.ts` (persist, hash → `fileChecksum`, return an internal
  key) + `certificate-export-storage-reader.ts` (read bytes back for authenticated
  download).
- **Ministry path:** a pure `certificate-ministry-payload.ts` builder + format
  serializers + a `certificate-ministry-transport.ts` port (a **local stub** in v1) +
  ministry storage.
- **Slow I/O is outside the transaction.** Render/upload/network run **before** a
  short DB-only transaction that flips the `CertificateExport` row to READY, writes the
  audit event, and (after commit) emits `certificate.exported` via the Outbox. The
  export row is created PENDING first; failures mark it FAILED best-effort.
- **`fileUrl` is internal.** It is never returned to a client; download streams bytes
  through the authenticated download service.

## Consequences

**Positive.** The PDF engine, storage backend, and ministry transport are each
replaceable without touching domain logic; transactions stay short; the export lifecycle
(PENDING/READY/FAILED) is observable for operations.

**Negative.** The ministry transport is a stub — a "successful" ministry export means
the artifact was produced/stored, not transmitted (a real API is future work). More
indirection than calling a renderer inline.

## Enforcement

Service guards forbid `react-pdf`/storage/ministry imports in `services/`; the export
command tests assert render/upload happen outside the transaction; the download path
never exposes `fileUrl`.

## Review

Revisit when a real ministry API is introduced, or when a new export type/renderer/
storage backend is added — each should be an adapter implementing the existing
interface, not a change to commands (see the developer guide, "future extensions").
