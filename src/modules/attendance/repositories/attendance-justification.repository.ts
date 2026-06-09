import { getDb } from "@/server/db";
import { buildSkipTake, buildPaginationMeta } from "@/shared/lib/pagination";
import type { PaginatedResult } from "@/shared/types/common";
import type { AttendanceJustification, ListAttendanceJustificationsParams } from "@/modules/attendance/types";

// =============================================================================
// ATTENDANCE JUSTIFICATION REPOSITORY
// =============================================================================

const justificationSelect = {
  id: true,
  organizationId: true,
  attendanceRecordId: true,
  studentId: true,
  reason: true,
  attachmentUrl: true,
  status: true,
  reviewedByUserId: true,
  reviewedAt: true,
  reviewNotes: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  student: { select: { id: true, firstName: true, lastName: true } },
  attendanceRecord: {
    select: {
      id: true,
      status: true,
      attendanceSession: {
        select: {
          id: true,
          sessionDate: true,
          subject: { select: { name: true } },
          classGroup: { select: { name: true } },
        },
      },
    },
  },
} as const;

function mapToJustification(row: any): AttendanceJustification {
  return {
    id: row.id,
    organizationId: row.organizationId,
    attendanceRecordId: row.attendanceRecordId,
    studentId: row.studentId,
    reason: row.reason,
    attachmentUrl: row.attachmentUrl,
    status: row.status,
    reviewedByUserId: row.reviewedByUserId,
    reviewedAt: row.reviewedAt,
    reviewNotes: row.reviewNotes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
    student: row.student,
    attendanceRecord: row.attendanceRecord,
  };
}

export async function findJustificationsByOrganization(
  organizationId: string,
  params: ListAttendanceJustificationsParams
): Promise<PaginatedResult<AttendanceJustification>> {
  const db = await getDb();
  const { skip, take } = buildSkipTake(params);

  const where: any = { organizationId, deletedAt: null };
  if (params.status) where.status = params.status;
  if (params.studentId) where.studentId = params.studentId;
  if (params.search) {
    where.OR = [
      { student: { firstName: { contains: params.search } } },
      { student: { lastName: { contains: params.search } } },
      { reason: { contains: params.search } },
    ];
  }

  const [rows, total] = await Promise.all([
    db.attendanceJustification.findMany({
      where,
      select: justificationSelect,
      skip,
      take,
      orderBy: { createdAt: "desc" },
    }),
    db.attendanceJustification.count({ where }),
  ]);

  return buildPaginationMeta(rows.map(mapToJustification), total, params);
}

export async function findJustificationById(
  id: string,
  organizationId: string
): Promise<AttendanceJustification | null> {
  const db = await getDb();
  const row = await db.attendanceJustification.findFirst({
    where: { id, organizationId, deletedAt: null },
    select: justificationSelect,
  });
  return row ? mapToJustification(row) : null;
}

export async function findJustificationsByRecord(
  attendanceRecordId: string,
  organizationId: string
): Promise<AttendanceJustification[]> {
  const db = await getDb();
  const rows = await db.attendanceJustification.findMany({
    where: { attendanceRecordId, organizationId, deletedAt: null },
    select: justificationSelect,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(mapToJustification);
}

export async function createJustification(data: {
  organizationId: string;
  attendanceRecordId: string;
  studentId: string;
  reason: string;
  attachmentUrl?: string | null;
}): Promise<AttendanceJustification> {
  const db = await getDb();
  const row = await db.attendanceJustification.create({
    data: { ...data, status: "PENDING" },
    select: justificationSelect,
  });
  return mapToJustification(row);
}

export async function updateJustificationStatus(
  id: string,
  organizationId: string,
  data: {
    status: string;
    reviewedByUserId: string;
    reviewedAt: Date;
    reviewNotes?: string | null;
  }
): Promise<AttendanceJustification> {
  const db = await getDb();
  const row = await db.attendanceJustification.update({
    where: { id },
    data,
    select: justificationSelect,
  });
  return mapToJustification(row);
}

export async function countJustificationsByStatus(
  organizationId: string
): Promise<Record<string, number>> {
  const db = await getDb();
  const rows = await db.attendanceJustification.groupBy({
    by: ["status"],
    where: { organizationId, deletedAt: null },
    _count: { _all: true },
  });
  const result: Record<string, number> = {};
  for (const r of rows) result[r.status] = r._count._all;
  return result;
}

export async function hasPendingJustificationForRecord(
  attendanceRecordId: string,
  organizationId: string
): Promise<boolean> {
  const db = await getDb();
  const count = await db.attendanceJustification.count({
    where: { attendanceRecordId, organizationId, status: "PENDING", deletedAt: null },
  });
  return count > 0;
}
