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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/shared/components/ui/dialog";
import { Badge } from "@/shared/components/ui/badge";
import { StatusBadge } from "@/shared/components/data/status-badge";
import { toast } from "@/shared/hooks/use-toast";
import {
  retryNotificationDeliveryAction,
  cancelNotificationDeliveryAction,
} from "@/modules/notifications/actions/notification-delivery.actions";
import { getNotificationDeliveryColumns } from "./notification-delivery-columns";
import {
  NOTIFICATION_CHANNEL_LABELS,
  NOTIFICATION_DELIVERY_STATUS_LABELS,
} from "@/modules/notifications/types";
import type { NotificationDelivery } from "@/modules/notifications/types";
import type { PaginatedResult } from "@/shared/types/common";

interface Props {
  result: PaginatedResult<NotificationDelivery>;
  defaultStatus?: string;
  defaultChannel?: string;
  defaultRecipient?: string;
  defaultDateFrom?: string;
  defaultDateTo?: string;
  canRetry: boolean;
  canCancel: boolean;
}

export function NotificationDeliveryTable({
  result,
  defaultStatus,
  defaultChannel,
  defaultRecipient,
  defaultDateFrom,
  defaultDateTo,
  canRetry,
  canCancel,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [recipient, setRecipient] = React.useState(defaultRecipient ?? "");
  const [retryTarget, setRetryTarget] = React.useState<NotificationDelivery | null>(null);
  const [cancelTarget, setCancelTarget] = React.useState<NotificationDelivery | null>(null);
  const [viewTarget, setViewTarget] = React.useState<NotificationDelivery | null>(null);
  const [isRetrying, setIsRetrying] = React.useState(false);
  const [isCancelling, setIsCancelling] = React.useState(false);

  const pagination: PaginationState = {
    pageIndex: result.page - 1,
    pageSize: result.pageSize,
  };

  function updateParams(updates: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "deliveries");
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

  const columns = getNotificationDeliveryColumns({
    onRetry: setRetryTarget,
    onCancel: setCancelTarget,
    onView: setViewTarget,
    canRetry,
    canCancel,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            updateParams({ recipient, deliveryPage: "1" });
          }}
          className="flex items-center gap-2"
        >
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              className="pl-8 h-8 w-48"
              placeholder="Pesquisar destinatário…"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
            />
          </div>
          <Button type="submit" size="sm" variant="secondary" className="h-8">Filtrar</Button>
        </form>

        <Select
          defaultValue={defaultStatus ?? "ALL"}
          onValueChange={(v) => updateParams({ status: v === "ALL" ? "" : v, deliveryPage: "1" })}
        >
          <SelectTrigger className="h-8 w-40">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos os estados</SelectItem>
            {Object.entries(NOTIFICATION_DELIVERY_STATUS_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          defaultValue={defaultChannel ?? "ALL"}
          onValueChange={(v) => updateParams({ channel: v === "ALL" ? "" : v, deliveryPage: "1" })}
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

        <Input
          type="date"
          className="h-8 w-36"
          defaultValue={defaultDateFrom}
          onChange={(e) => updateParams({ dateFrom: e.target.value, deliveryPage: "1" })}
        />
        <Input
          type="date"
          className="h-8 w-36"
          defaultValue={defaultDateTo}
          onChange={(e) => updateParams({ dateTo: e.target.value, deliveryPage: "1" })}
        />
      </div>

      {result.data.length === 0 ? (
        <EmptyState
          icon={<Inbox className="size-8" />}
          title="Nenhuma entrega encontrada"
          description="As entregas de notificações por canal aparecem aqui."
        />
      ) : (
        <DataTable
          columns={columns}
          data={result.data}
          totalRows={result.total}
          pagination={pagination}
          onPaginationChange={(p) => updateParams({ deliveryPage: String(p.pageIndex + 1) })}
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

      <Dialog open={!!viewTarget} onOpenChange={(open) => !open && setViewTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{viewTarget?.notificationTitle ?? "Notificação"}</DialogTitle>
          </DialogHeader>
          {viewTarget && (
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Canal</span>
                <Badge variant="outline">{NOTIFICATION_CHANNEL_LABELS[viewTarget.channel]}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Estado</span>
                <StatusBadge status={viewTarget.status} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Destinatário</span>
                <span className="font-medium truncate max-w-[220px]">{viewTarget.recipient || "—"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Tentativas</span>
                <span className="tabular-nums">{viewTarget.attempts}/{viewTarget.maxAttempts}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Fornecedor</span>
                <span className="font-medium">{viewTarget.provider ?? "—"}</span>
              </div>
              {viewTarget.providerMessageId && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">ID da mensagem</span>
                  <span className="font-mono text-xs truncate max-w-[220px]">{viewTarget.providerMessageId}</span>
                </div>
              )}
              {viewTarget.nextAttemptAt && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Próxima tentativa</span>
                  <span>{new Date(viewTarget.nextAttemptAt).toLocaleString("pt-PT")}</span>
                </div>
              )}
              {viewTarget.failureReason && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-destructive">
                  {viewTarget.failureReason}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewTarget(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
