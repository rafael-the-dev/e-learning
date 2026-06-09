import { getDb } from "@/server/db";
import { buildSkipTake, buildPaginationMeta } from "@/shared/lib/pagination";
import type { PaginatedResult, PaginationParams } from "@/shared/types/common";
import type { ClassroomBooking } from "@/modules/classrooms/types";

// =============================================================================
// CLASSROOM BOOKING REPOSITORY
// =============================================================================

export interface ListClassroomBookingsParams extends PaginationParams {
  classroomId?: string;
  classGroupId?: string;
  academicYearId?: string;
  academicTermId?: string;
  branchId?: string;
  status?: string;
}

const bookingSelect = {
  id: true,
  organizationId: true,
  branchId: true,
  classroomId: true,
  classGroupId: true,
  scheduleSlotId: true,
  academicYearId: true,
  academicTermId: true,
  startDate: true,
  endDate: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  createdBy: true,
  classroom: { select: { id: true, name: true, code: true } },
  classGroup: { select: { id: true, name: true } },
  branch: { select: { id: true, name: true } },
  academicYear: { select: { id: true, name: true } },
  academicTerm: { select: { id: true, name: true } },
  scheduleSlot: { select: { id: true, dayOfWeek: true, startTime: true, endTime: true } },
} as const;

function mapToBooking(row: {
  id: string;
  organizationId: string;
  branchId: string | null;
  classroomId: string;
  classGroupId: string | null;
  scheduleSlotId: string | null;
  academicYearId: string;
  academicTermId: string | null;
  startDate: Date;
  endDate: Date;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  createdBy: string | null;
  classroom: { id: string; name: string; code: string };
  classGroup: { id: string; name: string } | null;
  branch: { id: string; name: string } | null;
  academicYear: { id: string; name: string };
  academicTerm: { id: string; name: string } | null;
  scheduleSlot: { id: string; dayOfWeek: string; startTime: string; endTime: string } | null;
}): ClassroomBooking {
  return {
    id: row.id,
    organizationId: row.organizationId,
    branchId: row.branchId,
    classroomId: row.classroomId,
    classGroupId: row.classGroupId,
    scheduleSlotId: row.scheduleSlotId,
    academicYearId: row.academicYearId,
    academicTermId: row.academicTermId,
    startDate: row.startDate,
    endDate: row.endDate,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
    createdBy: row.createdBy,
    classroomName: row.classroom.name,
    classroomCode: row.classroom.code,
    classGroupName: row.classGroup?.name ?? null,
    branchName: row.branch?.name ?? null,
    academicYearName: row.academicYear.name,
    academicTermName: row.academicTerm?.name ?? null,
    scheduleSlotDay: row.scheduleSlot?.dayOfWeek ?? null,
    scheduleSlotStart: row.scheduleSlot?.startTime ?? null,
    scheduleSlotEnd: row.scheduleSlot?.endTime ?? null,
  };
}

export async function findBookingsByOrganization(
  organizationId: string,
  params: ListClassroomBookingsParams
): Promise<PaginatedResult<ClassroomBooking>> {
  const db = await getDb();
  const { skip, take } = buildSkipTake(params);

  const where = {
    organizationId,
    deletedAt: null,
    ...(params.classroomId && { classroomId: params.classroomId }),
    ...(params.classGroupId && { classGroupId: params.classGroupId }),
    ...(params.academicYearId && { academicYearId: params.academicYearId }),
    ...(params.academicTermId && { academicTermId: params.academicTermId }),
    ...(params.branchId && { branchId: params.branchId }),
    ...(params.status && { status: params.status }),
  };

  const [rows, total] = await Promise.all([
    db.classroomBooking.findMany({ where, select: bookingSelect, skip, take, orderBy: [{ startDate: "desc" }] }),
    db.classroomBooking.count({ where }),
  ]);

  return buildPaginationMeta(rows.map(mapToBooking), total, params);
}

export async function findBookingById(
  id: string,
  organizationId: string
): Promise<ClassroomBooking | null> {
  const db = await getDb();
  const row = await db.classroomBooking.findFirst({
    where: { id, organizationId, deletedAt: null },
    select: bookingSelect,
  });
  return row ? mapToBooking(row) : null;
}

export async function findConflictingBookings(
  classroomId: string,
  startDate: Date,
  endDate: Date,
  excludeId?: string
): Promise<ClassroomBooking[]> {
  const db = await getDb();
  const rows = await db.classroomBooking.findMany({
    where: {
      classroomId,
      deletedAt: null,
      status: { in: ["ACTIVE"] },
      startDate: { lte: endDate },
      endDate: { gte: startDate },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: bookingSelect,
  });
  return rows.map(mapToBooking);
}

export async function createClassroomBooking(data: {
  organizationId: string;
  branchId?: string | null;
  classroomId: string;
  classGroupId?: string | null;
  scheduleSlotId?: string | null;
  academicYearId: string;
  academicTermId?: string | null;
  startDate: Date;
  endDate: Date;
  createdBy?: string | null;
}): Promise<ClassroomBooking> {
  const db = await getDb();
  const row = await db.classroomBooking.create({
    data: {
      organizationId: data.organizationId,
      branchId: data.branchId ?? null,
      classroomId: data.classroomId,
      classGroupId: data.classGroupId ?? null,
      scheduleSlotId: data.scheduleSlotId ?? null,
      academicYearId: data.academicYearId,
      academicTermId: data.academicTermId ?? null,
      startDate: data.startDate,
      endDate: data.endDate,
      createdBy: data.createdBy ?? null,
    },
    select: bookingSelect,
  });
  return mapToBooking(row);
}

export async function updateClassroomBooking(
  id: string,
  organizationId: string,
  data: {
    classGroupId?: string | null;
    scheduleSlotId?: string | null;
    academicTermId?: string | null;
    startDate?: Date;
    endDate?: Date;
    status?: string;
  }
): Promise<ClassroomBooking> {
  const db = await getDb();
  const updateData: Record<string, unknown> = {};
  if (data.classGroupId !== undefined) updateData.classGroupId = data.classGroupId;
  if (data.scheduleSlotId !== undefined) updateData.scheduleSlotId = data.scheduleSlotId;
  if (data.academicTermId !== undefined) updateData.academicTermId = data.academicTermId;
  if (data.startDate !== undefined) updateData.startDate = data.startDate;
  if (data.endDate !== undefined) updateData.endDate = data.endDate;
  if (data.status !== undefined) updateData.status = data.status;

  const row = await db.classroomBooking.update({
    where: { id, organizationId },
    data: updateData,
    select: bookingSelect,
  });
  return mapToBooking(row);
}

export async function softDeleteClassroomBooking(
  id: string,
  organizationId: string
): Promise<void> {
  const db = await getDb();
  await db.classroomBooking.update({
    where: { id, organizationId },
    data: { deletedAt: new Date() },
  });
}

export async function findBookingsByClassroomInRange(
  classroomId: string,
  organizationId: string,
  startDate: Date,
  endDate: Date
): Promise<ClassroomBooking[]> {
  const db = await getDb();
  const rows = await db.classroomBooking.findMany({
    where: {
      classroomId,
      organizationId,
      deletedAt: null,
      status: { notIn: ["CANCELLED", "ARCHIVED"] },
      startDate: { lte: endDate },
      endDate: { gte: startDate },
    },
    select: bookingSelect,
    orderBy: [{ startDate: "asc" }],
  });
  return rows.map(mapToBooking);
}
