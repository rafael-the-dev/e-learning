import { getDb } from "@/server/db";
import { buildSkipTake, buildPaginationMeta } from "@/shared/lib/pagination";
import type { PaginatedResult, PaginationParams } from "@/shared/types/common";
import type { StudentWallet, WalletTransaction, CreditApplication } from "@/modules/wallets/types";

type DecimalLike = { toNumber(): number };

// =============================================================================
// WALLET REPOSITORY — all queries scoped to organizationId
// =============================================================================

export interface ListWalletsParams extends PaginationParams {
  search?: string;
  status?: string;
}

export interface ListTransactionsParams extends PaginationParams {
  type?: string;
}

const walletSelect = {
  id: true,
  organizationId: true,
  studentId: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  createdBy: true,
  student: { select: { id: true, firstName: true, lastName: true, code: true } },
  transactions: { select: { amount: true } },
} as const;

type WalletRow = {
  id: string;
  organizationId: string;
  studentId: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  student: { id: string; firstName: string; lastName: string; code: string | null } | null;
  transactions: { amount: DecimalLike }[];
};

function mapToWallet(row: WalletRow): StudentWallet {
  const balance = row.transactions.reduce((sum, t) => sum + t.amount.toNumber(), 0);
  return {
    id: row.id,
    organizationId: row.organizationId,
    studentId: row.studentId,
    status: row.status as StudentWallet["status"],
    balance,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    studentName: row.student ? `${row.student.firstName} ${row.student.lastName}` : null,
    studentCode: row.student?.code ?? null,
  };
}

type TransactionRow = {
  id: string;
  organizationId: string;
  studentWalletId: string;
  type: string;
  amount: DecimalLike;
  referenceType: string | null;
  referenceId: string | null;
  description: string | null;
  createdAt: Date;
  createdBy: string | null;
};

function mapToTransaction(row: TransactionRow): WalletTransaction {
  return {
    id: row.id,
    organizationId: row.organizationId,
    studentWalletId: row.studentWalletId,
    type: row.type as WalletTransaction["type"],
    amount: row.amount.toNumber(),
    referenceType: row.referenceType,
    referenceId: row.referenceId,
    description: row.description,
    createdAt: row.createdAt,
    createdBy: row.createdBy,
  };
}

const transactionSelect = {
  id: true,
  organizationId: true,
  studentWalletId: true,
  type: true,
  amount: true,
  referenceType: true,
  referenceId: true,
  description: true,
  createdAt: true,
  createdBy: true,
} as const;

export async function findWalletsByOrganization(
  organizationId: string,
  params: ListWalletsParams
): Promise<PaginatedResult<StudentWallet>> {
  const db = await getDb();
  const { skip, take } = buildSkipTake(params);

  const where = {
    organizationId,
    ...(params.status && { status: params.status }),
    ...(params.search && {
      OR: [
        { student: { firstName: { contains: params.search } } },
        { student: { lastName: { contains: params.search } } },
        { student: { code: { contains: params.search } } },
      ],
    }),
  };

  const [rows, total] = await Promise.all([
    db.studentWallet.findMany({
      where,
      select: walletSelect,
      skip,
      take,
      orderBy: { createdAt: "desc" },
    }),
    db.studentWallet.count({ where }),
  ]);

  return buildPaginationMeta(rows.map(mapToWallet), total, params);
}

export async function findWalletById(
  id: string,
  organizationId: string
): Promise<StudentWallet | null> {
  const db = await getDb();
  const row = await db.studentWallet.findFirst({
    where: { id, organizationId },
    select: walletSelect,
  });
  return row ? mapToWallet(row) : null;
}

export async function findWalletByStudentId(
  studentId: string,
  organizationId: string
): Promise<StudentWallet | null> {
  const db = await getDb();
  const row = await db.studentWallet.findFirst({
    where: { studentId, organizationId },
    select: walletSelect,
  });
  return row ? mapToWallet(row) : null;
}

export async function getWalletBalance(walletId: string): Promise<number> {
  const db = await getDb();
  const result = await db.studentWalletTransaction.aggregate({
    where: { studentWalletId: walletId },
    _sum: { amount: true },
  });
  const raw = result._sum.amount;
  return raw ? (raw as unknown as DecimalLike).toNumber() : 0;
}

export async function findTransactionsByWallet(
  walletId: string,
  organizationId: string,
  params: ListTransactionsParams
): Promise<PaginatedResult<WalletTransaction>> {
  const db = await getDb();
  const { skip, take } = buildSkipTake(params);

  const where = {
    studentWalletId: walletId,
    organizationId,
    ...(params.type && { type: params.type }),
  };

  const [rows, total] = await Promise.all([
    db.studentWalletTransaction.findMany({
      where,
      select: transactionSelect,
      skip,
      take,
      orderBy: { createdAt: "desc" },
    }),
    db.studentWalletTransaction.count({ where }),
  ]);

  return buildPaginationMeta(rows.map(mapToTransaction), total, params);
}

export async function findRecentTransactions(
  walletId: string,
  organizationId: string,
  limit = 5
): Promise<WalletTransaction[]> {
  const db = await getDb();
  const rows = await db.studentWalletTransaction.findMany({
    where: { studentWalletId: walletId, organizationId },
    select: transactionSelect,
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map(mapToTransaction);
}

type CreditApplicationRow = {
  id: string;
  organizationId: string;
  studentId: string;
  studentWalletId: string;
  invoiceId: string;
  amount: DecimalLike;
  notes: string | null;
  createdAt: Date;
  createdBy: string | null;
};

function mapToCreditApplication(row: CreditApplicationRow): CreditApplication {
  return {
    id: row.id,
    organizationId: row.organizationId,
    studentId: row.studentId,
    studentWalletId: row.studentWalletId,
    invoiceId: row.invoiceId,
    amount: row.amount.toNumber(),
    notes: row.notes,
    createdAt: row.createdAt,
    createdBy: row.createdBy,
  };
}

export async function findCreditApplicationsByInvoice(
  invoiceId: string,
  organizationId: string
): Promise<CreditApplication[]> {
  const db = await getDb();
  const rows = await db.creditApplication.findMany({
    where: { invoiceId, organizationId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(mapToCreditApplication);
}

/**
 * Returns wallet balances keyed by studentId for all active wallets belonging
 * to the given students. Students with no active wallet are omitted from the result.
 */
export async function findWalletBalancesByStudentIds(
  organizationId: string,
  studentIds: string[]
): Promise<Record<string, number>> {
  if (studentIds.length === 0) return {};
  const db = await getDb();

  const wallets = await db.studentWallet.findMany({
    where: { organizationId, studentId: { in: studentIds }, status: "ACTIVE" },
    select: { id: true, studentId: true },
  });
  if (wallets.length === 0) return {};

  const walletIds = wallets.map((w) => w.id);
  const sums = await db.studentWalletTransaction.groupBy({
    by: ["studentWalletId"],
    where: { studentWalletId: { in: walletIds } },
    _sum: { amount: true },
  });

  const balanceByWalletId: Record<string, number> = {};
  for (const s of sums) {
    balanceByWalletId[s.studentWalletId] = (s._sum.amount as DecimalLike | null)?.toNumber() ?? 0;
  }

  const result: Record<string, number> = {};
  for (const w of wallets) {
    result[w.studentId] = balanceByWalletId[w.id] ?? 0;
  }
  return result;
}
