"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { StatCard } from "@/shared/components/layout/stat-card";
import { FeeDefinitionsTable } from "@/modules/billing/components/fee-definitions-table";
import { FeeDefinitionForm } from "@/modules/billing/components/fee-definition-form";
import type { FeeDefinition } from "@/modules/billing/types";
import type { PaginatedResult } from "@/shared/types/common";

interface Props {
  result: PaginatedResult<FeeDefinition>;
  stats: Record<string, number>;
  canCreate: boolean;
  canEdit: boolean;
  search?: string;
  status?: string;
}

export function FeesClient({ result, stats, canCreate, canEdit, search, status }: Props) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<FeeDefinition | null>(null);

  return (
    <div className="p-8 space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard title="Total" value={result.total} />
        <StatCard title="Ativas" value={stats["ACTIVE"] ?? 0} />
        <StatCard title="Inativas" value={stats["INACTIVE"] ?? 0} />
        <StatCard title="Arquivadas" value={stats["ARCHIVED"] ?? 0} />
      </div>

      <div className="flex justify-end">
        {canCreate && (
          <Button size="sm" onClick={() => { setEditTarget(null); setFormOpen(true); }}>
            <Plus className="size-4 mr-1.5" />
            Nova Taxa
          </Button>
        )}
      </div>

      <FeeDefinitionsTable
        result={result}
        defaultSearch={search}
        defaultStatus={status}
        canEdit={canEdit}
        onEdit={(fee) => { setEditTarget(fee); setFormOpen(true); }}
      />

      <FeeDefinitionForm
        open={formOpen}
        onOpenChange={setFormOpen}
        fee={editTarget}
        onSuccess={() => { setFormOpen(false); router.refresh(); }}
      />
    </div>
  );
}
