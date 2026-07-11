"use client";

import type { ExamPeriodListItemDto } from "@/modules/examinations/types/portal";
import { ExaminationStatusBadge } from "./status-badges";
import { ExaminationDataTable, type ExaminationColumn } from "./examination-data-table";
import { AllowedActionButton } from "./allowed-action-button";

const fmt = (d: Date | string) => new Date(d).toLocaleDateString("pt-PT");

// Periods table — the exemplar of the "allowedActions only" rule: every lifecycle
// button is gated by the server-computed flag on the row, never by a status check.
export function PeriodsTable({
  items,
  page,
  pageSize,
  total,
}: {
  items: ExamPeriodListItemDto[];
  page: number;
  pageSize: number;
  total: number;
}) {
  const columns: ExaminationColumn<ExamPeriodListItemDto>[] = [
    { key: "name", header: "Nome", render: (p) => <span className="font-medium">{p.name}</span> },
    { key: "academicYear", header: "Ano letivo", render: (p) => p.academicYear },
    { key: "term", header: "Período", render: (p) => p.term ?? "—" },
    { key: "status", header: "Estado", render: (p) => <ExaminationStatusBadge kind="period" status={p.status} /> },
    { key: "window", header: "Datas", render: (p) => `${fmt(p.startsAt)} – ${fmt(p.endsAt)}` },
    {
      key: "actions",
      header: "Ações",
      className: "text-right",
      render: (p) => (
        <div className="flex justify-end gap-2">
          <AllowedActionButton
            allowed={p.allowedActions.canOpen}
            url={`/api/examinations/periods/${p.id}/open`}
            label="Abrir"
            hideWhenDisallowed
            successMessage="Período aberto"
          />
          <AllowedActionButton
            allowed={p.allowedActions.canLock}
            url={`/api/examinations/periods/${p.id}/lock`}
            label="Bloquear"
            variant="secondary"
            hideWhenDisallowed
            successMessage="Período bloqueado"
          />
          <AllowedActionButton
            allowed={p.allowedActions.canComplete}
            url={`/api/examinations/periods/${p.id}/complete`}
            label="Concluir"
            variant="secondary"
            hideWhenDisallowed
            successMessage="Período concluído"
          />
          <AllowedActionButton
            allowed={p.allowedActions.canCancel}
            url={`/api/examinations/periods/${p.id}/cancel`}
            label="Cancelar"
            variant="destructive"
            hideWhenDisallowed
            reasonRequired
            reasonLabel="Motivo do cancelamento"
            confirmTitle="Cancelar período"
            successMessage="Período cancelado"
          />
        </div>
      ),
    },
  ];

  return (
    <ExaminationDataTable
      columns={columns}
      rows={items}
      rowKey={(p) => p.id}
      page={page}
      pageSize={pageSize}
      total={total}
      emptyTitle="Nenhum período de exame."
    />
  );
}
