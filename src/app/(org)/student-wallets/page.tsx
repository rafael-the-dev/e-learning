import { redirect } from "next/navigation";
import { PageHeader } from "@/shared/components/layout/page-header";
import { requirePermission } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getWalletsByOrganization } from "@/modules/wallets/services/wallet.service";
import { WalletsTable } from "@/modules/wallets/components/wallets-table";
import { normalizePaginationParams } from "@/shared/lib/pagination";
import type { AuthContext } from "@/server/auth/context";

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
  let context: AuthContext;
  try {
    context = await requirePermission(PERMISSIONS.WALLETS_VIEW);
  } catch {
    redirect("/forbidden");
  }

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
