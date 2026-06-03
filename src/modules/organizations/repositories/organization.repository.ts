import { getDb } from "@/server/db";
import { buildSkipTake, buildPaginationMeta } from "@/shared/lib/pagination";
import type { PaginatedResult } from "@/shared/types/common";
import type { Organization } from "@prisma/client";

export interface ListOrganizationsParams {
  page: number;
  pageSize: number;
  search?: string;
  status?: string;
}

export async function listOrganizations(
  params: ListOrganizationsParams
): Promise<PaginatedResult<Organization>> {
  const db = await getDb();
  const { skip, take } = buildSkipTake(params);

  const where = {
    deletedAt: null,
    ...(params.search && {
      OR: [
        { name: { contains: params.search } },
        { slug: { contains: params.search } },
        { email: { contains: params.search } },
      ],
    }),
    ...(params.status && { status: params.status }),
  };

  const [data, total] = await Promise.all([
    db.organization.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }),
    db.organization.count({ where }),
  ]);

  return buildPaginationMeta(data, total, params);
}

export async function findOrganizationById(id: string): Promise<Organization | null> {
  const db = await getDb();
  return db.organization.findFirst({ where: { id, deletedAt: null } });
}

export async function findOrganizationBySlug(slug: string): Promise<Organization | null> {
  const db = await getDb();
  return db.organization.findFirst({ where: { slug, deletedAt: null } });
}

export async function createOrganization(data: {
  name: string;
  slug: string;
  email?: string;
  phone?: string;
  address?: string;
  timezone: string;
  locale: string;
}): Promise<Organization> {
  const db = await getDb();
  return db.organization.create({ data });
}

export async function updateOrganization(
  id: string,
  data: Partial<{
    name: string;
    email: string | null;
    phone: string | null;
    address: string | null;
    logoUrl: string | null;
    timezone: string;
    locale: string;
    status: string;
  }>
): Promise<Organization> {
  const db = await getDb();
  return db.organization.update({ where: { id }, data });
}

export async function softDeleteOrganization(id: string): Promise<Organization> {
  const db = await getDb();
  return db.organization.update({ where: { id }, data: { deletedAt: new Date() } });
}

export async function countOrganizations(): Promise<number> {
  const db = await getDb();
  return db.organization.count({ where: { deletedAt: null } });
}

export async function countOrganizationsByStatus(): Promise<Record<string, number>> {
  const db = await getDb();
  const rows = await db.organization.groupBy({
    by: ["status"],
    where: { deletedAt: null },
    _count: { _all: true },
  });
  return Object.fromEntries(rows.map((r) => [r.status, r._count._all]));
}
