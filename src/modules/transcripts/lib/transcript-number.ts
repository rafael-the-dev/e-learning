import type { PrismaClientOrTx } from "@/server/db";

// =============================================================================
// TRANSCRIPT NUMBER ALLOCATION
// -----------------------------------------------------------------------------
// Human-facing, gap-tolerant sequential number per (organization, year,
// transcriptType). Format: TRN-{year}-{seq zero-padded to 6}.
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
  transcriptType: string;
}

/**
 * Transactional allocator. MUST be called with a Prisma transaction client so
 * the counter bump and the transcript write commit atomically.
 *
 * Concurrency: the `update` acquires a row lock on the unique
 * (organizationId, year, transcriptType) counter row, which serializes
 * concurrent allocations for that scope within their transactions — no two
 * issues can read the same `lastSeq`. The first allocation for a scope has no
 * row yet, so we fall back to creating it seeded at `lastSeq = 1`.
 */
export async function allocateTranscriptNumber(
  tx: PrismaClientOrTx,
  params: AllocateTranscriptNumberParams
): Promise<string> {
  const { organizationId, year, transcriptType } = params;

  const existing = await tx.transcriptNumberCounter.findUnique({
    where: {
      organizationId_year_transcriptType: { organizationId, year, transcriptType },
    },
    select: { id: true },
  });

  if (existing) {
    const updated = await tx.transcriptNumberCounter.update({
      where: {
        organizationId_year_transcriptType: { organizationId, year, transcriptType },
      },
      data: { lastSeq: { increment: 1 } },
      select: { lastSeq: true },
    });
    return formatTranscriptNumber(year, updated.lastSeq);
  }

  const created = await tx.transcriptNumberCounter.create({
    data: { organizationId, year, transcriptType, lastSeq: 1 },
    select: { lastSeq: true },
  });
  return formatTranscriptNumber(year, created.lastSeq);
}
