import { Bell, FileText, CalendarClock } from "lucide-react";
import { requirePermissionOrRedirect } from "@/server/auth/context";
import { PERMISSIONS, type Permission } from "@/server/auth/permissions";
import { getSecretaryPortalData } from "@/modules/secretary-portal/services/secretary-portal.service";
import {
  ExecutiveMainGrid,
  ExecutiveLeftColumn,
  ExecutiveRightColumn,
  DashboardSideCard,
} from "@/shared/components/layout/executive-dashboard";
import { SecretaryPortalHeader } from "@/modules/secretary-portal/components/secretary-portal-header";
import { SecretaryTodayOverviewCard } from "@/modules/secretary-portal/components/secretary-today-overview";
import { SecretaryQuickActions } from "@/modules/secretary-portal/components/secretary-quick-actions";
import { SecretaryKpiCards } from "@/modules/secretary-portal/components/secretary-kpi-cards";
import { SecretaryOperationalQueues } from "@/modules/secretary-portal/components/secretary-operational-queues";
import { SecretaryStudentAdministration } from "@/modules/secretary-portal/components/secretary-student-administration";
import { SecretaryFinancialAttention } from "@/modules/secretary-portal/components/secretary-financial-attention";
import { SecretaryDocumentsCompliance } from "@/modules/secretary-portal/components/secretary-documents-compliance";
import { SecretaryNotificationsPanel } from "@/modules/secretary-portal/components/secretary-notifications-panel";
import { SecretaryUpcomingDeadlines } from "@/modules/secretary-portal/components/secretary-upcoming-deadlines";

export const metadata = { title: "Portal da Secretaria" };

export default async function SecretaryPortalPage() {
  // organizationId is resolved server-side from the active org (never the URL).
  // userId only scopes the notifications panel.
  const context = await requirePermissionOrRedirect(PERMISSIONS.SECRETARY_PORTAL_VIEW);
  const data = await getSecretaryPortalData(context.userId, context.organizationId, (p) =>
    context.ability.can(p as Permission)
  );

  return (
    <>
      <SecretaryPortalHeader />
      <div className="p-4 sm:p-8 space-y-6">
        <SecretaryTodayOverviewCard overview={data.todayOverview} />
        <SecretaryQuickActions actions={data.quickActions} />
        <SecretaryKpiCards kpis={data.kpis} />

        <ExecutiveMainGrid>
          <ExecutiveLeftColumn>
            <SecretaryOperationalQueues queues={data.queues} />
            <SecretaryStudentAdministration administration={data.studentAdministration} />
            <SecretaryFinancialAttention attention={data.financialAttention} />
          </ExecutiveLeftColumn>

          <ExecutiveRightColumn>
            <DashboardSideCard title="Próximos Prazos" icon={<CalendarClock className="size-4" />}>
              <SecretaryUpcomingDeadlines deadlines={data.deadlines} />
            </DashboardSideCard>

            <DashboardSideCard title="Documentos e Conformidade" icon={<FileText className="size-4" />}>
              <SecretaryDocumentsCompliance compliance={data.documentsCompliance} />
            </DashboardSideCard>

            <DashboardSideCard
              title="Notificações"
              icon={<Bell className="size-4" />}
              badge={
                data.unreadNotificationCount > 0 ? (
                  <span className="text-xs text-muted-foreground">{data.unreadNotificationCount} não lidas</span>
                ) : undefined
              }
            >
              <SecretaryNotificationsPanel notifications={data.notifications} />
            </DashboardSideCard>
          </ExecutiveRightColumn>
        </ExecutiveMainGrid>
      </div>
    </>
  );
}
