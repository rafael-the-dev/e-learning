import { getDb } from "@/server/db";
import type { ImportJobEventEntry } from "@/modules/import-jobs/types";

// =============================================================================
// IMPORT JOB HISTORY SERVICE
// Reads the generic AuditLog table scoped to entity="ImportJob". Mirrors
// role-audit.service.ts's getRoleAuditTrail — actor names are resolved via a
// separate batch lookup, not AuditLog's own actor relation, for consistency
// with that existing precedent.
// =============================================================================

export async function getImportJobEventsTimeline(
  organizationId: string,
  jobId: string
): Promise<ImportJobEventEntry[]> {
  const db = await getDb();
  const rows = await db.auditLog.findMany({
    where: { organizationId, entity: "ImportJob", entityId: jobId },
    select: { id: true, action: true, actorId: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const actorIds = [...new Set(rows.map((r) => r.actorId).filter((id): id is string => !!id))];
  const actors = actorIds.length
    ? await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })
    : [];
  const actorNameById = new Map(actors.map((a) => [a.id, a.name]));

  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    actorId: row.actorId,
    actorName: row.actorId ? actorNameById.get(row.actorId) ?? null : null,
    createdAt: row.createdAt,
  }));
}
