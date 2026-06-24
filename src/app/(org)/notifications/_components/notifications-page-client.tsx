"use client";

import { useRouter, usePathname } from "next/navigation";
import { useTransition } from "react";
import { CheckCheck } from "lucide-react";
import { PageHeader } from "@/shared/components/layout/page-header";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/shared/components/ui/tabs";
import { useToast } from "@/shared/hooks/use-toast";
import { NotificationFilters } from "@/modules/notifications/components/notification-filters";
import { NotificationList } from "@/modules/notifications/components/notification-list";
import { NotificationTemplateList } from "@/modules/notifications/components/notification-template-list";
import { NotificationRuleList } from "@/modules/notifications/components/notification-rule-list";
import { NotificationDeliveryTable } from "@/modules/notifications/components/notification-delivery-table";
import { NotificationEmailSettingsPanel } from "@/modules/notifications/components/notification-email-settings-panel";
import { NotificationOperationsDashboard } from "@/modules/notifications/components/notification-operations-dashboard";
import {
  markNotificationReadAction,
  markAllNotificationsReadAction,
  archiveNotificationAction,
} from "@/modules/notifications/actions/notification.actions";
import type {
  Notification,
  NotificationTemplate,
  NotificationEventRule,
  NotificationDelivery,
  NotificationEmailSettings,
  NotificationOperationsKpis,
  DeliveryVolumePoint,
  DeliveryStatusDistributionPoint,
  ChannelHealthPoint,
  FailureReasonPoint,
  EventVolumePoint,
  DeliveryOperationsWatchlistItem,
  ProblemDeliveryRow,
} from "@/modules/notifications/types";
import type { PaginatedResult } from "@/shared/types/common";

interface Props {
  activeTab: "inbox" | "templates" | "rules" | "deliveries" | "email" | "operations";
  canManageTemplates: boolean;
  canManageRules: boolean;
  canViewDeliveries: boolean;
  canRetryDelivery: boolean;
  canCancelDelivery: boolean;
  canManageEmailSettings: boolean;
  canViewOperations: boolean;
  result: PaginatedResult<Notification>;
  templates: NotificationTemplate[];
  rules: NotificationEventRule[];
  deliveries: PaginatedResult<NotificationDelivery>;
  emailSettings: NotificationEmailSettings | null;
  operationsKpis: NotificationOperationsKpis | null;
  dailyVolume: DeliveryVolumePoint[];
  statusDistribution: DeliveryStatusDistributionPoint[];
  channelHealth: ChannelHealthPoint[];
  failureReasons: FailureReasonPoint[];
  topEvents: EventVolumePoint[];
  operationsWatchlist: DeliveryOperationsWatchlistItem[];
  problemDeliveries: PaginatedResult<ProblemDeliveryRow>;
  status?: string;
  severity?: string;
  type?: string;
  dateFrom?: string;
  dateTo?: string;
  deliveryChannel?: string;
  deliveryRecipient?: string;
  opsDateFrom?: string;
  opsDateTo?: string;
  opsStatus?: string;
  opsChannel?: string;
  opsFailureReason?: string;
  opsEventType?: string;
}

