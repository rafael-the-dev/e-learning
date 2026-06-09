import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/shared/components/layout/page-header";
import { Separator } from "@/shared/components/ui/separator";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { requirePermission } from "@/server/auth/context";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getStudentById } from "@/modules/students/services/student.service";
import { getStudentTimeline } from "@/modules/student-timeline/services/student-timeline.service";
import { TimelineList } from "@/modules/student-timeline/components/timeline-list";
import { TimelineFilters } from "@/modules/student-timeline/components/timeline-filters";
import { AddNoteButton } from "@/modules/student-timeline/components/add-note-button";
import { NotFoundError } from "@/shared/lib/command";
import { ChevronLeft, ChevronRight, History } from "lucide-react";
import type { AuthContext } from "@/server/auth/context";
import type { TimelineEventType, TimelineReferenceType } from "@/modules/student-timeline/types";

export const metadata = { title: "Timeline do Aluno" };

export default async function StudentTimelinePage({
  params,
  searchParams,
}: {
  params: Promise<{ studentId: string }>;
  searchParams: Promise<{
    search?: string;
    eventType?: string;
    referenceType?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
}) {
  let context: AuthContext;
  try {
    context = await requirePermission(PERMISSIONS.STUDENT_TIMELINE_VIEW);
  } catch {
    redirect("/forbidden");
  }

  const { studentId } = await params;

  let student;
  try {
    student = await getStudentById(studentId, context.organizationId);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }

  const perms = await getUserPermissions(context.userId, context.organizationId);
  const ability = createAbility(perms);
  const canCreateNote = ability.can(PERMISSIONS.STUDENT_TIMELINE_CREATE_NOTE);
  const canDeleteNote = ability.can(PERMISSIONS.STUDENT_TIMELINE_DELETE_NOTE);

  const sp = await searchParams;
  const { search, eventType, referenceType, from, to, page } = sp;
  const currentPage = Math.max(1, Number(page) || 1);
  const PAGE_SIZE = 30;

  const { events, total } = await getStudentTimeline(studentId, context.organizationId, {
    search: search || undefined,
    eventType: eventType ? [eventType as TimelineEventType] : undefined,
    referenceType: referenceType ? [referenceType as TimelineReferenceType] : undefined,
    from: from ? new Date(from) : undefined,
    to: to ? new Date(`${to}T23:59:59.999Z`) : undefined,
    page: currentPage,
    pageSize: PAGE_SIZE,
  });

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const breadcrumb = (
    <nav className="flex items-center gap-2 text-muted-foreground text-sm">
      <Link href="/students" className="hover:text-foreground transition-colors">
        Alunos
      </Link>
      <span>/</span>
      <Link href={`/students/${studentId}`} className="hover:text-foreground transition-colors">
        {student.fullName}
      </Link>
      <span>/</span>
      <span className="text-foreground">Timeline</span>
    </nav>
  );

  return (
    <>
      <PageHeader
        title="Timeline"
        description={`Histórico de eventos de ${student.fullName}`}
        breadcrumb={breadcrumb}
        actions={
          canCreateNote ? <AddNoteButton studentId={studentId} /> : undefined
        }
      />

      <div className="p-8 space-y-6 max-w-3xl">
        {/* Filters */}
        <Suspense>
          <TimelineFilters />
        </Suspense>

        {/* Count badge */}
        <div className="flex items-center gap-2">
          <History className="size-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            {total === 0
              ? "Nenhum evento encontrado"
              : total === 1
              ? "1 evento"
              : `${total} eventos`}
          </span>
          {(search || eventType || referenceType || from || to) && (
            <Badge variant="secondary" className="text-xs">
              Filtros aplicados
            </Badge>
          )}
        </div>

        <Separator />

        {/* Timeline */}
        <TimelineList
          events={events}
          canDelete={canDeleteNote}
        />

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-4">
            <span className="text-sm text-muted-foreground">
              Página {currentPage} de {totalPages}
            </span>
            <div className="flex items-center gap-2">
              {currentPage > 1 && (
                <Button asChild variant="outline" size="sm">
                  <Link
                    href={`/students/${studentId}/timeline?${buildPageParams(sp, currentPage - 1)}`}
                  >
                    <ChevronLeft className="size-4 mr-1" />
                    Anterior
                  </Link>
                </Button>
              )}
              {currentPage < totalPages && (
                <Button asChild variant="outline" size="sm">
                  <Link
                    href={`/students/${studentId}/timeline?${buildPageParams(sp, currentPage + 1)}`}
                  >
                    Seguinte
                    <ChevronRight className="size-4 ml-1" />
                  </Link>
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function buildPageParams(
  sp: Record<string, string | undefined>,
  page: number
): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp ?? {})) {
    if (k !== "page" && v) params.set(k, v);
  }
  params.set("page", String(page));
  return params.toString();
}
