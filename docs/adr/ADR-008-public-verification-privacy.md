# ADR-008 — Public Verification Privacy

- **Status:** Accepted
- **Date:** 2026-07-09
- **Scope:** Certificate Engine (Phase 7)
- **Refines:** [ADR-002](./ADR-002-certificate-engine-architecture.md)

## Context

Anyone holding a certificate's verification code must be able to confirm it is
genuine, without authentication. This surface is public, unauthenticated, and
internet-facing.

## Problem

A public endpoint is an enumeration and data-exposure risk. Naively it could leak
academic detail (grades, subjects, attendance), internal ids, checksums, or the
transcript pointer; it could confirm the existence of hidden certificates; and it
could be abused at volume.

## Decision

**Public verification reads a dedicated, privacy-safe projection and reveals
nothing beyond a whitelist.**

- **Reads only the `CertificateVerification` projection** (+ minimal certificate
  columns and the organization name). It never reads Academic Core, the transcript,
  grades, attendance, or finance, and never recomputes validity.
- **Whitelisted response only** (`CertificatePublicVerificationDto`): resolved
  `status`, certificate number/type, organization name, a **masked** student display
  name (e.g. "João S."), course name, issued/expires dates. No transcript
  pointer/checksum, no certificate checksum, no student document number, no internal
  ids, no audit metadata.
- **No existence leak.** Unknown code, soft-deleted certificate, and
  not-publicly-issued all return `200` with `status: "NOT_FOUND"` — indistinguishable
  from each other, so the endpoint cannot be probed for hidden ids.
- **Input validated before any DB access.** The code must be 32 lowercase-hex chars
  (128-bit); malformed input returns `400` and never hits the DB.
- **Rate limited.** 30 requests / 60 s per client IP; excess returns `429` with
  `Retry-After`.
- **Never cacheable.** All responses carry `Cache-Control: no-store` (a cached
  VALID/NOT_FOUND would leak or go stale).
- **Expiry lives on the projection.** A certificate can read `EXPIRED` publicly while
  `Certificate.status` stays `ISSUED` (see [ADR-012](./ADR-012-certificate-lifecycle.md)).

## Consequences

**Positive.** Verification is genuinely public yet leaks nothing sensitive and cannot
be enumerated; the projection is a stable contract for the public page.

**Negative.** The per-process rate limiter is not distributed — behind N instances
the effective per-IP limit is up to N× until a shared limiter exists (future work).
The masked name is intentionally low-fidelity.

## Enforcement

Route tests assert `no-store` on all paths, the 400/429 behaviour, and the
NOT_FOUND-for-all-absent-cases invariant. The DTO type is the privacy boundary and is
reviewed as such.

## Review

Revisit if a distributed rate limiter is introduced, or if regulation changes what
may/must appear on a public verification.
