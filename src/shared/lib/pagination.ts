import type { PaginatedResult, PaginationParams } from "@/shared/types/common";

type LoosePaginationParams = { page?: number; pageSize?: number };

export function buildPaginationMeta<T>(
  data: T[],
  total: number,
  params: PaginationParams | LoosePaginationParams
): PaginatedResult<T> {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE;
  const totalPages = Math.ceil(total / pageSize);
  return {
    data,
    total,
    page,
    pageSize,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };
}

export function buildSkipTake(params: PaginationParams | LoosePaginationParams) {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE;
  return {
    skip: (page - 1) * pageSize,
    take: pageSize,
  };
}

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export function normalizePaginationParams(
  page?: number | string,
  pageSize?: number | string
): PaginationParams {
  const p = Math.max(1, Number(page) || 1);
  const ps = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(pageSize) || DEFAULT_PAGE_SIZE));
  return { page: p, pageSize: ps };
}
