import * as React from "react";
import { PageHeader } from "@/shared/components/layout/page-header";
import { StatCard } from "@/shared/components/layout/stat-card";
import { Button } from "@/shared/components/ui/button";
import { OrganizationsTable } from "@/modules/organizations/components/organizations-table";
import { CreateOrganizationFormTrigger } from "@/modules/organizations/components/create-org-trigger";
import {
  getOrganizations,
  getAdminStats,
} from "@/modules/organizations/services/organization.service";
import { normalizePaginationParams } from "@/shared/lib/pagination";
import { Building2, CheckCircle, PauseCircle, Clock } from "lucide-react";

export const metadata = { title: "Organizações" };

export default async function OrganizationsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string; status?: string }>;
}) {
  const { page, search, status } = await searchParams;
  const pagination = normalizePaginationParams(page);

  const [result, stats] = await Promise.all([
    getOrganizations({ ...pagination, search, status }),
    getAdminStats(),
  ]);

  return (
    <>
      <PageHeader
        title="Organizações"
        description="Gerir todas as escolas e centros de formação na plataforma."
        actions={<CreateOrganizationFormTrigger />}
      />

      <div className="p-8 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard
            title="Total"
            value={stats.total}
            icon={<Building2 className="size-4" />}
          />
          <StatCard
            title="Ativas"
            value={stats.byStatus["ACTIVE"] ?? 0}
            icon={<CheckCircle className="size-4" />}
          />
          <StatCard
            title="Experimentais"
            value={stats.byStatus["TRIAL"] ?? 0}
            icon={<Clock className="size-4" />}
          />
          <StatCard
            title="Suspensas"
            value={stats.byStatus["SUSPENDED"] ?? 0}
            icon={<PauseCircle className="size-4" />}
          />
        </div>

        <OrganizationsTable
          result={result}
          defaultSearch={search}
          defaultStatus={status}
        />
      </div>
    </>
  );
}
