import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/shared/components/layout/page-header";
import { StatCard } from "@/shared/components/layout/stat-card";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { requirePermissionOrRedirect } from "@/server/auth/context";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import {
  getAcademicYearById,
  getAcademicTermsByOrganization,
} from "@/modules/academic-calendar/services/academic-calendar.service";
import { AcademicTermsTable } from "@/modules/academic-calendar/components/academic-terms-table";
import { getAllAcademicYears } from "@/modules/academic-calendar/services/academic-calendar.service";
import { normalizePaginationParams } from "@/shared/lib/pagination";
import { ACADEMIC_STATUS_LABELS } from "@/modules/academic-calendar/types";
import { ArrowLeft } from "lucide-react";

export const metadata = { title: "Detalhe do Ano Letivo" };

export default async function AcademicYearDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ academicYearId: string }>;
  searchParams: Promise<{ page?: string; search?: string; status?: string }>;
}) {
  const context = await requirePermissionOrRedirect(PERMISSIONS.ACADEMIC_CALENDAR_VIEW);

  const { academicYearId } = await params;
  const sp = await searchParams;
  const pagination = normalizePaginationParams(sp.page);

  const year = await getAcademicYearById(academicYearId, context.organizationId).catch(() => null);
  if (!year) notFound();

  const perms = await getUserPermissions(context.userId, context.organizationId);
  const ability = createAbility(perms);

  const [termsResult, allYears] = await Promise.all([
    getAcademicTermsByOrganization(context.organizationId, {
      ...pagination,
      academicYearId,
      search: sp.search,
      status: sp.status,
    }),
    getAllAcademicYears(context.organizationId),
  ]);

  const activeTerms = termsResult.data.filter((t) => t.status === "ACTIVE").length;

  return (
    <>
      <PageHeader
        title={year.name}
        description={`${new Date(year.startDate).toLocaleDateString("pt-PT")} — ${new Date(year.endDate).toLocaleDateString("pt-PT")}`}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/academic-calendar/years">
              <ArrowLeft className="size-4 mr-1.5" />
              Voltar
            </Link>
          </Button>
        }
      />

      <div className="p-8 space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="outline">
            {ACADEMIC_STATUS_LABELS[year.status] ?? year.status}
          </Badge>
          {year.isDefault && (
            <Badge>Predefinido</Badge>
          )}
          <span className="text-sm text-muted-foreground font-mono">{year.code}</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard title="Total de Períodos" value={termsResult.total} />
          <StatCard title="Períodos Ativos" value={activeTerms} />
          <StatCard
            title="Início"
            value={new Date(year.startDate).toLocaleDateString("pt-PT")}
          />
          <StatCard
            title="Fim"
            value={new Date(year.endDate).toLocaleDateString("pt-PT")}
          />
        </div>

        <h2 className="text-base font-semibold">Períodos Letivos</h2>

        <AcademicTermsTable
          result={termsResult}
          years={allYears}
          defaultSearch={sp.search}
          defaultStatus={sp.status}
          defaultYearId={academicYearId}
          canCreate={ability.can(PERMISSIONS.ACADEMIC_TERMS_CREATE)}
          canEdit={ability.can(PERMISSIONS.ACADEMIC_TERMS_UPDATE)}
          canArchive={ability.can(PERMISSIONS.ACADEMIC_TERMS_ARCHIVE)}
          canDelete={ability.can(PERMISSIONS.ACADEMIC_TERMS_DELETE)}
          showYear={false}
        />
      </div>
    </>
  );
}