export function NotificationsPageClient({
  activeTab,
  canManageTemplates,
  canManageRules,
  canViewDeliveries,
  canRetryDelivery,
  canCancelDelivery,
  canManageEmailSettings,
  canViewOperations,
  result,
  templates,
  rules,
  deliveries,
  emailSettings,
  operationsKpis,
  dailyVolume,
  statusDistribution,
  channelHealth,
  failureReasons,
  topEvents,
  operationsWatchlist,
  problemDeliveries,
  status,
  severity,
  type,
  dateFrom,
  dateTo,
  deliveryChannel,
  deliveryRecipient,
  opsDateFrom,
  opsDateTo,
  opsStatus,
  opsChannel,
  opsFailureReason,
  opsEventType,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  function handleMarkRead(id: string) {
    startTransition(async () => {
      await markNotificationReadAction(id);
      router.refresh();
    });
  }

  function handleArchive(id: string) {
    startTransition(async () => {
      await archiveNotificationAction(id);
      router.refresh();
    });
  }

  function handleMarkAllRead() {
    startTransition(async () => {
      const res = await markAllNotificationsReadAction();
      if (res.success) {
        toast({ title: `${res.data} notificação(ões) marcada(s) como lida(s).` });
        router.refresh();
      } else {
        toast({ title: res.error, variant: "destructive" });
      }
    });
  }

  function handleTabChange(tab: string) {
    router.push(tab === "inbox" ? pathname : `${pathname}?tab=${tab}`);
  }

  const showManageTabs = canManageTemplates || canManageRules || canViewDeliveries || canManageEmailSettings || canViewOperations;

  return (
    <>
      <PageHeader
        title="Notificações"
        description="Acompanhe os eventos relevantes da sua organização."
        actions={
          activeTab === "inbox" && (
            <Button variant="outline" size="sm" disabled={pending} onClick={handleMarkAllRead}>
              <CheckCheck className="size-4" />
              Marcar todas como lidas
            </Button>
          )
        }
      />
      <div className="p-4 sm:p-8 space-y-6">
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          {showManageTabs && (
            <TabsList>
              <TabsTrigger value="inbox">Caixa de Entrada</TabsTrigger>
              {canManageTemplates && <TabsTrigger value="templates">Modelos</TabsTrigger>}
              {canManageRules && <TabsTrigger value="rules">Regras</TabsTrigger>}
              {canViewDeliveries && <TabsTrigger value="deliveries">Entregas</TabsTrigger>}
              {canManageEmailSettings && <TabsTrigger value="email">Email</TabsTrigger>}
              {canViewOperations && <TabsTrigger value="operations">Operações</TabsTrigger>}
            </TabsList>
          )}

          <TabsContent value="inbox">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Caixa de Entrada</CardTitle>
                <NotificationFilters
                  defaultStatus={status}
                  defaultSeverity={severity}
                  defaultType={type}
                  defaultDateFrom={dateFrom}
                  defaultDateTo={dateTo}
                />
              </CardHeader>
              <CardContent>
                <NotificationList result={result} onMarkRead={handleMarkRead} onArchive={handleArchive} />
              </CardContent>
            </Card>
          </TabsContent>

          {canManageTemplates && (
            <TabsContent value="templates">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Modelos de Notificação</CardTitle>
                </CardHeader>
                <CardContent>
                  <NotificationTemplateList templates={templates} />
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {canManageRules && (
            <TabsContent value="rules">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Regras de Evento</CardTitle>
                </CardHeader>
                <CardContent>
                  <NotificationRuleList rules={rules} />
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {canViewDeliveries && (
            <TabsContent value="deliveries">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Entregas</CardTitle>
                </CardHeader>
                <CardContent>
                  <NotificationDeliveryTable
                    result={deliveries}
                    defaultStatus={status}
                    defaultChannel={deliveryChannel}
                    defaultRecipient={deliveryRecipient}
                    defaultDateFrom={dateFrom}
                    defaultDateTo={dateTo}
                    canRetry={canRetryDelivery}
                    canCancel={canCancelDelivery}
                  />
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {canManageEmailSettings && (
            <TabsContent value="email">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Configuração de Email</CardTitle>
                </CardHeader>
                <CardContent>
                  <NotificationEmailSettingsPanel settings={emailSettings} />
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {canViewOperations && operationsKpis && (
            <TabsContent value="operations">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Operações de Notificações</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Estado de entrega, falhas, filas e saúde dos canais.
                  </p>
                </CardHeader>
                <CardContent>
                  <NotificationOperationsDashboard
                    kpis={operationsKpis}
                    dailyVolume={dailyVolume}
                    statusDistribution={statusDistribution}
                    channelHealth={channelHealth}
                    failureReasons={failureReasons}
                    topEvents={topEvents}
                    watchlist={operationsWatchlist}
                    problemDeliveries={problemDeliveries}
                    defaultDateFrom={opsDateFrom}
                    defaultDateTo={opsDateTo}
                    defaultStatus={opsStatus}
                    defaultChannel={opsChannel}
                    defaultFailureReason={opsFailureReason}
                    defaultEventType={opsEventType}
                    canRetryDelivery={canRetryDelivery}
                    canCancelDelivery={canCancelDelivery}
                  />
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      </div>
    </>
  );
}
