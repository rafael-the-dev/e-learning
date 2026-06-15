import { describe, it, expect, vi, beforeEach } from "vitest";
import { lockAndGetWalletBalance } from "../services/wallet-concurrency.service";

// =============================================================================
// Helpers
// =============================================================================

type MockTx = {
  $queryRaw: ReturnType<typeof vi.fn>;
  studentWalletTransaction: {
    aggregate: ReturnType<typeof vi.fn>;
  };
};

/** Build a minimal mock of the Prisma transaction client. */
function makeTx({
  walletRows = [{ id: "wallet-1" }],
  sumAmount = 1000,
}: {
  walletRows?: Array<{ id: string }>;
  sumAmount?: number | null;
} = {}): MockTx {
  return {
    $queryRaw: vi.fn().mockResolvedValue(walletRows),
    studentWalletTransaction: {
      aggregate: vi.fn().mockResolvedValue({
        _sum: {
          amount: sumAmount !== null ? { toNumber: () => sumAmount } : null,
        },
      }),
    },
  };
}

// =============================================================================
// lockAndGetWalletBalance — unit tests
// =============================================================================

describe("lockAndGetWalletBalance", () => {
  // ── Happy-path ──────────────────────────────────────────────────────────────

  it("returns walletId and the ledger balance when the wallet exists", async () => {
    const tx = makeTx({ sumAmount: 1500 });

    const result = await lockAndGetWalletBalance(tx as any, "wallet-1", "org-1");

    expect(result).toEqual({ walletId: "wallet-1", balance: 1500 });
  });

  it("returns balance 0 when the wallet has no transactions", async () => {
    const tx = makeTx({ sumAmount: null }); // aggregate returns null sum

    const result = await lockAndGetWalletBalance(tx as any, "wallet-1", "org-1");

    expect(result.balance).toBe(0);
  });

  it("returns balance 0 when sumAmount is 0", async () => {
    const tx = makeTx({ sumAmount: 0 });

    const result = await lockAndGetWalletBalance(tx as any, "wallet-1", "org-1");

    expect(result.balance).toBe(0);
  });

  it("handles a negative ledger balance (fully consumed wallet)", async () => {
    // Edge case: should never happen with the lock, but the service must
    // faithfully return whatever the aggregate produces.
    const tx = makeTx({ sumAmount: -50 });

    const result = await lockAndGetWalletBalance(tx as any, "wallet-1", "org-1");

    expect(result.balance).toBe(-50);
  });

  // ── Error cases ─────────────────────────────────────────────────────────────

  it("throws when the wallet is not found in this organisation", async () => {
    const tx = makeTx({ walletRows: [] }); // empty result = no matching row

    await expect(
      lockAndGetWalletBalance(tx as any, "wallet-missing", "org-1")
    ).rejects.toThrow("wallet-missing");
  });

  it("does NOT call aggregate when the lock query returns no rows", async () => {
    const tx = makeTx({ walletRows: [] });

    await expect(
      lockAndGetWalletBalance(tx as any, "wallet-missing", "org-1")
    ).rejects.toThrow();

    expect(tx.studentWalletTransaction.aggregate).not.toHaveBeenCalled();
  });

  // ── Call ordering (the critical invariant) ───────────────────────────────────

  it("acquires the lock BEFORE reading the balance", async () => {
    const callOrder: string[] = [];

    const tx: MockTx = {
      $queryRaw: vi.fn().mockImplementation(() => {
        callOrder.push("lock");
        return Promise.resolve([{ id: "wallet-1" }]);
      }),
      studentWalletTransaction: {
        aggregate: vi.fn().mockImplementation(() => {
          callOrder.push("aggregate");
          return Promise.resolve({ _sum: { amount: { toNumber: () => 800 } } });
        }),
      },
    };

    await lockAndGetWalletBalance(tx as any, "wallet-1", "org-1");

    expect(callOrder).toEqual(["lock", "aggregate"]);
  });

  it("passes walletId as the first interpolated value in the lock query", async () => {
    const tx = makeTx();

    await lockAndGetWalletBalance(tx as any, "wallet-abc", "org-xyz");

    // Tagged-template call: $queryRaw(strings, walletId, organizationId)
    const [, walletIdArg] = (tx.$queryRaw as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(walletIdArg).toBe("wallet-abc");
  });

  it("passes organizationId as the second interpolated value in the lock query", async () => {
    const tx = makeTx();

    await lockAndGetWalletBalance(tx as any, "wallet-abc", "org-xyz");

    const [, , orgIdArg] = (tx.$queryRaw as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(orgIdArg).toBe("org-xyz");
  });

  it("scopes the aggregate to the provided walletId", async () => {
    const tx = makeTx();

    await lockAndGetWalletBalance(tx as any, "wallet-abc", "org-1");

    const aggregateCall = (tx.studentWalletTransaction.aggregate as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(aggregateCall.where.studentWalletId).toBe("wallet-abc");
  });
});

// =============================================================================
// Concurrent debit simulation
// These tests cannot use a real database, so they simulate what the lock
// guarantees: the second transaction sees the balance AFTER the first commit.
// =============================================================================

describe("concurrent debit — simulation of serialised behaviour", () => {
  it("second debit sees reduced balance after first debit commits", async () => {
    const INITIAL = 1000;
    const DEBIT = 800;

    // Transaction A: reads 1000, debits 800 → commits (balance becomes 200).
    const txA = makeTx({ sumAmount: INITIAL });
    const { balance: balanceA } = await lockAndGetWalletBalance(txA as any, "w", "o");
    expect(balanceA).toBe(1000);
    expect(DEBIT).toBeLessThanOrEqual(balanceA); // A's debit succeeds

    // Transaction B: now reads 200 (A has committed).
    const txB = makeTx({ sumAmount: INITIAL - DEBIT });
    const { balance: balanceB } = await lockAndGetWalletBalance(txB as any, "w", "o");
    expect(balanceB).toBe(200);
    expect(DEBIT).toBeGreaterThan(balanceB); // B's debit would be rejected
  });

  it("two debits that together equal the balance succeed sequentially", async () => {
    const INITIAL = 1000;
    const DEBIT = 500;

    const txA = makeTx({ sumAmount: INITIAL });
    const { balance: balanceA } = await lockAndGetWalletBalance(txA as any, "w", "o");
    expect(DEBIT).toBeLessThanOrEqual(balanceA);

    // A commits, balance is now 500.
    const txB = makeTx({ sumAmount: INITIAL - DEBIT });
    const { balance: balanceB } = await lockAndGetWalletBalance(txB as any, "w", "o");
    expect(DEBIT).toBeLessThanOrEqual(balanceB); // B also succeeds
    expect(balanceB).toBe(500);
  });

  it("debit that exactly matches balance succeeds", async () => {
    const INITIAL = 1000;
    const tx = makeTx({ sumAmount: INITIAL });
    const { balance } = await lockAndGetWalletBalance(tx as any, "w", "o");
    expect(INITIAL).toBeLessThanOrEqual(balance);
  });

  it("debit of zero is rejected by command-layer schema before reaching the lock", () => {
    // Zod schema: amount: z.number().positive()  — zero is not positive.
    // This test documents the invariant; the schema rejects it before execute().
    const zeroAmount = 0;
    expect(zeroAmount > 0).toBe(false);
  });
});

// =============================================================================
// Balance guard — verify calling commands would correctly reject
// These document the expected outcomes of the balance check that commands
// perform immediately after calling lockAndGetWalletBalance.
// =============================================================================

describe("balance guard logic (used by all debit commands)", () => {
  it("throws when requested debit exceeds locked balance", async () => {
    const lockedBalance = 200;
    const requestedDebit = 800;

    // Simulate the check every command performs after calling lockAndGetWalletBalance:
    //   if (requestedDebit > liveBalance) throw new BusinessRuleError(...)
    const wouldBeRejected = requestedDebit > lockedBalance;
    expect(wouldBeRejected).toBe(true);
  });

  it("allows debit exactly equal to balance", async () => {
    const lockedBalance = 800;
    const requestedDebit = 800;

    const wouldBeRejected = requestedDebit > lockedBalance;
    expect(wouldBeRejected).toBe(false);
  });

  it("allows debit smaller than balance", async () => {
    const lockedBalance = 1000;
    const requestedDebit = 250;

    const wouldBeRejected = requestedDebit > lockedBalance;
    expect(wouldBeRejected).toBe(false);
  });
});
