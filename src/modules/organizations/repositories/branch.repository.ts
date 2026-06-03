import { getDb } from "@/server/db";
import { buildSkipTake, buildPaginationMeta } from "@/shared/lib/pagination";
import type { PaginatedResult } from "@/shared/types/common";
import type { Branch } from "@prisma/client";

export interface ListBranchesParams {
  page: number;
  pageSize: number;
  search?: string;
  status?: string;
}

export async function listBranches(
  organizationId: string,
  params: ListBranchesParams
): Promise<PaginatedResult<Branch>> {
  const db = await getDb();
  const { skip, take } = buildSkipTake(params);

  const where = {
    organizationId,
    deletedAt: null,
    ...(params.search && {
      OR: [
        { name: { contains: params.search } },
        { code: { contains: params.search } },
      ],
    }),
    ...(params.status && { status: params.status }),
  };

  const [data, total] = await Promise.all([
    db.branch.findMany({ where, skip, take, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] }),
    db.branch.count({ where }),
  ]);

  return buildPaginationMeta(data, total, params);
}

export async function findBranchById(
  organizationId: string,
  id: string
): Promise<Branch | null> {
  const db = await getDb();
  return db.branch.findFirst({ where: { id, organizationId, deletedAt: null } });
}

export async function createBranch(data: {
  organizationId: string;
  name: string;
  code?: string;
  address?: string;
  phone?: string;
  email?: string;
  isDefault: boolean;
}): Promise<Branch> {
  const db = await getDb();

  if (data.isDefault) {
    await db.branch.updateMany({
      where: { organizationId: data.organizationId, deletedAt: null },
      data: { isDefault: false },
    });
  }

  return db.branch.create({ data });
}

export async function updateBranch(
  organizationId: string,
  id: string,
  data: Partial<{
    name: string;
    code: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
    isDefault: boolean;
    status: string;
  }>
): Promise<Branch> {
  const db = await getDb();

  if (data.isDefault === true) {
    await db.branch.updateMany({
      where: { organizationId, deletedAt: null, NOT: { id } },
      data: { isDefault: false },
    });
  }

  return db.branch.update({ where: { id }, data });
}

export async function softDeleteBranch(
  organizationId: string,
  id: string
): Promise<Branch> {
  const db = await getDb();
  return db.branch.update({
    where: { id },
    data: { deletedAt: new Date(), status: "INACTIVE" },
  });
}

export async function countBranches(organizationId: string): Promise<number> {
  const db = await getDb();
  return db.branch.count({ where: { organizationId, deletedAt: null } });
}
