import { getDb } from "@/server/db";

// =============================================================================
// DASHBOARD REPOSITORY
// All queries are scoped to organizationId — never called without it.
// =============================================================================

export async function getStudentCounts(organizationId: string) {
  const db = await getDb();
  const [total, active] = await Promise.all([
    db.student.count({ where: { organizationId, deletedAt: null } }),
    db.student.count({ where: { organizationId, status: "ACTIVE", deletedAt: null } }),
  ]);
  return { total, active };
}

export async function getActiveTeacherCount(organizationId: string) {
  const db = await getDb();
  return db.teacher.count({ where: { organizationId, status: "ACTIVE", deletedAt: null } });
}

export async function getActiveEnrollmentCount(organizationId: string) {
  const db = await getDb();
  return db.enrollment.count({ where: { organizationId, status: "ACTIVE", deletedAt: null } });
}

export async function getMonthlyRevenue(
  organizationId: string,
  startOfMonth: Date,
  startOfNextMonth: Date
) {
  const db = await getDb();
  const result = await db.payment.aggregate({
    _sum: { amount: true },
    where: {
      organizationId,
      status: "CONFIRMED",
      paymentDate: { gte: startOfMonth, lt: startOfNextMonth },
    },
  });
  return Number(result._sum.amount ?? 0);
}

export async function getPendingPaymentsCount(organizationId: string) {
  const db = await getDb();
  return db.invoice.count({
    where: {
      organizationId,
      status: { in: ["PENDING", "PARTIALLY_PAID"] },
      deletedAt: null,
    },
  });
}

export async function getClassesToday(organizationId: string, dayOfWeek: number) {
  const db = await getDb();
  // Counts ACTIVE class groups that have an assigned slot for today's day of week.
  const dayNames = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
  const dayName = dayNames[dayOfWeek] ?? "MONDAY";
  return db.classGroup.count({
    where: {
      organizationId,
      status: "ACTIVE",
      deletedAt: null,
      classGroupSchedules: {
        some: {
          deletedAt: null,
          scheduleSlot: { dayOfWeek: dayName, status: "ACTIVE" },
        },
      },
    },
  });
}

export async function getPracticalLessonsToday(
  organizationId: string,
  startOfToday: Date,
  endOfToday: Date
) {
  const db = await getDb();
  return db.practicalLesson.count({
    where: {
      organizationId,
      date: { gte: startOfToday, lt: endOfToday },
      status: { notIn: ["CANCELLED"] },
    },
  });
}

export async function getFinancialSummary(
  organizationId: string,
  startOfMonth: Date,
  startOfNextMonth: Date,
  startOfToday: Date,
  endOfToday: Date
) {
  const db = await getDb();
  const [pendingAgg, overdueAgg, todayPayments] = await Promise.all([
    db.invoice.aggregate({
      _sum: { total: true, paidAmount: true },
      where: {
        organizationId,
        status: { in: ["PENDING", "PARTIALLY_PAID"] },
        deletedAt: null,
      },
    }),
    db.invoice.aggregate({
      _sum: { total: true, paidAmount: true },
      where: { organizationId, status: "OVERDUE", deletedAt: null },
    }),
    db.payment.aggregate({
      _sum: { amount: true },
      where: {
        organizationId,
        status: "CONFIRMED",
        paymentDate: { gte: startOfToday, lt: endOfToday },
      },
    }),
  ]);
  return {
    pendingTotal: Number(pendingAgg._sum.total ?? 0),
    pendingPaidAmount: Number(pendingAgg._sum.paidAmount ?? 0),
    overdueTotal: Number(overdueAgg._sum.total ?? 0),
    overduePaidAmount: Number(overdueAgg._sum.paidAmount ?? 0),
    paymentsToday: Number(todayPayments._sum.amount ?? 0),
  };
}

export async function getRecentActivity(organizationId: string) {
  const db = await getDb();
  return db.auditLog.findMany({
    where: {
      organizationId,
      entity: { in: ["Student", "Enrollment", "Payment", "ClassGroup", "Teacher"] },
    },
    include: { actor: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
}

export async function getOperationalAlertCounts(
  organizationId: string,
  startOfToday: Date
) {
  const db = await getDb();
  const [
    overdueInvoicesCount,
    studentsWithoutEnrollmentCount,
    classesWithoutTeacherCount,
    practicalLessonsWithoutVehicleCount,
  ] = await Promise.all([
    db.invoice.count({ where: { organizationId, status: "OVERDUE", deletedAt: null } }),
    db.student.count({
      where: {
        organizationId,
        status: "ACTIVE",
        deletedAt: null,
        enrollments: { none: { status: "ACTIVE" } },
      },
    }),
    db.classGroup.count({
      where: {
        organizationId,
        status: { in: ["FORMING", "ACTIVE"] },
        deletedAt: null,
        teacherId: null,
      },
    }),
    db.practicalLesson.count({
      where: {
        organizationId,
        status: "SCHEDULED",
        date: { gte: startOfToday },
        vehicleId: null,
      },
    }),
  ]);
  return {
    overdueInvoicesCount,
    studentsWithoutEnrollmentCount,
    classesWithoutTeacherCount,
    practicalLessonsWithoutVehicleCount,
  };
}

export async function getOrgCurrencySymbol(organizationId: string): Promise<string> {
  const db = await getDb();
  const settings = await db.organizationSettings.findUnique({
    where: { organizationId },
    select: { currencySymbol: true },
  });
  return settings?.currencySymbol ?? "MT";
}
