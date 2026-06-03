import * as React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/shared/components/layout/page-header";
import { StatCard } from "@/shared/components/layout/stat-card";
import { StatusBadge } from "@/shared/components/data/status-badge";
import { BranchesTable } from "@/modules/organizations/components/branches-table";
import { SettingsForm } from "@/modules/organizations/components/settings-form";
import { OrgDetailActions } from "@/modules/organizations/components/org-detail-actions";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/shared/components/ui/tabs";
import { Separator } from "@/shared/components/ui/separator";
import { getOrganizationWithDetails } from "@/modules/organizations/services/organization.service";
import { GitBranch, Mail, Phone, MapPin, Globe, Calendar } from "lucide-react";

export default async function OrganizationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab = "overview" } = await searchParams;

  let details;
  try {
    details = await getOrganizationWithDetails(id);
  } catch {
    notFound();
  }

  const { organization: org, branches, settings, branchCount } = details;

  const breadcrumb = (
    <nav className="flex items-center gap-2 text-muted-foreground">
      <Link href="/organizations" className="hover:text-foreground transition-colors">
        Organizações
      </Link>
      <span>/</span>
      <span className="text-foreground">{org.name}</span>
    </nav>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={org.name}
        description={`/${org.slug}`}
        breadcrumb={breadcrumb}
        actions={<OrgDetailActions organization={org} />}
      />

      {/* Summary row */}
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <StatusBadge status={org.status} />
        <span className="capitalize border rounded-full px-2.5 py-0.5 text-xs">{org.plan.toLowerCase()}</span>
        {org.email && (
          <span className="flex items-center gap-1.5">
            <Mail className="size-3.5" />
            {org.email}
          </span>
        )}
        {org.phone && (
          <span className="flex items-center gap-1.5">
            <Phone className="size-3.5" />
            {org.phone}
          </span>
        )}
        {org.timezone && (
          <span className="flex items-center gap-1.5">
            <Globe className="size-3.5" />
            {org.timezone}
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <Calendar className="size-3.5" />
          Criado a {new Date(org.createdAt).toLocaleDateString("pt-PT")}
        </span>
      </div>

      <Separator />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          title="Filiais"
          value={branchCount}
          icon={<GitBranch className="size-4" />}
        />
        <StatCard title="Alunos" value="—" />
        <StatCard title="Formadores" value="—" />
        <StatCard title="Matrículas Ativas" value="—" />
      </div>

      {/* Tabs */}
      <Tabs defaultValue={tab}>
        <TabsList>
          <TabsTrigger value="overview">
            <Link href={`/organizations/${id}?tab=overview`} className="contents">
              Resumo
            </Link>
          </TabsTrigger>
          <TabsTrigger value="branches">
            <Link href={`/organizations/${id}?tab=branches`} className="contents">
              Filiais ({branchCount})
            </Link>
          </TabsTrigger>
          <TabsTrigger value="settings">
            <Link href={`/organizations/${id}?tab=settings`} className="contents">
              Configurações
            </Link>
          </TabsTrigger>
        </TabsList>

        {/* Overview tab */}
        <TabsContent value="overview">
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="rounded-xl border p-5 space-y-4">
              <h3 className="text-sm font-semibold">Informações de Contacto</h3>
              <dl className="space-y-2 text-sm">
                <InfoRow icon={<Mail className="size-3.5" />} label="E-mail" value={org.email ?? "—"} />
                <InfoRow icon={<Phone className="size-3.5" />} label="Telefone" value={org.phone ?? "—"} />
                <InfoRow icon={<MapPin className="size-3.5" />} label="Morada" value={org.address ?? "—"} />
              </dl>
            </div>
            <div className="rounded-xl border p-5 space-y-4">
              <h3 className="text-sm font-semibold">Configuração</h3>
              <dl className="space-y-2 text-sm">
                <InfoRow label="Fuso Horário" value={org.timezone} />
                <InfoRow label="Localidade" value={org.locale} />
                <InfoRow label="Plano" value={org.plan} />
                <InfoRow
                  label="Moeda"
                  value={
                    settings
                      ? `${settings.currencyCode} (${settings.currencySymbol})`
                      : "Não configurado"
                  }
                />
              </dl>
            </div>
          </div>
        </TabsContent>

        {/* Branches tab */}
        <TabsContent value="branches">
          <BranchesTable branches={branches} organizationId={id} />
        </TabsContent>

        {/* Settings tab */}
        <TabsContent value="settings">
          <div className="max-w-2xl">
            <SettingsForm organizationId={id} settings={settings} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2">
      {icon && <span className="mt-0.5 text-muted-foreground">{icon}</span>}
      <dt className="w-24 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
