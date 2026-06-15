import { describe, it, expect, vi } from "vitest";
import {
  getNextInvoiceNumber,
  getNextPaymentNumber,
  getNextReceiptNumber,
} from "../services/financial-sequence.service";
import { BusinessRuleError } from "@/shared/lib/command";

// =============================================================================
// Helpers
// =============================================================================

function makeTx(nextVal: bigint | null, shouldThrow?: Error) {
  return {
    $queryRaw: vi.fn().mockImplementation(() => {
      if (shouldThrow) return Promise.reject(shouldThrow);
      if (nextVal === null) return Promise.resolve([]);
      return Promise.resolve([{ nextVal }]);
    }),
  };
}

// =============================================================================
// Format: correct prefix and zero-padding
// =============================================================================

describe("getNextInvoiceNumber", () => {
  it("formats sequence value 1 as FAT-000001", async () => {
    const tx = makeTx(BigInt(1));
    expect(await getNextInvoiceNumber(tx as any)).toBe("FAT-000001");
  });

  it("formats sequence value 999999 as FAT-999999", async () => {
    const tx = makeTx(BigInt(999999));
    expect(await getNextInvoiceNumber(tx as any)).toBe("FAT-999999");
  });

  it("formats sequence value beyond 6 digits without truncation", async () => {
    const tx = makeTx(BigInt(1000000));
    expect(await getNextInvoiceNumber(tx as any)).toBe("FAT-1000000");
  });

  it("wraps a DB error in BusinessRuleError", async () => {
    const tx = makeTx(null, new Error("Sequence does not exist"));
    await expect(getNextInvoiceNumber(tx as any)).rejects.toThrow(BusinessRuleError);
    await expect(getNextInvoiceNumber(tx as any)).rejects.toThrow("Falha ao gerar número de fatura");
  });

  it("re-throws BusinessRuleError unchanged", async () => {
    const original = new BusinessRuleError("custom");
    const tx = makeTx(null, original);
    await expect(getNextInvoiceNumber(tx as any)).rejects.toBe(original);
  });

  it("uses the correct sequence name (InvoiceSequence) — not PaymentSequence or ReceiptSequence", async () => {
    const tx = makeTx(BigInt(1));
    await getNextInvoiceNumber(tx as any);
    const sql: string = (tx.$queryRaw as ReturnType<typeof vi.fn>).mock.calls[0][0].join("");
    expect(sql).toContain("InvoiceSequence");
    expect(sql).not.toContain("PaymentSequence");
    expect(sql).not.toContain("ReceiptSequence");
  });
});

describe("getNextPaymentNumber", () => {
  it("formats sequence value 1 as PAG-000001", async () => {
    const tx = makeTx(BigInt(1));
    expect(await getNextPaymentNumber(tx as any)).toBe("PAG-000001");
  });

  it("formats sequence value 42 as PAG-000042", async () => {
    const tx = makeTx(BigInt(42));
    expect(await getNextPaymentNumber(tx as any)).toBe("PAG-000042");
  });

  it("wraps a DB error in BusinessRuleError", async () => {
    const tx = makeTx(null, new Error("connection lost"));
    await expect(getNextPaymentNumber(tx as any)).rejects.toThrow(BusinessRuleError);
    await expect(getNextPaymentNumber(tx as any)).rejects.toThrow("Falha ao gerar número de pagamento");
  });

  it("uses the correct sequence name (PaymentSequence)", async () => {
    const tx = makeTx(BigInt(1));
    await getNextPaymentNumber(tx as any);
    const sql: string = (tx.$queryRaw as ReturnType<typeof vi.fn>).mock.calls[0][0].join("");
    expect(sql).toContain("PaymentSequence");
    expect(sql).not.toContain("InvoiceSequence");
    expect(sql).not.toContain("ReceiptSequence");
  });
});

describe("getNextReceiptNumber", () => {
  it("formats sequence value 1 as REC-000001", async () => {
    const tx = makeTx(BigInt(1));
    expect(await getNextReceiptNumber(tx as any)).toBe("REC-000001");
  });

  it("formats sequence value 100000 as REC-100000", async () => {
    const tx = makeTx(BigInt(100000));
    expect(await getNextReceiptNumber(tx as any)).toBe("REC-100000");
  });

  it("wraps a DB error in BusinessRuleError", async () => {
    const tx = makeTx(null, new Error("timeout"));
    await expect(getNextReceiptNumber(tx as any)).rejects.toThrow(BusinessRuleError);
    await expect(getNextReceiptNumber(tx as any)).rejects.toThrow("Falha ao gerar número de recibo");
  });

  it("re-throws BusinessRuleError unchanged", async () => {
    const original = new BusinessRuleError("db error");
    const tx = makeTx(null, original);
    await expect(getNextReceiptNumber(tx as any)).rejects.toBe(original);
  });

  it("uses the correct sequence name (ReceiptSequence)", async () => {
    const tx = makeTx(BigInt(1));
    await getNextReceiptNumber(tx as any);
    const sql: string = (tx.$queryRaw as ReturnType<typeof vi.fn>).mock.calls[0][0].join("");
    expect(sql).toContain("ReceiptSequence");
    expect(sql).not.toContain("InvoiceSequence");
    expect(sql).not.toContain("PaymentSequence");
  });
});

// =============================================================================
// Sequence isolation — each function calls $queryRaw exactly once
// =============================================================================

describe("sequence isolation", () => {
  it("each number generator calls $queryRaw exactly once per invocation", async () => {
    const invTx = makeTx(BigInt(1));
    const payTx = makeTx(BigInt(2));
    const recTx = makeTx(BigInt(3));

    await getNextInvoiceNumber(invTx as any);
    await getNextPaymentNumber(payTx as any);
    await getNextReceiptNumber(recTx as any);

    expect((invTx.$queryRaw as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
    expect((payTx.$queryRaw as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
    expect((recTx.$queryRaw as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });

  it("consecutive calls to the same generator produce different numbers", async () => {
    const tx = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([{ nextVal: BigInt(10) }])
        .mockResolvedValueOnce([{ nextVal: BigInt(11) }]),
    };

    const first = await getNextInvoiceNumber(tx as any);
    const second = await getNextInvoiceNumber(tx as any);

    expect(first).toBe("FAT-000010");
    expect(second).toBe("FAT-000011");
    expect(first).not.toBe(second);
  });
});
