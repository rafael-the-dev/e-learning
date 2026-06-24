import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { EmptyState } from "@/shared/components/layout/empty-state";
import {
  NOTIFICATION_CHANNEL_LABELS,
  NOTIFICATION_OPERATIONS_SEVERITY_LABELS,
} from "@/modules/notifications/types";
import type {
  DeliveryOperationsWatchlistItem,
  NotificationOperationsSeverity,
} from "@/modules/notifications/types";

const SEVERITY_VARIANT: Record<NotificationOperationsSeverity, "default" | "secondary" | "destructive" | "outline"> = {
  CRITICAL: "destructive",
  HIGH: "destructive",
  MEDIUM: "secondary",
  LOW: "outline",
};

interface Props {
  items: DeliveryOperationsWatchlistItem[];
}

export function NotificationOperationsWatchlist({ items }: Props) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={<ShieldCheck className="size-8 text-emerald-600" />}
        title="Nenhum problema de entrega encontrado."
        description="Os canais de notificação estão a funcionar normalmente."
        className="border-0"
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-2 pr-3 font-medium">Severidade</th>
            <th className="py-2 pr-3 font-medium">Tipo</th>
            <th className="py-2 pr-3 font-medium">Canal</th>
            <th className="py-2 pr-3 font-medium">Contagem</th>
            <th className="py-2 pr-3 font-medium">Descrição</th>
            <th className="py-2 pr-3 font-medium">Ação Recomendada</th>
            <th className="py-2 font-medium">Link</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b last:border-0">
              <td className="py-2 pr-3">
                <Badge variant={SEVERITY_VARIANT[item.severity]} className="text-[10px]">
                  {NOTIFICATION_OPERATIONS_SEVERITY_LABELS[item.severity]}
                </Badge>
              </td>
              <td className="py-2 pr-3 whitespace-nowrap font-mono">{item.type}</td>
              <td className="py-2 pr-3 whitespace-nowrap">
                {item.channel ? NOTIFICATION_CHANNEL_LABELS[item.channel] : "—"}
              </td>
              <td className="py-2 pr-3 whitespace-nowrap tabular-nums">{item.count}</td>
              <td className="py-2 pr-3 max-w-80">{item.description}</td>
              <td className="py-2 pr-3 whitespace-nowrap">{item.recommendedAction}</td>
              <td className="py-2">
                <Button asChild variant="outline" size="sm" className="h-6 text-[10px]">
                  <Link href={item.link}>Ver</Link>
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
