import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/shared/components/layout/page-header";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { requirePermissionOrRedirect } from "@/server/auth/context";
import { redirectIfStudentScoped } from "@/server/auth/student-scope";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getClassroomBookingById } from "@/modules/classrooms/services/classroom.service";
import {
  CLASSROOM_BOOKING_STATUS_LABELS,
} from "@/modules/classrooms/types";

export const metadata = { title: "Detalhe da Reserva" };

const DAY_LABELS: Record<string, string> = {
  MONDAY: "Segunda",
  TUESDAY: "Terça",
  WEDNESDAY: "Quarta",
  THURSDAY: "Quinta",
  FRIDAY: "Sexta",
  SATURDAY: "Sábado",
  SUNDAY: "Domingo",
};

export default async function ClassroomBookingDetailPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const context = await requirePermissionOrRedirect(PERMISSIONS.CLASSROOM_BOOKINGS_VIEW);
  // A student-scoped user is routed to their own /student Portal — never org-wide/other-student data. See student-scope.ts.
  await redirectIfStudentScoped(context);

  const { bookingId } = await params;
  const [booking, perms] = await Promise.all([
    getClassroomBookingById(bookingId, context.organizationId),
    getUserPermissions(context.userId, context.organizationId),
  ]);

  if (!booking) notFound();

  const ability = createAbility(perms);
  const canCancel = ability.can(PERMISSIONS.CLASSROOM_BOOKINGS_CANCEL);

  return (
    <>
      <PageHeader
        title="Reserva de Sala"
        description={`${booking.classroomCode} — ${booking.classroomName}`}
        actions={
          canCancel && booking.status !== "CANCELLED" ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/classroom-bookings`}>Voltar</Link>
            </Button>
          ) : undefined
        }
      />
      <div className="p-8">
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>Informação da Reserva</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-muted-foreground">Estado</dt>
                <dd className="mt-1">
                  <Badge variant={booking.status === "ACTIVE" ? "default" : "outline"}>
                    {CLASSROOM_BOOKING_STATUS_LABELS[booking.status] ?? booking.status}
                  </Badge>
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Sala</dt>
                <dd className="mt-1 font-medium">
                  <Link href={`/classrooms/${booking.classroomId}`} className="hover:underline">
                    {booking.classroomCode} – {booking.classroomName}
                  </Link>
                </dd>
              </div>
              {booking.classGroupName && (
                <div>
                  <dt className="text-muted-foreground">Turma</dt>
                  <dd className="mt-1">{booking.classGroupName}</dd>
                </div>
              )}
              {booking.scheduleSlotDay && (
                <div>
                  <dt className="text-muted-foreground">Horário</dt>
                  <dd className="mt-1">
                    {DAY_LABELS[booking.scheduleSlotDay] ?? booking.scheduleSlotDay}{" "}
                    {booking.scheduleSlotStart}–{booking.scheduleSlotEnd}
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-muted-foreground">Ano Letivo</dt>
                <dd className="mt-1">{booking.academicYearName}</dd>
              </div>
              {booking.academicTermName && (
                <div>
                  <dt className="text-muted-foreground">Período</dt>
                  <dd className="mt-1">{booking.academicTermName}</dd>
                </div>
              )}
              <div>
                <dt className="text-muted-foreground">Período da Reserva</dt>
                <dd className="mt-1">
                  {new Date(booking.startDate).toLocaleDateString("pt-PT")} →{" "}
                  {new Date(booking.endDate).toLocaleDateString("pt-PT")}
                </dd>
              </div>
              {booking.branchName && (
                <div>
                  <dt className="text-muted-foreground">Filial</dt>
                  <dd className="mt-1">{booking.branchName}</dd>
                </div>
              )}
              <div>
                <dt className="text-muted-foreground">Criado em</dt>
                <dd className="mt-1">{new Date(booking.createdAt).toLocaleDateString("pt-PT")}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
