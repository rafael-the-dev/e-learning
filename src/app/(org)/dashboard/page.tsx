import { redirect } from "next/navigation";
import { PageHeader } from "@/shared/components/layout/page-header";
import { Button } from "@/shared/components/ui/button";
import { requireRole } from "@/server/auth/context";
import { SYSTEM_ROLES } from "@/server/auth/permissions";
import { getDashboardData } from "@/modules/dashboard/services/dashboard.service";
import { DashboardStatCards } from "@/modules/dashboard/components/dashboard-stat-cards";
import { RecentActivity } from "@/modules/dashboard/components/recent-activity";
import { FinancialOverview } from "@/modules/dashboard/components/financial-overview";
import { OperationalAlerts } from "@/modules/dashboard/components/operational-alerts";
import type { AuthContext } from "@/server/auth/context";
import { UserPlus, BookOpen, CreditCard, CalendarPlus } from "lucide-react";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  let context: AuthContext;

  try {
    context = await requireRole(SYSTEM_ROLES.ORG_ADMIN);
  } catch {
    redirect("/forbidden");
  }

  const data = await getDashboardData(context.organizationId);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Visão operacional da organização."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled>
              <UserPlus className="size-4 mr-1.5" />
              Novo Aluno
            </Button>
            <Button variant="outline" size="sm" disabled>
              <BookOpen className="size-4 mr-1.5" />
              Nova Matrícula
            </Button>
            <Button variant="outline" size="sm" disabled>
              <CreditCard className="size-4 mr-1.5" />
              Registar Pagamento
            </Button>
            <Button variant="outline" size="sm" disabled>
              <CalendarPlus className="size-4 mr-1.5" />
              Criar Turma
            </Button>
          </div>
        }
      />

      <div className="p-8 space-y-6">
        <DashboardStatCards
          stats={data.stats}
          currencySymbol={data.financialOverview.currencySymbol}
        />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <RecentActivity items={data.recentActivity} />
          </div>
          <div className="flex flex-col gap-6">
            <FinancialOverview data={data.financialOverview} />
            <OperationalAlerts data={data.operationalAlerts} />
          </div>
        </div>
      </div>
    </>
  );
}
