"use client";

import { Button } from "@/shared/components/ui/button";
import type { ExamRoomListItemDto } from "@/modules/examinations/types/portal";
import { ExaminationStatusBadge } from "./status-badges";
import { ExaminationDataTable, type ExaminationColumn } from "./examination-data-table";
import { AllowedActionButton } from "./allowed-action-button";
import { RoomFormDialog } from "./room-form-dialog";

export function RoomsTable({
  items,
  page,
  pageSize,
  total,
}: {
  items: ExamRoomListItemDto[];
  page: number;
  pageSize: number;
  total: number;
}) {
  const columns: ExaminationColumn<ExamRoomListItemDto>[] = [
    { key: "name", header: "Nome", render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "code", header: "Código", render: (r) => r.code ?? "—" },
    { key: "branch", header: "Filial", render: (r) => r.branchName ?? "—" },
    { key: "capacity", header: "Capacidade", render: (r) => r.capacity },
    { key: "status", header: "Estado", render: (r) => <ExaminationStatusBadge kind="room" status={r.status} /> },
    {
      key: "upcoming",
      header: "Sessões futuras",
      render: (r) => (r.upcomingSessionCount > 0 ? r.upcomingSessionCount : "—"),
    },
    {
      key: "actions",
      header: "Ações",
      className: "text-right",
      render: (r) => (
        <div className="flex items-center justify-end gap-2">
          {r.allowedActions.canEdit && (
            <RoomFormDialog
              mode="edit"
              room={r}
              trigger={<Button variant="outline" size="sm">Editar</Button>}
            />
          )}
          <AllowedActionButton
            allowed={r.allowedActions.canArchive}
            url={`/api/examinations/rooms/${r.roomId}/archive`}
            label="Arquivar"
            variant="destructive"
            confirm
            confirmTitle="Arquivar sala"
            confirmDescription={
              r.upcomingSessionCount > 0
                ? "Esta sala tem sessões futuras ou em curso — a ação será recusada pelo servidor."
                : undefined
            }
            successMessage="Sala arquivada"
          />
        </div>
      ),
    },
  ];

  return (
    <ExaminationDataTable
      columns={columns}
      rows={items}
      rowKey={(r) => r.roomId}
      page={page}
      pageSize={pageSize}
      total={total}
      emptyTitle="Nenhuma sala de exame."
    />
  );
}
