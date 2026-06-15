import type { PrismaClient } from "@prisma/client";

/**
 * The Prisma interactive transaction client type.
 * Identical to PrismaClient but without meta-operations that cannot run
 * inside a transaction ($connect, $disconnect, $on, $transaction, $use, $extends).
 */
export type TxClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

type DecimalLike = { toNumber(): number };

export interface LockedWalletBalance {
  walletId: string;
  balance: number;
}

/**
 * Acquires an exclusive update lock on the StudentWallet row and returns the
 * authoritative ledger balance (SUM of all StudentWalletTransaction.amount).
 *
 * ─── Why this exists ────────────────────────────────────────────────────────
 * SQL Server's default READ COMMITTED isolation allows two concurrent
 * transactions to both read the same SUM and both pass a "balance ≥ debit"
 * check, resulting in a combined debit that exceeds the available balance
 * (the classic double-spend / wallet-going-negative problem).
 *
 * ─── How it prevents double-spend ───────────────────────────────────────────
 * 1. Transaction A enters $transaction, calls lockAndGetWalletBalance.
 *    SQL Server grants UPDLOCK on the wallet row to A.
 *
 * 2. Transaction B enters $transaction, calls lockAndGetWalletBalance for the
 *    same wallet.  SQL Server BLOCKS B — it cannot acquire UPDLOCK while A
 *    holds it.
 *
 * 3. A reads SUM(transactions), validates debit ≤ balance, inserts the debit
 *    row, then commits.  UPDLOCK is released automatically.
 *
 * 4. B unblocks, acquires UPDLOCK, reads SUM again (now includes A's debit),
 *    and either succeeds (balance still sufficient) or throws
 *    BusinessRuleError (balance now insufficient).
 *
 * ─── Contract ────────────────────────────────────────────────────────────────
 * • MUST be called inside a Prisma $transaction.
 * • Every command that creates a NEGATIVE wallet transaction (CREDIT_APPLIED,
 *   REFUND, negative ADJUSTMENT) MUST call this function before inserting.
 * • Commands that only add credit (DEPOSIT, OVERPAYMENT, PROMOTIONAL_CREDIT)
 *   do NOT need to call this — they never risk negative balance.
 *
 * ─── Lock hints used ─────────────────────────────────────────────────────────
 * UPDLOCK  — intent-to-update lock; blocks concurrent UPDLOCK / XLOCK
 *             acquisitions on the same row without blocking shared reads.
 * ROWLOCK  — forces row-level granularity; prevents escalation to page or
 *             table locks that would serialise unrelated wallet rows.
 *
 * @param tx             Prisma interactive transaction client
 * @param walletId       StudentWallet.id to lock
 * @param organizationId Must match the wallet's organisation (tenant safety)
 * @throws Error if the wallet does not exist in this organisation
 */
export async function lockAndGetWalletBalance(
  tx: TxClient,
  walletId: string,
  organizationId: string
): Promise<LockedWalletBalance> {
  // Acquire UPDLOCK on the wallet row BEFORE reading the balance.
  // Any concurrent transaction that calls this function for the same walletId
  // will block here until the current transaction commits or rolls back.
  const locked = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM student_wallets WITH (UPDLOCK, ROWLOCK)
    WHERE id = ${walletId} AND organizationId = ${organizationId}
  `;

  if (locked.length === 0) {
    // validate() in the calling command should have already confirmed
    // the wallet exists and belongs to this org.  This branch protects
    // against a TOCTOU window where the wallet was deleted between
    // validate() and execute().
    throw new Error(
      `Carteira ${walletId} não encontrada nesta organização`
    );
  }

  // Read authoritative balance AFTER holding the lock.
  // No concurrent debit transaction can proceed past its own lockAndGetWalletBalance
  // call until the current transaction commits, so this aggregate is stable.
  const result = await tx.studentWalletTransaction.aggregate({
    where: { studentWalletId: walletId },
    _sum: { amount: true },
  });

  const balance = (result._sum.amount as DecimalLike | null)?.toNumber() ?? 0;
  return { walletId, balance };
}
