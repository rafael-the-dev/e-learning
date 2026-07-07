import { describe, it, expect, vi } from "vitest";
import {
  allocateCertificateNumber,
  formatCertificateNumber,
} from "@/modules/certificates/lib/certificate-number";
import type { PrismaClientOrTx } from "@/server/db";

// =============================================================================
// PHASE 0 — CERTIFICATE NUMBERING (tests 4–9)
// =============================================================================

describe("formatCertificateNumber (tests 4–5)", () => {
  it("formats CERT-2026-000001 (test 4)", () => {
    expect(formatCertificateNumber(2026, 1)).toBe("CERT-2026-000001");
  });

  it("zero-pads the sequence to 6 digits (test 5)", () => {
    expect(formatCertificateNumber(2026, 42)).toBe("CERT-2026-000042");
    expect(formatCertificateNumber(2026, 999999)).toBe("CERT-2026-999999");
  });

  it("does not clamp above 6 digits", () => {
    expect(formatCertificateNumber(2026, 1000000)).toBe("CERT-2026-1000000");
  });

  it("uses the given year verbatim", () => {
    expect(formatCertificateNumber(2030, 7)).toBe("CERT-2030-000007");
  });
});

describe("allocateCertificateNumber (tests 6–9)", () => {
  // Minimal mocked tx exposing only the certificateNumberCounter delegate used by
  // the allocator. Cast through unknown to satisfy PrismaClientOrTx.
  function makeTx(overrides: {
    findUnique: ReturnType<typeof vi.fn>;
    update?: ReturnType<typeof vi.fn>;
    create?: ReturnType<typeof vi.fn>;
  }): PrismaClientOrTx {
    return {
      certificateNumberCounter: {
        findUnique: overrides.findUnique,
        update: overrides.update ?? vi.fn(),
        create: overrides.create ?? vi.fn(),
      },
    } as unknown as PrismaClientOrTx;
  }

  it("increments the same org/year counter (test 6)", async () => {
    const findUnique = vi.fn().mockResolvedValue({ id: "counter-1" });
    const update = vi.fn().mockResolvedValue({ lastSeq: 8 });
    const create = vi.fn();
    const tx = makeTx({ findUnique, update, create });

    const result = await allocateCertificateNumber(tx, { organizationId: "org-1", year: 2026 });

    expect(result).toBe("CERT-2026-000008");
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { lastSeq: { increment: 1 } } })
    );
    expect(create).not.toHaveBeenCalled();
  });

  it("seeds a new row at lastSeq=1 on first allocation for a scope", async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const update = vi.fn();
    const create = vi.fn().mockResolvedValue({ lastSeq: 1 });
    const tx = makeTx({ findUnique, update, create });

    const result = await allocateCertificateNumber(tx, { organizationId: "org-1", year: 2026 });

    expect(result).toBe("CERT-2026-000001");
    expect(create).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();
  });

  it("keeps independent sequences per organization (test 7)", async () => {
    // org-A already has a counter at 4 → next is 5; org-B has none → seeds at 1.
    const txA = makeTx({
      findUnique: vi.fn().mockResolvedValue({ id: "counter-A" }),
      update: vi.fn().mockResolvedValue({ lastSeq: 5 }),
    });
    const txB = makeTx({
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ lastSeq: 1 }),
    });

    expect(await allocateCertificateNumber(txA, { organizationId: "org-A", year: 2026 })).toBe(
      "CERT-2026-000005"
    );
    expect(await allocateCertificateNumber(txB, { organizationId: "org-B", year: 2026 })).toBe(
      "CERT-2026-000001"
    );
  });

  it("surfaces a first-allocation unique conflict so the tx can roll back (test 8)", async () => {
    // Two concurrent first-allocations: the loser's create hits the unique index.
    const conflict = Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
    const findUnique = vi.fn().mockResolvedValue(null);
    const create = vi.fn().mockRejectedValue(conflict);
    const tx = makeTx({ findUnique, create });

    await expect(
      allocateCertificateNumber(tx, { organizationId: "org-1", year: 2026 })
    ).rejects.toMatchObject({ code: "P2002" });
    // The error is not swallowed — the caller's transaction rolls back (future retry seam).
  });

  it("uses a counter key WITHOUT certificateType (test 9)", async () => {
    const findUnique = vi.fn().mockResolvedValue({ id: "counter-1" });
    const update = vi.fn().mockResolvedValue({ lastSeq: 2 });
    const tx = makeTx({ findUnique, update });

    await allocateCertificateNumber(tx, { organizationId: "org-1", year: 2026 });

    // The composite where-key is exactly { organizationId, year } — no type dimension.
    const whereArg = findUnique.mock.calls[0][0].where.organizationId_year;
    expect(whereArg).toEqual({ organizationId: "org-1", year: 2026 });
    expect(Object.keys(whereArg)).toEqual(["organizationId", "year"]);
    expect(JSON.stringify(findUnique.mock.calls[0][0])).not.toMatch(/certificateType|type/i);
  });
});
