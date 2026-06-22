"use client";

import { History } from "lucide-react";
import { Badge } from "@/shared/components/ui/badge";
import { EmptyState } from "@/shared/components/layout/empty-state";
import type { RoleAuditEntry } from "@/modules/roles/types";
import type { PaginatedResult } from "@/shared/types/common";

interface Props {
  auditTrail: PaginatedResult<RoleAuditEntry>;
}

const ACTION_LABELS: Record<string, string> = {
  "role.created": "Role criada",
  "role.updated": "Role atualizada",
  "role.duplicated": "Role duplicada",
  "role.archived": "Role arquivada",
  "role.restored": "Role restaurada",
  "role.permissions.updated": "Permissões atualizadas",
  "role.user.assigned": "Utilizador atribuído",
  "role.user.removed": "Utilizador removido",
};

function getActionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

function PermissionDiff({ added, removed }: { added: string[]; removed: string[] }) {
  if (added.length === 0 && removed.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {added.map((id) => (
        <Badge key={`add-${id}`} variant="success" className="text-xs">
          + {id}
        </Badge>
      ))}
      {removed.map((id) => (
        <Badge key={`rem-${id}`} variant="destructive" className="text-xs">
          − {id}
        </Badge>
      ))}
    </div>
  );
}

export function RoleAuditTrail({ auditTrail }: Props) {
  if (auditTrail.data.length === 0) {
    return (
      <EmptyState
        icon={<History className="size-8" />}
        title="Sem eventos de auditoria"
        description="Ainda não há eventos registados para esta role."
      />
    );
  }

  return (
    <div className="space-y-3">
      {auditTrail.data.map((entry) => {
        const newValues = entry.newValues as { added?: string[]; removed?: string[] } | null;
        return (
          <div key={entry.id} className="rounded-md border p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Badge variant="outline">{getActionLabel(entry.action)}</Badge>
                <span className="text-sm text-muted-foreground">
                  {entry.actorName ?? "Sistema"}
                </span>
              </div>
              <span className="text-xs text-muted-foreground shrink-0">
                {entry.createdAt.toLocaleString("pt-PT")}
              </span>
            </div>
            {entry.action === "role.permissions.updated" && newValues && (
              <PermissionDiff added={newValues.added ?? []} removed={newValues.removed ?? []} />
            )}
          </div>
        );
      })}
    </div>
  );
}
