"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, RotateCcw, Ban, Eye } from "lucide-react";
import { StatusBadge } from "@/shared/components/data/status-badge";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { NOTIFICATION_CHANNEL_LABELS } from "@/modules/notifications/types";
import type { NotificationDelivery } from "@/modules/notifications/types";

interface GetNotificationDeliveryColumnsOptions {
  onRetry: (delivery: NotificationDelivery) => void;
  onCancel: (delivery: NotificationDelivery) => void;
  onView: (delivery: NotificationDelivery) => void;
  canRetry: boolean;
  canCancel: boolean;
}

export function getNotificationDeliveryColumns({
  onRetry,
  onCancel,
  onView,
  canRetry,
  canCancel,
}: GetNotificationDeliveryColumnsOptions): ColumnDef<NotificationDelivery>[] {
  return [
    {
      accessorKey: "createdAt",
      header: "Data",
      cell: ({ row }) => (
        <span className="text-sm tabular-nums whitespace-nowrap">
          {new Date(row.original.createdAt).toLocaleString("pt-PT")}
        </span>
      ),
    },
    {
      accessorKey: "notificationTitle",
      header: "Notificação",
      cell: ({ row }) => (
        <span className="text-sm font-medium truncate max-w-[220px] block">
          {row.original.notificationTitle ?? "—"}
        </span>
      ),
    },
    {
      accessorKey: "channel",
      header: "Canal",
      cell: ({ row }) => (
        <Badge variant="outline" className="text-xs">
          {NOTIFICATION_CHANNEL_LABELS[row.original.channel] ?? row.original.channel}
        </Badge>
      ),
    },
    {
      accessorKey: "recipient",
      header: "Destinatário",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground truncate max-w-[180px] block">
          {row.original.recipient || "—"}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "Estado",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      accessorKey: "provider",
      header: "Fornecedor",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{row.original.provider ?? "—"}</span>
      ),
    },
    {
      accessorKey: "attempts",
      header: "Tentativas",
      cell: ({ row }) => (
        <span className="text-sm tabular-nums">
          {row.original.attempts}/{row.original.maxAttempts}
        </span>
      ),
    },
    {
      accessorKey: "lastAttemptAt",
      header: "Última Tentativa",
      cell: ({ row }) => (
        <span className="text-sm tabular-nums whitespace-nowrap text-muted-foreground">
          {row.original.lastAttemptAt ? new Date(row.original.lastAttemptAt).toLocaleString("pt-PT") : "—"}
        </span>
      ),
    },
    {
      accessorKey: "nextAttemptAt",
      header: "Próxima Tentativa",
      cell: ({ row }) => (
        <span className="text-sm tabular-nums whitespace-nowrap text-muted-foreground">
          {row.original.nextAttemptAt ? new Date(row.original.nextAttemptAt).toLocaleString("pt-PT") : "—"}
        </span>
      ),
    },
    {
      accessorKey: "failureReason",
      header: "Motivo da Falha",
      cell: ({ row }) => (
        <span className="text-sm text-destructive truncate max-w-[200px] block">
          {row.original.failureReason ?? "—"}
        </span>
      ),
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const delivery = row.original;
        const canRetryThis = canRetry && delivery.status === "FAILED" && delivery.attempts < delivery.maxAttempts;
        const canCancelThis = canCancel && (delivery.status === "PENDING" || delivery.status === "FAILED");
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-7">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">Ações</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => onView(delivery)}>
                <Eye className="size-4" />
                Ver notificação
              </DropdownMenuItem>
              {(canRetryThis || canCancelThis) && <DropdownMenuSeparator />}
              {canRetryThis && (
                <DropdownMenuItem onClick={() => onRetry(delivery)}>
                  <RotateCcw className="size-4" />
                  Reenviar
                </DropdownMenuItem>
              )}
              {canCancelThis && (
                <DropdownMenuItem onClick={() => onCancel(delivery)} className="text-destructive focus:text-destructive">
                  <Ban className="size-4" />
                  Cancelar
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];
}
