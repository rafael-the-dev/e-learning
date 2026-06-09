import { redirect } from "next/navigation";
import { PageHeader } from "@/shared/components/layout/page-header";
import { requirePermission } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { ClassroomBookingForm } from "@/modules/classrooms/components/classroom-booking-form";
import { getDb } from "@/server/db";
import type { AuthContext } from "@/server/auth/context";

export const metadata = { title: "Nova Reserva de Sala" };

export default async function NewClassroomBookingPage() {
  let context: AuthContext;
  try {
    context = await requirePermission(PERMISSIONS.CLASSROOM_BOOKINGS_CREATE);
  } catch {
    redirect("/forbidden");
  }

  const db = await getDb();

  const [classrooms, classGroups, scheduleSlots, academicYears, academicTerms] = await Promise.all([
    db.classroom.findMany({
      where: { organizationId: context.organizationId, deletedAt: null, status: "ACTIVE" },
      select: { id: true, name: true, code: true, capacity: true, classroomType: true },
      orderBy: [{ code: "asc" }],
    }),
    db.classGroup.findMany({
      where: { organizationId: context.organizationId, deletedAt: null, status: { notIn: ["CANCELLED", "ARCHIVED"] } },
      select: { id: true, name: true, capacity: true },
      orderBy: [{ name: "asc" }],
    }),
    db.scheduleSlot.findMany({
      where: { organizationId: context.organizationId, deletedAt: null, status: "ACTIVE" },
      select: {
        id: true,
        dayOfWeek: true,
        startTime: true,
        endTime: true,
        schedulePeriod: { select: { name: true } },
      },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    }),
    db.academicYear.findMany({
      where: { organizationId: context.organizationId, deletedAt: null, status: "ACTIVE" },
      select: { id: true, name: true },
      orderBy: { startDate: "desc" },
    }),
    db.academicTerm.findMany({
      where: { organizationId: context.organizationId, deletedAt: null, status: "ACTIVE" },
      select: { id: true, name: true, academicYearId: true },
      orderBy: [{ academicYearId: "asc" }, { order: "asc" }],
    }),
  ]);

  const formattedSlots = scheduleSlots.map((s) => ({
    id: s.id,
    dayOfWeek: s.dayOfWeek,
    startTime: s.startTime,
    endTime: s.endTime,
    periodName: s.schedulePeriod.name,
  }));

  return (
    <>
      <PageHeader title="Nova Reserva" description="Reservar uma sala para uma turma." />
      <div className="p-8">
        <ClassroomBookingForm
          classrooms={classrooms}
          classGroups={classGroups}
          scheduleSlots={formattedSlots}
          academicYears={academicYears}
          academicTerms={academicTerms}
        />
      </div>
    </>
  );
}
