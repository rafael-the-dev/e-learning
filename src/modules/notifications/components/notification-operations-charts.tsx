"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { ApexLineChart } from "@/shared/components/charts/apex-line-chart";
import { ApexDonutChart } from "@/shared/components/charts/apex-donut-chart";
import { ApexBarChart } from "@/shared/components/charts/apex-bar-chart";
import {
  NOTIFICATION_CHANNEL_LABELS,
  NOTIFICATION_DELIVERY_STATUS_LABELS,
} from "@/modules/notifications/types";
import type {
  ChannelHealthPoint,
  DeliveryStatusDistributionPoint,
  DeliveryVolumePoint,
  EventVolumePoint,
  FailureReasonPoint,
} from "@/modules/notifications/types";

function formatDay(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit" });
}

interface DailyDeliveryVolumeChartProps {
  data: DeliveryVolumePoint[];
}

export function DailyDeliveryVolumeChart({ data }: DailyDeliveryVolumeChartProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Volume Diário de Entregas</CardTitle>
      </CardHeader>
      <CardContent>
        <ApexLineChart
          height={280}
          data={{
            categories: data.map((p) => formatDay(p.date)),
            series: [
              { name: "Enviadas", data: data.map((p) => p.sent) },
              { name: "Entregues", data: data.map((p) => p.delivered) },
              { name: "Falhadas", data: data.map((p) => p.failed) },
              { name: "Pendentes Criadas", data: data.map((p) => p.pendingCreated) },
            ],
            colors: ["#6366f1", "#22c55e", "#ef4444", "#94a3b8"],
          }}
        />
      </CardContent>
    </Card>
  );
}

interface DeliveryStatusDistributionChartProps {
  data: DeliveryStatusDistributionPoint[];
}

export function DeliveryStatusDistributionChart({ data }: DeliveryStatusDistributionChartProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Distribuição por Estado</CardTitle>
      </CardHeader>
      <CardContent>
        <ApexDonutChart
          height={240}
          data={{
            labels: data.map((p) => NOTIFICATION_DELIVERY_STATUS_LABELS[p.status] ?? p.status),
            series: data.map((p) => p.count),
          }}
        />
      </CardContent>
    </Card>
  );
}

interface ChannelHealthChartProps {
  data: ChannelHealthPoint[];
}

export function ChannelHealthChart({ data }: ChannelHealthChartProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Saúde por Canal</CardTitle>
      </CardHeader>
      <CardContent>
        <ApexBarChart
          height={240}
          data={{
            categories: data.map((p) => NOTIFICATION_CHANNEL_LABELS[p.channel] ?? p.channel),
            series: [
              { name: "Sucesso", data: data.map((p) => p.successCount) },
              { name: "Falhas", data: data.map((p) => p.failureCount) },
            ],
            colors: ["#22c55e", "#ef4444"],
          }}
        />
      </CardContent>
    </Card>
  );
}

interface FailureReasonsChartProps {
  data: FailureReasonPoint[];
}

export function FailureReasonsChart({ data }: FailureReasonsChartProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Motivos de Falha</CardTitle>
      </CardHeader>
      <CardContent>
        <ApexBarChart
          height={240}
          horizontal
          data={{
            categories: data.map((p) => p.failureReason),
            series: [{ name: "Ocorrências", data: data.map((p) => p.count) }],
            colors: ["#ef4444"],
          }}
        />
      </CardContent>
    </Card>
  );
}

interface TopEventsChartProps {
  data: EventVolumePoint[];
}

export function TopEventsChart({ data }: TopEventsChartProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Principais Eventos</CardTitle>
      </CardHeader>
      <CardContent>
        <ApexBarChart
          height={240}
          horizontal
          data={{
            categories: data.map((p) => p.type),
            series: [{ name: "Notificações", data: data.map((p) => p.count) }],
            colors: ["#6366f1"],
          }}
        />
      </CardContent>
    </Card>
  );
}
