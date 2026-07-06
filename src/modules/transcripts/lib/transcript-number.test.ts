import { describe, it, expect, vi } from "vitest";
import {
  formatTranscriptNumber,
  allocateTranscriptNumber,
} from "@/modules/transcripts/lib/transcript-number";
import type { PrismaClientOrTx } from "@/server/db";

describe("formatTranscriptNumber", () => {
  it("zero-pads the sequence to 6 digits", () => {
    expect(formatTranscriptNumber(2026, 1)).toBe("TRN-2026-000001");
  });

  it("handles the upper boundary without truncating", () => {
    expect(formatTranscriptNumber(2026, 999999)).toBe("TRN-2026-999999");
  });

  it("does not clamp above 6 digits", () => {
    expect(formatTranscriptNumber(2026, 1000000)).toBe("TRN-2026-1000000");
  });

  it("uses the given year verbatim", () => {
    expect(formatTranscriptNumber(2030, 42)).toBe("TRN-2030-000042");
  });
});

describe("allocateTranscriptNumber", () => {
  const params = { organizationId: "org-1", year: 2026, transcriptType: "FULL" };

  // Minimal mocked tx exposing only the transcriptNumberCounter delegate used
  // by the allocator. Cast through unknown to satisfy PrismaClientOrTx.
  function makeTx(overrides: {
    findUnique: ReturnType<typeof vi.fn>;
    update?: ReturnType<typeof vi.fn>;
    create?: ReturnType<typeof vi.fn>;
  }): PrismaClientOrTx {
    return {
      transcriptNumberCounter: {
        findUnique: overrides.findUnique,
        update: overrides.update ?? vi.fn(),
        create: overrides.create ?? vi.fn(),
      },
    } as unknown as PrismaClientOrTx;
  }

  it("increments an existing counter row and returns the formatted number", async () => {
    const findUnique = vi.fn().mockResolvedValue({ id: "counter-1" });
    const update = vi.fn().mockResolvedValue({ lastSeq: 8 });
    const create = vi.fn();
    const tx = makeTx({ findUnique, update, create });

    const result = await allocateTranscriptNumber(tx, params);

    expect(result).toBe("TRN-2026-000008");
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { lastSeq: { increment: 1 } } })
    );
    expect(create).not.toHaveBeenCalled();
  });

  it("creates a seeded row (lastSeq=1) on the first allocation for a scope", async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const update = vi.fn();
    const create = vi.fn().mockResolvedValue({ lastSeq: 1 });
    const tx = makeTx({ findUnique, update, create });

    const result = await allocateTranscriptNumber(tx, params);

    expect(result).toBe("TRN-2026-000001");
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { organizationId: "org-1", year: 2026, transcriptType: "FULL", lastSeq: 1 },
      })
    );
    expect(update).not.toHaveBeenCalled();
  });
});
