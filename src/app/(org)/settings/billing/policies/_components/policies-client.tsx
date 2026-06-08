"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { StatCard } from "@/shared/components/layout/stat-card";
import { BillingPoliciesTable } from "@/modules/billing/components/billing-policies-table";
import { BillingPolicyForm } from "@/modules/billing/components/billing-policy-form";
import type { EnrollmentBillingPolicy } from "@/modules/billing/types";
import type { PaginatedResult } from "@/shared/types/common";

interface Props {
  result: PaginatedResult<EnrollmentBillingPolicy>;
  stats: Record<string, number>;
  canCreate: boolean;
  canEdit: boolean;
  search?: string;
  status?: string;
}

export function PoliciesClient({ result, stats, canCreate, canEdit, search, status }: Props) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<EnrollmentBillingPolicy | null>(null);

  function handleEdit(policy: EnrollmentBillingPolicy) {
    setEditTarget(policy);
    setFormOpen(true);
  }

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
            Nova Política
          </Button>
        )}
      </div>

      <BillingPoliciesTable
        result={result}
        defaultSearch={search}
        defaultStatus={status}
        canEdit={canEdit}
        onEdit={handleEdit}
      />

      <BillingPolicyForm
        open={formOpen}
        onOpenChange={setFormOpen}
        policy={editTarget}
        onSuccess={() => { setFormOpen(false); router.refresh(); }}
      />
    </div>
  );
}
