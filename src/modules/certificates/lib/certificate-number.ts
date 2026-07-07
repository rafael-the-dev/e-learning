import type { PrismaClientOrTx } from "@/server/db";
import { CERTIFICATE_NUMBER_PREFIX } from "@/modules/certificates/constants";

// =============================================================================
// CERTIFICATE NUMBER ALLOCATION
// -----------------------------------------------------------------------------
// Human-facing, gap-tolerant sequential number per (organization, year).
// Format: CERT-{year}-{seq zero-padded to 6}. ONE shared sequence per
// organization+year across ALL certificate types (per D2) — the type is NOT part
// of the counter key nor the number, so every issued number is globally unique
// per organization (matching the per-org unique index the Certificate model will
// carry in Phase 1).
//
// NOTE (deliberate deviation from the transcript engine): the counter key is
// (organizationId, year) with NO type dimension. This mirrors the CORRECT
// transcript numbering (see transcript-number.ts) and must NOT be scoped by
// certificateType — doing so would break global per-org uniqueness of the number.
//
// Per decision D2, the number is assigned at ISSUE time (never for a DRAFT):
// only `allocateCertificateNumber` bumps the counter, and future callers must
// invoke it inside the issue transaction. Counter rows are never deleted, so a
// revoked/superseded/stale certificate still burns its sequence value.
//
// PHASE 0: this module ships the pure formatter and the transactional allocator,
// but NO command allocates a number yet. The allocator is exercised only by tests.
// =============================================================================

const SEQ_PAD = 6;

/**
 * Pure formatter. `formatCertificateNumber(2026, 1) === "CERT-2026-000001"`.
 * Does not clamp above 6 digits — the pad is a minimum width, not a maximum.
 */
export function formatCertificateNumber(year: number, seq: number): string {
  return `${CERTIFICATE_NUMBER_PREFIX}-${year}-${String(seq).padStart(SEQ_PAD, "0")}`;
}

export interface AllocateCertificateNumberParams {
  organizationId: string;
  year: number;
}

/**
 * Transactional allocator. MUST be called with a Prisma transaction client so the
 * counter bump and the certificate write commit atomically.
 *
 * Concurrency: the `update` acquires a row lock on the unique (organizationId,
 * year) counter row, which serializes concurrent allocations for that scope within
 * their transactions — no two issues can read the same `lastSeq`. The first
 * allocation for a scope has no row yet, so we fall back to creating it seeded at
 * `lastSeq = 1`.
 *
 * First-allocation race: if two transactions both find no counter row and both
 * attempt `create`, the unique (organizationId, year) index makes the second
 * `create` fail. That is surfaced as the raw Prisma unique-constraint error (P2002)
 * — the caller's transaction rolls back and may be retried. This is documented as
 * a future retry seam rather than swallowed here (Phase 0 keeps the helper thin).
 */
export async function allocateCertificateNumber(
  tx: PrismaClientOrTx,
  params: AllocateCertificateNumberParams
): Promise<string> {
  const { organizationId, year } = params;

  const existing = await tx.certificateNumberCounter.findUnique({
    where: {
      organizationId_year: { organizationId, year },
    },
    select: { id: true },
  });

  if (existing) {
    const updated = await tx.certificateNumberCounter.update({
      where: {
        organizationId_year: { organizationId, year },
      },
      data: { lastSeq: { increment: 1 } },
      select: { lastSeq: true },
    });
    return formatCertificateNumber(year, updated.lastSeq);
  }

  const created = await tx.certificateNumberCounter.create({
    data: { organizationId, year, lastSeq: 1 },
    select: { lastSeq: true },
  });
  return formatCertificateNumber(year, created.lastSeq);
}
