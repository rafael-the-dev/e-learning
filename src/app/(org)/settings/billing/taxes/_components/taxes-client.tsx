"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { StatCard } from "@/shared/components/layout/stat-card";
import { TaxRulesTable } from "@/modules/billing/components/tax-rules-table";
import { TaxRuleForm } from "@/modules/billing/components/tax-rule-form";
import type { TaxRule } from "@/modules/billing/types";
import type { PaginatedResult } from "@/shared/types/common";

interface Props {
  result: PaginatedResult<TaxRule>;
  stats: Record<string, number>;
  canCreate: boolean;
  canEdit: boolean;
  search?: string;
  status?: string;
}

export function TaxesClient({ result, stats, canCreate, canEdit, search, status }: Props) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<TaxRule | null>(null);

  return (
    <div className="p-8 space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard title="Total" value={result.total} />
        <StatCard title="Ativos" value={stats["ACTIVE"] ?? 0} />
        <StatCard title="Inativos" value={stats["INACTIVE"] ?? 0} />
        <StatCard title="Arquivados" value={stats["ARCHIVED"] ?? 0} />
      </div>

      <div className="flex justify-end">
        {canCreate && (
          <Button size="sm" onClick={() => { setEditTarget(null); setFormOpen(true); }}>
            <Plus className="size-4 mr-1.5" />
            Novo Imposto
          </Button>
        )}
      </div>

      <TaxRulesTable
        result={result}
        defaultSearch={search}
        defaultStatus={status}
        canEdit={canEdit}
        onEdit={(t) => { setEditTarget(t); setFormOpen(true); }}
      />

      <TaxRuleForm
        open={formOpen}
        onOpenChange={setFormOpen}
        tax={editTarget}
        onSuccess={() => { setFormOpen(false); router.refresh(); }}
      />
    </div>
  );
}
