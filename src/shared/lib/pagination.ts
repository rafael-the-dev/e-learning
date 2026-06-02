import type { PaginatedResult, PaginationParams } from "@/shared/types/common";

export function buildPaginationMeta<T>(
  data: T[],
  total: number,
  params: PaginationParams
): PaginatedResult<T> {
  const totalPages = Math.ceil(total / params.pageSize);
  return {
    data,
    total,
    page: params.page,
    pageSize: params.pageSize,
    totalPages,
    hasNextPage: params.page < totalPages,
    hasPreviousPage: params.page > 1,
  };
}

export function buildSkipTake(params: PaginationParams) {
  return {
    skip: (params.page - 1) * params.pageSize,
    take: params.pageSize,
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
