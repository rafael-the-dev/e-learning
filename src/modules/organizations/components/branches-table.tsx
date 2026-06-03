"use client";

import * as React from "react";
import { DataTable } from "@/shared/components/data/data-table";
import { EmptyState } from "@/shared/components/layout/empty-state";
import { ConfirmDialog } from "@/shared/components/feedback/confirm-dialog";
import { Button } from "@/shared/components/ui/button";
import { EditBranchForm, CreateBranchForm } from "@/modules/organizations/components/branch-form";
import { getBranchColumns } from "@/modules/organizations/components/branch-columns";
import { deleteBranchAction } from "@/modules/organizations/actions/branch.actions";
import { toast } from "@/shared/hooks/use-toast";
import { GitBranch, Plus } from "lucide-react";
import type { Branch } from "@prisma/client";

interface BranchesTableProps {
  branches: Branch[];
  organizationId: string;
}

export function BranchesTable({ branches, organizationId }: BranchesTableProps) {
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<Branch | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<Branch | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [localBranches, setLocalBranches] = React.useState(branches);

  React.useEffect(() => setLocalBranches(branches), [branches]);

  const columns = getBranchColumns({
    onEdit: setEditTarget,
    onDelete: setDeleteTarget,
  });

  async function handleDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    const result = await deleteBranchAction(organizationId, deleteTarget.id);
    setIsDeleting(false);
    if (result.success) {
      toast.success("Filial eliminada");
      setLocalBranches((prev) => prev.filter((b) => b.id !== deleteTarget.id));
      setDeleteTarget(null);
    } else {
      toast.error(result.error);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
          Adicionar Filial
        </Button>
      </div>

      {localBranches.length === 0 ? (
        <EmptyState
          icon={<GitBranch className="size-8" />}
          title="Sem filiais"
          description="Adicione filiais para organizar as localizações desta organização."
          action={
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              Adicionar Filial
            </Button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={localBranches}
          totalRows={localBranches.length}
          pagination={{ pageIndex: 0, pageSize: localBranches.length }}
          onPaginationChange={() => {}}
        />
      )}

      <CreateBranchForm
        open={createOpen}
        onOpenChange={setCreateOpen}
        organizationId={organizationId}
        onSuccess={(branch) =>
          setLocalBranches((prev) => [
            ...prev.filter((b) => !branch.isDefault || !b.isDefault),
            branch,
          ])
        }
      />

      {editTarget && (
        <EditBranchForm
          open={true}
          onOpenChange={(open) => !open && setEditTarget(null)}
          organizationId={organizationId}
          branch={editTarget}
          onSuccess={(updated) => {
            setLocalBranches((prev) =>
              prev.map((b) => (b.id === updated.id ? updated : b))
            );
            setEditTarget(null);
          }}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Eliminar Filial"
        description={`Tem a certeza que pretende eliminar "${deleteTarget?.name}"? Esta ação não pode ser revertida.`}
        confirmLabel="Eliminar"
        variant="destructive"
        loading={isDeleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
