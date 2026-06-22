import { getDb } from "@/server/db";
import { buildSkipTake, buildPaginationMeta } from "@/shared/lib/pagination";
import type { PaginatedResult, PaginationParams } from "@/shared/types/common";
import type { RoleAuditEntry } from "@/modules/roles/types";

// =============================================================================
// ROLE AUDIT SERVICE
// Reads the generic AuditLog table scoped to entity="Role". AuditLog.actorId
// has no FK relation, so actor names are resolved via a separate batch lookup.
// =============================================================================

function parseJson(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function getRoleAuditTrail(
  organizationId: string,
  roleId: string,
  params: PaginationParams
): Promise<PaginatedResult<RoleAuditEntry>> {
  const db = await getDb();
  const { skip, take } = buildSkipTake(params);

  const where = { organizationId, entity: "Role", entityId: roleId };
  const [rows, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      select: { id: true, action: true, actorId: true, oldValues: true, newValues: true, createdAt: true },
      skip,
      take,
      orderBy: { createdAt: "desc" },
    }),
    db.auditLog.count({ where }),
  ]);

  const actorIds = [...new Set(rows.map((r) => r.actorId).filter((id): id is string => !!id))];
  const actors = actorIds.length
    ? await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })
    : [];
  const actorNameById = new Map(actors.map((a) => [a.id, a.name]));

  const data: RoleAuditEntry[] = rows.map((row) => ({
    id: row.id,
    action: row.action,
    actorId: row.actorId,
    actorName: row.actorId ? actorNameById.get(row.actorId) ?? null : null,
    oldValues: parseJson(row.oldValues),
    newValues: parseJson(row.newValues),
    createdAt: row.createdAt,
  }));

  return buildPaginationMeta(data, total, params);
}
