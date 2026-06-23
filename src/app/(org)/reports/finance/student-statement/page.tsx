import Link from "next/link";
import { ChevronLeft, Search } from "lucide-react";
import { redirect } from "next/navigation";
import { PageHeader } from "@/shared/components/layout/page-header";
import { Button } from "@/shared/components/ui/button";
import { requirePermissionOrRedirect } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getDb } from "@/server/db";

export const metadata = { title: "Extrato Financeiro do Aluno" };

async function searchStudents(organizationId: string, search: string) {
  if (!search || search.length < 2) return [];
  const db = await getDb();
  return db.student.findMany({
    where: {
      organizationId,
      deletedAt: null,
      OR: [
        { firstName: { contains: search } },
        { lastName: { contains: search } },
        { code: { contains: search } },
      ],
    },
    select: { id: true, firstName: true, lastName: true, code: true },
    take: 20,
    orderBy: [{ firstName: "asc" }],
  });
}

export default async function StudentStatementPickerPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const context = await requirePermissionOrRedirect(PERMISSIONS.FINANCIAL_REPORTS_STUDENT_STATEMENT);

  // If studentId is provided directly, redirect
  if (searchParams.studentId) {
    redirect(`/reports/finance/student-statement/${searchParams.studentId}`);
  }

  const search = searchParams.search ?? "";
  const students = await searchStudents(context.organizationId, search);

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Extrato Financeiro do Aluno"
        description="Selecione um aluno para visualizar o extrato financeiro completo."
        breadcrumb={
          <Link href="/reports/finance" className="flex items-center gap-1 text-muted-foreground hover:text-foreground text-xs">
            <ChevronLeft className="size-3" /> Relatórios Financeiros
          </Link>
        }
      />
      <div className="p-8 space-y-6 max-w-xl">
        <form method="GET" className="flex gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input
              type="text"
              name="search"
              defaultValue={search}
              placeholder="Nome ou código do aluno..."
              className="w-full h-9 rounded-md border border-input bg-background pl-9 pr-3 text-sm"
              autoFocus
            />
          </div>
          <Button type="submit" size="sm">Pesquisar</Button>
        </form>

        {search.length >= 2 && students.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum aluno encontrado para &ldquo;{search}&rdquo;.</p>
        )}

        {students.length > 0 && (
          <div className="rounded-lg border divide-y">
            {students.map((s) => (
              <Link
                key={s.id}
                href={`/reports/finance/student-statement/${s.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium">{s.firstName} {s.lastName}</p>
                  {s.code && <p className="text-xs text-muted-foreground">{s.code}</p>}
                </div>
                <ChevronLeft className="size-4 rotate-180 text-muted-foreground" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
