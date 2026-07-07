import type { PrismaClientOrTx } from "@/server/db";

// =============================================================================
// TRANSCRIPT NUMBER ALLOCATION
// -----------------------------------------------------------------------------
// Human-facing, gap-tolerant sequential number per (organization, year).
// Format: TRN-{year}-{seq zero-padded to 6}. ONE shared sequence per
// organization+year across all transcript types (per D9) — the type is NOT part
// of the counter key nor the number, so every issued number is globally unique
// per organization (matching `AcademicTranscript`'s per-org unique index).
//
// Per decision D9, the number is assigned at ISSUE time (never for a DRAFT):
// only `allocateTranscriptNumber` bumps the counter, and callers must invoke it
// inside the issue transaction. `TranscriptNumberCounter` rows must never be
// deleted, so a revoked/superseded transcript still burns its sequence value.
// =============================================================================

const SEQ_PAD = 6;

/**
 * Pure formatter. `formatTranscriptNumber(2026, 1) === "TRN-2026-000001"`.
 */
export function formatTranscriptNumber(year: number, seq: number): string {
  return `TRN-${year}-${String(seq).padStart(SEQ_PAD, "0")}`;
}

export interface AllocateTranscriptNumberParams {
  organizationId: string;
  year: number;
}

/**
 * Transactional allocator. MUST be called with a Prisma transaction client so
 * the counter bump and the transcript write commit atomically.
 *
 * Concurrency: the `update` acquires a row lock on the unique
 * (organizationId, year) counter row, which serializes concurrent allocations
 * for that scope within their transactions — no two issues can read the same
 * `lastSeq`. The first allocation for a scope has no row yet, so we fall back to
 * creating it seeded at `lastSeq = 1`.
 */
export async function allocateTranscriptNumber(
  tx: PrismaClientOrTx,
  params: AllocateTranscriptNumberParams
): Promise<string> {
  const { organizationId, year } = params;

  const existing = await tx.transcriptNumberCounter.findUnique({
    where: {
      organizationId_year: { organizationId, year },
    },
    select: { id: true },
  });

  if (existing) {
    const updated = await tx.transcriptNumberCounter.update({
      where: {
        organizationId_year: { organizationId, year },
      },
      data: { lastSeq: { increment: 1 } },
      select: { lastSeq: true },
    });
    return formatTranscriptNumber(year, updated.lastSeq);
  }

  const created = await tx.transcriptNumberCounter.create({
    data: { organizationId, year, lastSeq: 1 },
    select: { lastSeq: true },
  });
  return formatTranscriptNumber(year, created.lastSeq);
}
