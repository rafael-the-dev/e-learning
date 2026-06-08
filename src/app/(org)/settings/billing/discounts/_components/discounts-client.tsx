"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { StatCard } from "@/shared/components/layout/stat-card";
import { DiscountRulesTable } from "@/modules/billing/components/discount-rules-table";
import { DiscountRuleForm } from "@/modules/billing/components/discount-rule-form";
import type { DiscountRule } from "@/modules/billing/types";
import type { PaginatedResult } from "@/shared/types/common";

interface Props {
  result: PaginatedResult<DiscountRule>;
  stats: Record<string, number>;
  canCreate: boolean;
  canEdit: boolean;
  search?: string;
  status?: string;
}

export function DiscountsClient({ result, stats, canCreate, canEdit, search, status }: Props) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<DiscountRule | null>(null);

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
            Novo Desconto
          </Button>
        )}
      </div>

      <DiscountRulesTable
        result={result}
        defaultSearch={search}
        defaultStatus={status}
        canEdit={canEdit}
        onEdit={(d) => { setEditTarget(d); setFormOpen(true); }}
      />

      <DiscountRuleForm
        open={formOpen}
        onOpenChange={setFormOpen}
        discount={editTarget}
        onSuccess={() => { setFormOpen(false); router.refresh(); }}
      />
    </div>
  );
}
