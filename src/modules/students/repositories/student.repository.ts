import { getDb } from "@/server/db";
import { buildSkipTake, buildPaginationMeta } from "@/shared/lib/pagination";
import type { PaginatedResult, PaginationParams } from "@/shared/types/common";
import type { Student, StudentBranch } from "@/modules/students/types";

// =============================================================================
// STUDENTS REPOSITORY
// All queries are scoped to organizationId. Never query cross-tenant.
// =============================================================================

export interface ListStudentsParams extends PaginationParams {
  search?: string;
  status?: string;
  branchId?: string;
}

const studentSelect = {
  id: true,
  code: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  dateOfBirth: true,
  gender: true,
  address: true,
  idType: true,
  idNumber: true,
  status: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  branch: { select: { id: true, name: true } },
} as const;

function mapToStudent(row: {
  id: string;
  code: string | null;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  dateOfBirth: Date | null;
  gender: string | null;
  address: string | null;
  idType: string | null;
  idNumber: string | null;
  status: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  branch: { id: string; name: string } | null;
}): Student {
  return {
    ...row,
    fullName: `${row.firstName} ${row.lastName}`,
  };
}

export async function findManyByOrganization(
  organizationId: string,
  params: ListStudentsParams
): Promise<PaginatedResult<Student>> {
  const db = await getDb();
  const { skip, take } = buildSkipTake(params);

  const where = {
    organizationId,
    deletedAt: null,
    ...(params.search && {
      OR: [
        { firstName: { contains: params.search } },
        { lastName: { contains: params.search } },
        { email: { contains: params.search } },
        { phone: { contains: params.search } },
        { idNumber: { contains: params.search } },
      ],
    }),
    ...(params.status && { status: params.status }),
    ...(params.branchId && { branchId: params.branchId }),
  };

  const [rows, total] = await Promise.all([
    db.student.findMany({
      where,
      select: studentSelect,
      skip,
      take,
      orderBy: { createdAt: "desc" },
    }),
    db.student.count({ where }),
  ]);

  return buildPaginationMeta(rows.map(mapToStudent), total, params);
}

export async function findByIdInOrganization(
  id: string,
  organizationId: string
): Promise<Student | null> {
  const db = await getDb();
  const row = await db.student.findFirst({
    where: { id, organizationId, deletedAt: null },
    select: studentSelect,
  });
  return row ? mapToStudent(row) : null;
}

export async function createStudent(data: {
  organizationId: string;
  branchId?: string | null;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  dateOfBirth?: Date | null;
  gender?: string | null;
  address?: string | null;
  idType?: string | null;
  idNumber?: string | null;
  notes?: string | null;
  createdBy: string;
}): Promise<Student> {
  const db = await getDb();
  const row = await db.student.create({
    data: {
      organizationId: data.organizationId,
      branchId: data.branchId ?? null,
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email ?? null,
      phone: data.phone ?? null,
      dateOfBirth: data.dateOfBirth ?? null,
      gender: data.gender ?? null,
      address: data.address ?? null,
      idType: data.idType ?? null,
      idNumber: data.idNumber ?? null,
      notes: data.notes ?? null,
      status: "PENDING",
      createdBy: data.createdBy,
      updatedBy: data.createdBy,
    },
    select: studentSelect,
  });
  return mapToStudent(row);
}

export async function updateStudent(
  id: string,
  data: {
    firstName?: string;
    lastName?: string;
    email?: string | null;
    phone?: string | null;
    dateOfBirth?: Date | null;
    gender?: string | null;
    address?: string | null;
    idType?: string | null;
    idNumber?: string | null;
    branchId?: string | null;
    notes?: string | null;
    status?: string;
    updatedBy: string;
  }
): Promise<Student> {
  const db = await getDb();
  const row = await db.student.update({
    where: { id },
    data,
    select: studentSelect,
  });
  return mapToStudent(row);
}

export async function suspendStudent(id: string, updatedBy: string): Promise<Student> {
  const db = await getDb();
  const row = await db.student.update({
    where: { id },
    data: { status: "SUSPENDED", updatedBy },
    select: studentSelect,
  });
  return mapToStudent(row);
}

export async function softDeleteStudent(id: string): Promise<void> {
  const db = await getDb();
  await db.student.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

export async function countByStatus(
  organizationId: string
): Promise<Record<string, number>> {
  const db = await getDb();
  const results = await db.student.groupBy({
    by: ["status"],
    where: { organizationId, deletedAt: null },
    _count: { status: true },
  });
  return Object.fromEntries(results.map((r) => [r.status, r._count.status]));
}

export async function findStudentByIdNumber(
  organizationId: string,
  idNumber: string,
  excludeId?: string
): Promise<Student | null> {
  const db = await getDb();
  const row = await db.student.findFirst({
    where: {
      organizationId,
      idNumber,
      deletedAt: null,
      ...(excludeId && { NOT: { id: excludeId } }),
    },
    select: studentSelect,
  });
  return row ? mapToStudent(row) : null;
}

export async function listActiveBranches(organizationId: string): Promise<StudentBranch[]> {
  const db = await getDb();
  return db.branch.findMany({
    where: { organizationId, status: "ACTIVE", deletedAt: null },
    select: { id: true, name: true, code: true },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  });
}
