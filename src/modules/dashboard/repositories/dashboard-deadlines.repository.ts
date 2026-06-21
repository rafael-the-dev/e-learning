import { getDb } from "@/server/db";
import { findUpcomingEventsByOrganization } from "@/modules/academic-calendar/repositories/academic-event.repository";
import type { UpcomingDeadline } from "@/modules/dashboard/types";

const WINDOW_DAYS = 30;
const ROWS_PER_TYPE = 10;

export async function findUpcomingDeadlines(organizationId: string): Promise<UpcomingDeadline[]> {
  const db = await getDb();
  const now = new Date();
  const windowEnd = new Date(now.getTime() + WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const [assessments, installments, classGroups, academicEvents] = await Promise.all([
    db.assessment.findMany({
      where: {
        organizationId,
        deletedAt: null,
        status: { in: ["SCHEDULED", "OPEN"] },
        assessmentDate: { gte: now, lte: windowEnd },
      },
      select: { id: true, title: true, assessmentDate: true },
      orderBy: { assessmentDate: "asc" },
      take: ROWS_PER_TYPE,
    }),
    db.installment.findMany({
      where: {
        organizationId,
        status: { in: ["PENDING", "PARTIALLY_PAID"] },
        dueDate: { gte: now, lte: windowEnd },
      },
      select: { id: true, installmentNumber: true, dueDate: true, invoiceId: true },
      orderBy: { dueDate: "asc" },
      take: ROWS_PER_TYPE,
    }),
    db.classGroup.findMany({
      where: {
        organizationId,
        deletedAt: null,
        status: "ACTIVE",
        endDate: { gte: now, lte: windowEnd },
      },
      select: { id: true, name: true, endDate: true },
      orderBy: { endDate: "asc" },
      take: ROWS_PER_TYPE,
    }),
    findUpcomingEventsByOrganization(organizationId, 20),
  ]);

  const deadlines: UpcomingDeadline[] = [
    ...assessments.map((a) => ({
      id: a.id,
      type: "ASSESSMENT" as const,
      title: `Avaliação: ${a.title}`,
      date: a.assessmentDate,
      link: `/assessments/${a.id}`,
    })),
    ...installments.map((i) => ({
      id: i.id,
      type: "INSTALLMENT" as const,
      title: `Prestação ${i.installmentNumber} a vencer`,
      date: i.dueDate,
      link: `/invoices/${i.invoiceId}`,
    })),
    ...classGroups.map((cg) => ({
      id: cg.id,
      type: "CLASS_GROUP_END" as const,
      title: `Turma "${cg.name}" termina`,
      date: cg.endDate as Date,
      link: `/class-groups/${cg.id}`,
    })),
    ...academicEvents
      .filter((e) => e.startDate <= windowEnd)
      .map((e) => ({
        id: e.id,
        type: "ACADEMIC_EVENT" as const,
        title: e.title,
        date: e.startDate,
        link: `/academic-calendar`,
      })),
  ];

  return deadlines.sort((a, b) => a.date.getTime() - b.date.getTime());
}
