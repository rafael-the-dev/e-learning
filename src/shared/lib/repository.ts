import type {
  PaginatedResult,
  PaginationParams,
  SortParams,
} from "@/shared/types/common";

// =============================================================================
// REPOSITORY PATTERN
// Repositories are the only layer that talks to Prisma.
// Every repository method is scoped to a single organizationId (tenant).
// Pages and Server Actions never import Prisma directly.
// =============================================================================

export interface FindManyParams extends PaginationParams {
  organizationId: string;
  search?: string;
  sort?: SortParams;
  filters?: Record<string, unknown>;
  includeDeleted?: boolean;
}

export interface Repository<TEntity, TCreateInput, TUpdateInput> {
  findById(id: string, organizationId: string): Promise<TEntity | null>;
  findMany(params: FindManyParams): Promise<PaginatedResult<TEntity>>;
  create(data: TCreateInput): Promise<TEntity>;
  update(id: string, organizationId: string, data: TUpdateInput): Promise<TEntity>;
  softDelete(id: string, organizationId: string): Promise<void>;
}

export function buildSoftDeleteFilter() {
  return { deletedAt: null };
}

export function buildSearchFilter(
  search: string | undefined,
  fields: string[]
): object {
  if (!search) return {};
  return {
    OR: fields.map((field) => ({
      [field]: { contains: search },
    })),
  };
}
