import { PageHeader } from "@/shared/components/layout/page-header";
import { requirePermissionOrRedirect } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getWalletsByOrganization } from "@/modules/wallets/services/wallet.service";
import { WalletsTable } from "@/modules/wallets/components/wallets-table";
import { normalizePaginationParams } from "@/shared/lib/pagination";

export const metadata = { title: "Carteiras de Alunos" };

interface SearchParams {
  page?: string;
  search?: string;
  status?: string;
}

export default async function StudentWalletsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await requirePermissionOrRedirect(PERMISSIONS.WALLETS_VIEW);

  const sp = await searchParams;
  const pagination = normalizePaginationParams(sp.page);

  const result = await getWalletsByOrganization(context.organizationId, {
    ...pagination,
    search: sp.search,
    status: sp.status,
  });

  return (
    <>
      <PageHeader
        title="Carteiras de Alunos"
        description="Gerir saldos, depósitos e créditos dos alunos"
      />
      <div className="p-8">
        <WalletsTable
          result={result}
          defaultSearch={sp.search}
          defaultStatus={sp.status}
        />
      </div>
    </>
  );
}
