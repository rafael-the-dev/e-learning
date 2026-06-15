/**
 * Wallet Concurrency — Integration Test Script
 * =============================================
 * Proves that lockAndGetWalletBalance prevents double-spend under real
 * SQL Server concurrent transactions.
 *
 * Prerequisites
 * -------------
 * 1. Set DATABASE_URL to a live SQL Server connection string.
 * 2. Set TEST_ORG_ID to an existing Organisation.id in that database.
 * 3. Set TEST_STUDENT_ID to an existing Student.id in that organisation.
 *    (The student must NOT already have a wallet — the script creates one.)
 *
 * Run
 * ---
 *   npx tsx src/modules/wallets/__tests__/wallet-concurrency.integration.ts
 *
 * What it tests
 * -------------
 * Scenario A — two concurrent 800-credit debits on a 1 000-credit wallet:
 *   Expected: exactly ONE succeeds, final balance ≥ 0, total debited ≤ 1 000.
 *
 * Scenario B — two concurrent 500-credit debits on a 1 000-credit wallet:
 *   Expected: BOTH succeed, final balance = 0.
 *
 * Scenario C — debit larger than balance:
 *   Expected: rejected immediately, balance unchanged.
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaMssql } from "@prisma/adapter-mssql";
import { lockAndGetWalletBalance } from "../services/wallet-concurrency.service";

// =============================================================================
// Setup helpers
// =============================================================================

async function createClient(): Promise<PrismaClient> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const adapter = new PrismaMssql(url.trim().replace(/^["']|["']$/g, ""));
  return new PrismaClient({ adapter });
}

async function setupWallet(
  prisma: PrismaClient,
  orgId: string,
  studentId: string,
  initialDeposit: number
): Promise<string> {
  // Remove any existing test wallet for this student (idempotent re-runs).
  const existing = await prisma.studentWallet.findFirst({
    where: { organizationId: orgId, studentId },
    select: { id: true },
  });
  if (existing) {
    await prisma.studentWalletTransaction.deleteMany({ where: { studentWalletId: existing.id } });
    await prisma.studentWallet.delete({ where: { id: existing.id } });
  }

  const wallet = await prisma.studentWallet.create({
    data: { organizationId: orgId, studentId, status: "ACTIVE", createdBy: "integration-test" },
    select: { id: true },
  });

  await prisma.studentWalletTransaction.create({
    data: {
      organizationId: orgId,
      studentWalletId: wallet.id,
      type: "DEPOSIT",
      amount: initialDeposit,
      description: `Integration test deposit — ${new Date().toISOString()}`,
      createdBy: "integration-test",
    },
  });

  return wallet.id;
}

async function teardownWallet(prisma: PrismaClient, walletId: string): Promise<void> {
  await prisma.studentWalletTransaction.deleteMany({ where: { studentWalletId: walletId } });
  await prisma.studentWallet.delete({ where: { id: walletId } });
}

async function readBalance(prisma: PrismaClient, walletId: string): Promise<number> {
  const result = await prisma.studentWalletTransaction.aggregate({
    where: { studentWalletId: walletId },
    _sum: { amount: true },
  });
  return Number(result._sum.amount ?? 0);
}

// =============================================================================
// Concurrent debit helper
// Returns { success, debited } — success=false means BusinessRuleError / lock
// serialised the transaction to see insufficient balance.
// =============================================================================

async function attemptDebit(
  prisma: PrismaClient,
  walletId: string,
  orgId: string,
  amount: number,
  label: string
): Promise<{ label: string; success: boolean; error?: string }> {
  try {
    await prisma.$transaction(async (tx) => {
      const { balance } = await lockAndGetWalletBalance(tx, walletId, orgId);
      if (amount > balance) {
        throw new Error(`Saldo insuficiente: disponível ${balance}, solicitado ${amount}`);
      }
      // Simulate processing time so that the two transactions genuinely overlap.
      await new Promise((r) => setTimeout(r, 30));
      await tx.studentWalletTransaction.create({
        data: {
          organizationId: orgId,
          studentWalletId: walletId,
          type: "CREDIT_APPLIED",
          amount: -amount,
          description: `Concurrent test debit — ${label}`,
          createdBy: "integration-test",
        },
      });
    });
    return { label, success: true };
  } catch (e) {
    return { label, success: false, error: (e as Error).message };
  }
}

// =============================================================================
// Assertions
// =============================================================================

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`  FAIL: ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`  PASS: ${message}`);
  }
}

// =============================================================================
// Scenarios
// =============================================================================

async function scenarioA(prisma: PrismaClient, orgId: string, studentId: string): Promise<void> {
  console.log("\n── Scenario A: two concurrent 800-credit debits on a 1 000-credit wallet ──");
  const INITIAL = 1000;
  const DEBIT = 800;

  const walletId = await setupWallet(prisma, orgId, studentId, INITIAL);
  try {
    const [resultA, resultB] = await Promise.all([
      attemptDebit(prisma, walletId, orgId, DEBIT, "A"),
      attemptDebit(prisma, walletId, orgId, DEBIT, "B"),
    ]);

    console.log(`  Transaction A: ${resultA.success ? "succeeded" : `failed (${resultA.error})`}`);
    console.log(`  Transaction B: ${resultB.success ? "succeeded" : `failed (${resultB.error})`}`);

    const successes = [resultA, resultB].filter((r) => r.success).length;
    const finalBalance = await readBalance(prisma, walletId);
    console.log(`  Final balance: ${finalBalance} (initial: ${INITIAL})`);

    assert(finalBalance >= 0, "balance must never go negative");
    assert(finalBalance >= INITIAL - DEBIT, `balance must be ≥ ${INITIAL - DEBIT} (only one debit allowed)`);
    assert(successes === 1, "exactly one of the two concurrent debits must succeed");
  } finally {
    await teardownWallet(prisma, walletId);
  }
}

async function scenarioB(prisma: PrismaClient, orgId: string, studentId: string): Promise<void> {
  console.log("\n── Scenario B: two concurrent 500-credit debits on a 1 000-credit wallet ──");
  const INITIAL = 1000;
  const DEBIT = 500;

  const walletId = await setupWallet(prisma, orgId, studentId, INITIAL);
  try {
    const [resultA, resultB] = await Promise.all([
      attemptDebit(prisma, walletId, orgId, DEBIT, "A"),
      attemptDebit(prisma, walletId, orgId, DEBIT, "B"),
    ]);

    console.log(`  Transaction A: ${resultA.success ? "succeeded" : `failed (${resultA.error})`}`);
    console.log(`  Transaction B: ${resultB.success ? "succeeded" : `failed (${resultB.error})`}`);

    const successes = [resultA, resultB].filter((r) => r.success).length;
    const finalBalance = await readBalance(prisma, walletId);
    console.log(`  Final balance: ${finalBalance} (initial: ${INITIAL})`);

    assert(finalBalance >= 0, "balance must never go negative");
    assert(successes === 2, "both 500-credit debits must succeed (total = 1 000 = initial)");
    assert(finalBalance === 0, "final balance must be exactly 0");
  } finally {
    await teardownWallet(prisma, walletId);
  }
}

async function scenarioC(prisma: PrismaClient, orgId: string, studentId: string): Promise<void> {
  console.log("\n── Scenario C: debit larger than balance is rejected ──");
  const INITIAL = 500;
  const DEBIT = 800;

  const walletId = await setupWallet(prisma, orgId, studentId, INITIAL);
  try {
    const result = await attemptDebit(prisma, walletId, orgId, DEBIT, "A");
    console.log(`  Transaction A: ${result.success ? "succeeded" : `failed (${result.error})`}`);

    const finalBalance = await readBalance(prisma, walletId);
    console.log(`  Final balance: ${finalBalance} (initial: ${INITIAL})`);

    assert(!result.success, "debit that exceeds balance must be rejected");
    assert(finalBalance === INITIAL, "balance must remain unchanged after rejection");
  } finally {
    await teardownWallet(prisma, walletId);
  }
}

// =============================================================================
// Entry point
// =============================================================================

async function main(): Promise<void> {
  const orgId = process.env.TEST_ORG_ID;
  const studentId = process.env.TEST_STUDENT_ID;

  if (!orgId || !studentId) {
    console.error(
      "Missing required environment variables:\n" +
        "  TEST_ORG_ID     — an existing Organisation.id\n" +
        "  TEST_STUDENT_ID — an existing Student.id in that organisation"
    );
    process.exit(1);
  }

  const prisma = await createClient();
  try {
    await scenarioA(prisma, orgId, studentId);
    await scenarioB(prisma, orgId, studentId);
    await scenarioC(prisma, orgId, studentId);

    const exitCode = process.exitCode ?? 0;
    console.log(
      exitCode === 0
        ? "\n✓ All scenarios passed — double-spend is impossible."
        : "\n✗ One or more scenarios FAILED — review output above."
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
