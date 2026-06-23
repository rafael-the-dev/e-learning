import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/shared/components/layout/page-header";
import { Button } from "@/shared/components/ui/button";
import { StatusBadge } from "@/shared/components/data/status-badge";
import { Separator } from "@/shared/components/ui/separator";
import { requirePermissionOrRedirect } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getUserInOrganization } from "@/modules/users/services/user.service";
import { NotFoundError } from "@/shared/lib/command";
import { ROLE_LABELS } from "@/modules/users/types";
import { UserDetailActions } from "@/modules/users/components/user-detail-actions";
import {
  Mail,
  Phone,
  Calendar,
  Shield,
  Pencil,
} from "lucide-react";

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const context = await requirePermissionOrRedirect(PERMISSIONS.USERS_READ);

  const { userId } = await params;

  let user;
  try {
    user = await getUserInOrganization(userId, context.organizationId);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }

  const role = user.roles[0];

  const breadcrumb = (
    <nav className="flex items-center gap-2 text-muted-foreground">
      <Link href="/users" className="hover:text-foreground transition-colors">
        Utilizadores
      </Link>
      <span>/</span>
      <span className="text-foreground">{user.name}</span>
    </nav>
  );

  return (
    <>
      <PageHeader
        title={user.name}
        description={user.email}
        breadcrumb={breadcrumb}
        actions={
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`/users/${user.id}/edit`}>
                <Pencil className="size-4 mr-1.5" />
                Editar
              </Link>
            </Button>
            <UserDetailActions user={user} />
          </div>
        }
      />

      <div className="p-8 space-y-6 max-w-2xl">
        {/* Status row */}
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={user.isActive ? "ACTIVE" : "DISABLED"} />
          {role && (
            <span className="text-sm border rounded-full px-2.5 py-0.5">
              {ROLE_LABELS[role.name] ?? role.name}
            </span>
          )}
          {user.isOwner && (
            <span className="text-sm border rounded-full px-2.5 py-0.5 flex items-center gap-1">
              <Shield className="size-3" />
              Proprietário
            </span>
          )}
        </div>

        <Separator />

        {/* Details */}
        <div className="rounded-xl border p-5 space-y-4">
          <h3 className="text-sm font-semibold">Informações de Contacto</h3>
          <dl className="space-y-2 text-sm">
            <DetailRow
              icon={<Mail className="size-3.5" />}
              label="E-mail"
              value={user.email}
            />
            <DetailRow
              icon={<Phone className="size-3.5" />}
              label="Telefone"
              value={user.phone ?? "—"}
            />
          </dl>
        </div>

        <div className="rounded-xl border p-5 space-y-4">
          <h3 className="text-sm font-semibold">Membro da Organização</h3>
          <dl className="space-y-2 text-sm">
            <DetailRow
              icon={<Calendar className="size-3.5" />}
              label="Adicionado a"
              value={new Date(user.joinedAt).toLocaleDateString("pt-PT")}
            />
            <DetailRow
              icon={<Calendar className="size-3.5" />}
              label="Último acesso"
              value={
                user.lastLoginAt
                  ? new Date(user.lastLoginAt).toLocaleDateString("pt-PT")
                  : "Nunca"
              }
            />
          </dl>
        </div>
      </div>
    </>
  );
}

function DetailRow({
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
      <dt className="w-28 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
