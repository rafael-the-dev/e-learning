"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, RotateCcw, Ban } from "lucide-react";
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
import type { ProblemDeliveryRow } from "@/modules/notifications/types";

interface GetProblemDeliveryColumnsOptions {
  onRetry: (delivery: ProblemDeliveryRow) => void;
  onCancel: (delivery: ProblemDeliveryRow) => void;
  canRetry: boolean;
  canCancel: boolean;
}

export function getProblemDeliveryColumns({
  onRetry,
  onCancel,
  canRetry,
  canCancel,
}: GetProblemDeliveryColumnsOptions): ColumnDef<ProblemDeliveryRow>[] {
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
        <span className="text-sm font-medium truncate max-w-[200px] block">
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
        <span className="text-sm text-muted-foreground truncate max-w-[160px] block">
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
      accessorKey: "attempts",
      header: "Tentativas",
      cell: ({ row }) => (
        <span className="text-sm tabular-nums">
          {row.original.attempts}/{row.original.maxAttempts}
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
        if (!canRetryThis && !canCancelThis) return null;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-7">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">Ações</DropdownMenuLabel>
              <DropdownMenuSeparator />
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
