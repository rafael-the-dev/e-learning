"use client";

import * as React from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { type PaginationState } from "@tanstack/react-table";
import { Inbox, Search } from "lucide-react";
import { DataTable } from "@/shared/components/data/data-table";
import { Input } from "@/shared/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Button } from "@/shared/components/ui/button";
import { ConfirmDialog } from "@/shared/components/feedback/confirm-dialog";
import { EmptyState } from "@/shared/components/layout/empty-state";
import { toast } from "@/shared/hooks/use-toast";
import {
  retryNotificationDeliveryAction,
  cancelNotificationDeliveryAction,
} from "@/modules/notifications/actions/notification-delivery.actions";
import { listEventCatalog } from "@/modules/notifications/catalog/notification-event-catalog";
import { getProblemDeliveryColumns } from "./notification-operations-columns";
import {
  NOTIFICATION_CHANNEL_LABELS,
  NOTIFICATION_DELIVERY_STATUS_LABELS,
} from "@/modules/notifications/types";
import type { ProblemDeliveryRow } from "@/modules/notifications/types";
import type { PaginatedResult } from "@/shared/types/common";

interface Props {
  result: PaginatedResult<ProblemDeliveryRow>;
  defaultStatus?: string;
  defaultChannel?: string;
  defaultFailureReason?: string;
  defaultEventType?: string;
  canRetry: boolean;
  canCancel: boolean;
}

export function NotificationOperationsTable({
  result,
  defaultStatus,
  defaultChannel,
  defaultFailureReason,
  defaultEventType,
  canRetry,
  canCancel,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [failureReason, setFailureReason] = React.useState(defaultFailureReason ?? "");
  const [retryTarget, setRetryTarget] = React.useState<ProblemDeliveryRow | null>(null);
  const [cancelTarget, setCancelTarget] = React.useState<ProblemDeliveryRow | null>(null);
  const [isRetrying, setIsRetrying] = React.useState(false);
  const [isCancelling, setIsCancelling] = React.useState(false);

  const pagination: PaginationState = {
    pageIndex: result.page - 1,
    pageSize: result.pageSize,
  };

  function updateParams(updates: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "operations");
    Object.entries(updates).forEach(([k, v]) => {
      if (v) params.set(k, v);
      else params.delete(k);
    });
    router.push(`${pathname}?${params.toString()}`);
  }

  async function handleRetry() {
    if (!retryTarget) return;
    setIsRetrying(true);
    const res = await retryNotificationDeliveryAction(retryTarget.id);
    setIsRetrying(false);
    if (res.success) {
      toast.success("Entrega marcada para reenvio");
      setRetryTarget(null);
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  async function handleCancel() {
    if (!cancelTarget) return;
    setIsCancelling(true);
    const res = await cancelNotificationDeliveryAction(cancelTarget.id);
    setIsCancelling(false);
    if (res.success) {
      toast.success("Entrega cancelada");
      setCancelTarget(null);
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  const columns = getProblemDeliveryColumns({
    onRetry: setRetryTarget,
    onCancel: setCancelTarget,
    canRetry,
    canCancel,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            updateParams({ opsFailureReason: failureReason, opsPage: "1" });
          }}
          className="flex items-center gap-2"
        >
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              className="pl-8 h-8 w-48"
              placeholder="Motivo da falha…"
              value={failureReason}
              onChange={(e) => setFailureReason(e.target.value)}
            />
          </div>
          <Button type="submit" size="sm" variant="secondary" className="h-8">Filtrar</Button>
        </form>

        <Select
          defaultValue={defaultStatus ?? "ALL"}
          onValueChange={(v) => updateParams({ opsStatus: v === "ALL" ? "" : v, opsPage: "1" })}
        >
          <SelectTrigger className="h-8 w-44">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Falhadas, Pendentes e Em Processamento</SelectItem>
            {Object.entries(NOTIFICATION_DELIVERY_STATUS_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          defaultValue={defaultChannel ?? "ALL"}
          onValueChange={(v) => updateParams({ opsChannel: v === "ALL" ? "" : v, opsPage: "1" })}
        >
          <SelectTrigger className="h-8 w-36">
            <SelectValue placeholder="Canal" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos os canais</SelectItem>
            {Object.entries(NOTIFICATION_CHANNEL_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          defaultValue={defaultEventType ?? "ALL"}
          onValueChange={(v) => updateParams({ opsEventType: v === "ALL" ? "" : v, opsPage: "1" })}
        >
          <SelectTrigger className="h-8 w-48">
            <SelectValue placeholder="Tipo de evento" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos os eventos</SelectItem>
            {listEventCatalog().map((event) => (
              <SelectItem key={event.eventType} value={event.eventType}>{event.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {result.data.length === 0 ? (
        <EmptyState
          icon={<Inbox className="size-8" />}
          title="Não existem entregas no período seleccionado."
          description="Ajuste os filtros para ver outras entregas."
        />
      ) : (
        <DataTable
          columns={columns}
          data={result.data}
          totalRows={result.total}
          pagination={pagination}
          onPaginationChange={(p) => updateParams({ opsPage: String(p.pageIndex + 1) })}
        />
      )}

      <ConfirmDialog
        open={!!retryTarget}
        onOpenChange={(open) => !open && setRetryTarget(null)}
        title="Reenviar Entrega"
        description={retryTarget ? `Tem a certeza que pretende reenviar a entrega para "${retryTarget.recipient}"?` : ""}
        confirmLabel="Reenviar"
        loading={isRetrying}
        onConfirm={handleRetry}
      />

      <ConfirmDialog
        open={!!cancelTarget}
        onOpenChange={(open) => !open && setCancelTarget(null)}
        title="Cancelar Entrega"
        description={cancelTarget ? `Tem a certeza que pretende cancelar a entrega para "${cancelTarget.recipient}"?` : ""}
        confirmLabel="Cancelar Entrega"
        variant="destructive"
        loading={isCancelling}
        onConfirm={handleCancel}
      />
    </div>
  );
}
