import Link from "next/link";
import { ShieldOff } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { getPostLoginRedirect } from "@/app/login/actions";

export const metadata = { title: "Acesso Proibido" };

export default async function ForbiddenPage() {
  // "Voltar ao início" must point at a page the current user can actually open.
  // /dashboard is ORG_ADMIN-role-gated, so a scoped user (teacher/student/
  // guardian/secretary) sent there would bounce straight back to /forbidden.
  // Reuse the same role-aware resolution the post-login redirect uses.
  const homeHref = await getPostLoginRedirect();

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm text-center space-y-6">
        <div className="flex justify-center">
          <div className="size-14 rounded-2xl bg-destructive/10 flex items-center justify-center">
            <ShieldOff className="size-7 text-destructive" />
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-xl font-semibold">Acesso Proibido</h1>
          <p className="text-sm text-muted-foreground">
            Não tem permissão para aceder a esta página.
            Contacte o administrador da sua organização se acredita que isto é um erro.
          </p>
        </div>

        <Button asChild variant="outline" className="w-full">
          <Link href={homeHref}>Voltar ao início</Link>
        </Button>
      </div>
    </div>
  );
}
