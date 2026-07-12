"use client";

import Link from "next/link";
import { Button } from "@/shared/components/ui/button";
import type { ExamSessionListItemDto } from "@/modules/examinations/types/portal";
import { ExaminationStatusBadge } from "./status-badges";
import { ExaminationDataTable, type ExaminationColumn } from "./examination-data-table";

const fmt = (d: Date | string) => new Date(d).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" });

export function SessionsTable({
  items,
  page,
  pageSize,
  total,
  emptyTitle = "Nenhuma sessão de exame.",
}: {
  items: ExamSessionListItemDto[];
  page: number;
  pageSize: number;
  total: number;
  emptyTitle?: string;
}) {
  const columns: ExaminationColumn<ExamSessionListItemDto>[] = [
    { key: "title", header: "Título", render: (s) => <span className="font-medium">{s.title}</span> },
    { key: "status", header: "Estado", render: (s) => <ExaminationStatusBadge kind="session" status={s.status} /> },
    { key: "window", header: "Início / Fim", render: (s) => `${fmt(s.startsAt)} – ${fmt(s.endsAt)}` },
    { key: "capacity", header: "Capacidade", render: (s) => s.capacity },
    {
      key: "actions",
      header: "Ações",
      className: "text-right",
      render: (s) => (
        <Button asChild variant="outline" size="sm">
          <Link href={`/examinations/sessions/${s.id}`}>Gerir</Link>
        </Button>
      ),
    },
  ];

  return (
    <ExaminationDataTable
      columns={columns}
      rows={items}
      rowKey={(s) => s.id}
      page={page}
      pageSize={pageSize}
      total={total}
      emptyTitle={emptyTitle}
    />
  );
}
