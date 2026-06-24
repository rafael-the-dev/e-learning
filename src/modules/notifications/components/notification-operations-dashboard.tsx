"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  Clock,
  Loader2,
  Send,
  CheckCircle2,
  XCircle,
  Ban,
  Percent,
  AlertTriangle,
  Hash,
  ShieldAlert,
  Inbox,
} from "lucide-react";
import { StatCard } from "@/shared/components/layout/stat-card";
import { Input } from "@/shared/components/ui/input";
import { Badge } from "@/shared/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import {
  ExecutiveKpiGrid,
  ExecutiveMainGrid,
  ExecutiveLeftColumn,
  ExecutiveRightColumn,
} from "@/shared/components/layout/executive-dashboard";
import {
  DailyDeliveryVolumeChart,
  DeliveryStatusDistributionChart,
  ChannelHealthChart,
  FailureReasonsChart,
  TopEventsChart,
} from "./notification-operations-charts";
import { NotificationOperationsWatchlist } from "./notification-operations-watchlist";
import { NotificationOperationsTable } from "./notification-operations-table";
import type {
  ChannelHealthPoint,
  DeliveryOperationsWatchlistItem,
  DeliveryStatusDistributionPoint,
  DeliveryVolumePoint,
  EventVolumePoint,
  FailureReasonPoint,
  NotificationOperationsKpis,
  ProblemDeliveryRow,
} from "@/modules/notifications/types";
import type { PaginatedResult } from "@/shared/types/common";

interface Props {
  kpis: NotificationOperationsKpis;
  dailyVolume: DeliveryVolumePoint[];
  statusDistribution: DeliveryStatusDistributionPoint[];
  channelHealth: ChannelHealthPoint[];
  failureReasons: FailureReasonPoint[];
  topEvents: EventVolumePoint[];
  watchlist: DeliveryOperationsWatchlistItem[];
  problemDeliveries: PaginatedResult<ProblemDeliveryRow>;
  defaultDateFrom?: string;
  defaultDateTo?: string;
  defaultStatus?: string;
  defaultChannel?: string;
  defaultFailureReason?: string;
  defaultEventType?: string;
  canRetryDelivery: boolean;
  canCancelDelivery: boolean;
}

function formatPercent(value: number): string {
  return `${value.toLocaleString("pt-PT", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}%`;
}

export function NotificationOperationsDashboard({
  kpis,
  dailyVolume,
  statusDistribution,
  channelHealth,
  failureReasons,
  topEvents,
  watchlist,
  problemDeliveries,
  defaultDateFrom,
  defaultDateTo,
  defaultStatus,
  defaultChannel,
  defaultFailureReason,
  defaultEventType,
  canRetryDelivery,
  canCancelDelivery,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function updateParams(updates: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "operations");
    Object.entries(updates).forEach(([k, v]) => {
      if (v) params.set(k, v);
      else params.delete(k);
    });
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Período</span>
        <Input
          type="date"
          className="h-8 w-36"
          defaultValue={defaultDateFrom}
          onChange={(e) => updateParams({ opsDateFrom: e.target.value, opsPage: "1" })}
        />
        <Input
          type="date"
          className="h-8 w-36"
          defaultValue={defaultDateTo}
          onChange={(e) => updateParams({ opsDateTo: e.target.value, opsPage: "1" })}
        />
      </div>

      <ExecutiveKpiGrid>
        <StatCard title="Pendentes" value={kpis.pending} icon={<Clock className="size-4 text-amber-500" />} />
        <StatCard title="Em Processamento" value={kpis.processing} icon={<Loader2 className="size-4 text-blue-500" />} />
        <StatCard title="Enviadas" value={kpis.sent} icon={<Send className="size-4 text-indigo-500" />} />
        <StatCard title="Entregues" value={kpis.delivered} icon={<CheckCircle2 className="size-4 text-emerald-500" />} />
        <StatCard title="Falhadas" value={kpis.failed} icon={<XCircle className="size-4 text-red-500" />} />
        <StatCard title="Canceladas" value={kpis.cancelled} icon={<Ban className="size-4 text-slate-500" />} />
        <StatCard title="Taxa de Sucesso" value={formatPercent(kpis.successRate)} icon={<Percent className="size-4 text-emerald-500" />} />
        <StatCard title="Lista de Reenvio" value={kpis.retryBacklog} icon={<AlertTriangle className="size-4 text-amber-500" />} />
        <StatCard
          title="Tentativas Médias"
          value={kpis.averageAttempts.toLocaleString("pt-PT", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
          icon={<Hash className="size-4 text-muted-foreground" />}
        />
      </ExecutiveKpiGrid>

      <DailyDeliveryVolumeChart data={dailyVolume} />

      <ExecutiveMainGrid>
        <ExecutiveLeftColumn>
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="size-4 text-muted-foreground" />
                  <CardTitle className="text-sm font-medium">Vigilância de Entregas</CardTitle>
                </div>
                <Badge variant="secondary" className="text-xs">{watchlist.length}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <NotificationOperationsWatchlist items={watchlist} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Inbox className="size-4 text-muted-foreground" />
                <CardTitle className="text-sm font-medium">Entregas com Problemas Recentes</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <NotificationOperationsTable
                result={problemDeliveries}
                defaultStatus={defaultStatus}
                defaultChannel={defaultChannel}
                defaultFailureReason={defaultFailureReason}
                defaultEventType={defaultEventType}
                canRetry={canRetryDelivery}
                canCancel={canCancelDelivery}
              />
            </CardContent>
          </Card>
        </ExecutiveLeftColumn>

        <ExecutiveRightColumn>
          <DeliveryStatusDistributionChart data={statusDistribution} />
          <ChannelHealthChart data={channelHealth} />
          <FailureReasonsChart data={failureReasons} />
          <TopEventsChart data={topEvents} />
        </ExecutiveRightColumn>
      </ExecutiveMainGrid>
    </div>
  );
}
