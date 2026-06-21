import { getDb } from "@/server/db";
import type { ActivityFeedEventType, ActivityFeedItem } from "@/modules/dashboard/types";

// =============================================================================
// DASHBOARD ACTIVITY FEED REPOSITORY
// StudentTimelineEvent already covers most of the events the spec lists
// (matrícula criada, pagamento recebido, factura emitida, avaliação publicada,
// aluno aprovado/reprovado) — read org-wide here instead of per-student
// (student-timeline.repository.ts's functions are all studentId-scoped).
// "Refund concluído" and "progressão de nível" have no StudentTimelineEvent
// entry type (see types/index.ts in that module), so they're read directly
// from Refund and StudentLevelProgress and merged in.
// =============================================================================

const FEED_LIMIT = 50;

const TIMELINE_TYPE_MAP: Record<string, ActivityFeedEventType> = {
  ENROLLMENT_CREATED: "ENROLLMENT_CREATED",
  PAYMENT_CONFIRMED: "PAYMENT_CONFIRMED",
  INVOICE_CREATED: "INVOICE_CREATED",
  INVOICE_PAID: "INVOICE_PAID",
  ASSESSMENT_RESULTS_PUBLISHED: "ASSESSMENT_RESULTS_PUBLISHED",
  SUBJECT_PASSED: "SUBJECT_PASSED",
  SUBJECT_FAILED: "SUBJECT_FAILED",
};

export async function findOrgActivityFeed(organizationId: string): Promise<ActivityFeedItem[]> {
  const db = await getDb();

  const [timelineRows, refundRows, promotionRows] = await Promise.all([
    db.studentTimelineEvent.findMany({
      where: { organizationId, deletedAt: null, eventType: { in: Object.keys(TIMELINE_TYPE_MAP) } },
      select: {
        id: true,
        eventType: true,
        title: true,
        occurredAt: true,
        actorUserId: true,
        student: { select: { firstName: true, lastName: true } },
      },
      orderBy: { occurredAt: "desc" },
      take: FEED_LIMIT,
    }),
    db.refund.findMany({
      where: { organizationId, deletedAt: null, status: "COMPLETED", completedAt: { not: null } },
      select: {
        id: true,
        refundNumber: true,
        completedAt: true,
        student: { select: { firstName: true, lastName: true } },
      },
      orderBy: { completedAt: "desc" },
      take: FEED_LIMIT,
    }),
    db.studentLevelProgress.findMany({
      where: {
        organizationId,
        status: { in: ["PROMOTED", "PROMOTED_WITH_PENDING_SUBJECTS"] },
        completedAt: { not: null },
      },
      select: {
        id: true,
        completedAt: true,
        student: { select: { firstName: true, lastName: true } },
        courseLevel: { select: { name: true } },
      },
      orderBy: { completedAt: "desc" },
      take: FEED_LIMIT,
    }),
  ]);

  const actorIds = [...new Set(timelineRows.map((r) => r.actorUserId).filter((id): id is string => !!id))];
  const actors = actorIds.length
    ? await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })
    : [];
  const actorNameById = new Map(actors.map((a) => [a.id, a.name]));

  const items: ActivityFeedItem[] = [
    ...timelineRows.map((r) => ({
      id: r.id,
      eventType: TIMELINE_TYPE_MAP[r.eventType] ?? "ENROLLMENT_CREATED",
      title: r.title,
      studentName: `${r.student.firstName} ${r.student.lastName}`,
      actorName: r.actorUserId ? actorNameById.get(r.actorUserId) ?? null : null,
      occurredAt: r.occurredAt,
    })),
    ...refundRows.map((r) => ({
      id: r.id,
      eventType: "REFUND_COMPLETED" as ActivityFeedEventType,
      title: `Reembolso ${r.refundNumber} concluído`,
      studentName: r.student ? `${r.student.firstName} ${r.student.lastName}` : null,
      actorName: null,
      occurredAt: r.completedAt as Date,
    })),
    ...promotionRows.map((r) => ({
      id: r.id,
      eventType: "LEVEL_PROMOTED" as ActivityFeedEventType,
      title: `Progressão para ${r.courseLevel.name}`,
      studentName: `${r.student.firstName} ${r.student.lastName}`,
      actorName: null,
      occurredAt: r.completedAt as Date,
    })),
  ];

  return items
    .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
    .slice(0, FEED_LIMIT);
}
