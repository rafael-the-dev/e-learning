import { getDb } from "@/server/db";
import { buildSkipTake, buildPaginationMeta } from "@/shared/lib/pagination";
import type { PaginatedResult, PaginationParams } from "@/shared/types/common";
import type { Teacher, TeacherBranch, TeacherSubjectItem, TeacherWithSubjects } from "@/modules/teachers/types";

// =============================================================================
// TEACHERS REPOSITORY
// All queries are scoped to organizationId. Never query cross-tenant.
// =============================================================================

export interface ListTeachersParams extends PaginationParams {
  search?: string;
  status?: string;
  branchId?: string;
}

const teacherSelect = {
  id: true,
  code: true,
  userId: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  dateOfBirth: true,
  gender: true,
  address: true,
  idType: true,
  idNumber: true,
  licenseNumber: true,
  specialization: true,
  hireDate: true,
  status: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  branch: { select: { id: true, name: true } },
} as const;

function mapToTeacher(row: {
  id: string;
  code: string | null;
  userId: string | null;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  dateOfBirth: Date | null;
  gender: string | null;
  address: string | null;
  idType: string | null;
  idNumber: string | null;
  licenseNumber: string | null;
  specialization: string | null;
  hireDate: Date | null;
  status: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  branch: { id: string; name: string } | null;
}): Teacher {
  return {
    ...row,
    fullName: `${row.firstName} ${row.lastName}`,
  };
}

export async function findManyByOrganization(
  organizationId: string,
  params: ListTeachersParams
): Promise<PaginatedResult<Teacher>> {
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
        { licenseNumber: { contains: params.search } },
        { specialization: { contains: params.search } },
      ],
    }),
    ...(params.status && { status: params.status }),
    ...(params.branchId && { branchId: params.branchId }),
  };

  const [rows, total] = await Promise.all([
    db.teacher.findMany({
      where,
      select: teacherSelect,
      skip,
      take,
      orderBy: { createdAt: "desc" },
    }),
    db.teacher.count({ where }),
  ]);

  return buildPaginationMeta(rows.map(mapToTeacher), total, params);
}

export async function findByIdInOrganization(
  id: string,
  organizationId: string
): Promise<Teacher | null> {
  const db = await getDb();
  const row = await db.teacher.findFirst({
    where: { id, organizationId, deletedAt: null },
    select: teacherSelect,
  });
  return row ? mapToTeacher(row) : null;
}

export async function findByIdWithSubjects(
  id: string,
  organizationId: string
): Promise<TeacherWithSubjects | null> {
  const db = await getDb();
  const row = await db.teacher.findFirst({
    where: { id, organizationId, deletedAt: null },
    select: {
      ...teacherSelect,
      teacherSubjects: {
        select: {
          id: true,
          subjectId: true,
          assignedAt: true,
          subject: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
      },
    },
  });

  if (!row) return null;

  const teacher = mapToTeacher(row);
  const teacherSubjects: TeacherSubjectItem[] = row.teacherSubjects.map((ts) => ({
    id: ts.id,
    subjectId: ts.subjectId,
    subjectName: ts.subject.name,
    subjectCode: ts.subject.code,
    assignedAt: ts.assignedAt,
  }));

  return { ...teacher, teacherSubjects };
}

export async function createTeacher(data: {
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
  licenseNumber?: string | null;
  specialization?: string | null;
  notes?: string | null;
  createdBy: string;
}): Promise<Teacher> {
  const db = await getDb();
  const row = await db.teacher.create({
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
      licenseNumber: data.licenseNumber ?? null,
      specialization: data.specialization ?? null,
      notes: data.notes ?? null,
      status: "ACTIVE",
      createdBy: data.createdBy,
      updatedBy: data.createdBy,
    },
    select: teacherSelect,
  });
  return mapToTeacher(row);
}

export async function updateTeacher(
  id: string,
  organizationId: string,
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
    licenseNumber?: string | null;
    specialization?: string | null;
    branchId?: string | null;
    userId?: string | null;
    notes?: string | null;
    status?: string;
    updatedBy: string;
  }
): Promise<Teacher> {
  const db = await getDb();
  const row = await db.teacher.update({
    where: { id, organizationId },
    data,
    select: teacherSelect,
  });
  return mapToTeacher(row);
}

export async function suspendTeacher(
  id: string,
  organizationId: string,
  updatedBy: string
): Promise<Teacher> {
  const db = await getDb();
  const row = await db.teacher.update({
    where: { id, organizationId },
    data: { status: "SUSPENDED", updatedBy },
    select: teacherSelect,
  });
  return mapToTeacher(row);
}

export async function softDeleteTeacher(
  id: string,
  organizationId: string,
  updatedBy: string
): Promise<void> {
  const db = await getDb();
  await db.teacher.update({
    where: { id, organizationId },
    data: { deletedAt: new Date(), updatedBy },
  });
}

export async function countByStatus(
  organizationId: string
): Promise<Record<string, number>> {
  const db = await getDb();
  const results = await db.teacher.groupBy({
    by: ["status"],
    where: { organizationId, deletedAt: null },
    _count: { status: true },
  });
  return Object.fromEntries(results.map((r) => [r.status, r._count.status]));
}

export async function findTeacherByIdNumber(
  organizationId: string,
  idNumber: string,
  excludeId?: string
): Promise<Teacher | null> {
  const db = await getDb();
  const row = await db.teacher.findFirst({
    where: {
      organizationId,
      idNumber,
      deletedAt: null,
      ...(excludeId && { NOT: { id: excludeId } }),
    },
    select: teacherSelect,
  });
  return row ? mapToTeacher(row) : null;
}

export async function findTeacherByLicenseNumber(
  organizationId: string,
  licenseNumber: string,
  excludeId?: string
): Promise<Teacher | null> {
  const db = await getDb();
  const row = await db.teacher.findFirst({
    where: {
      organizationId,
      licenseNumber,
      deletedAt: null,
      ...(excludeId && { NOT: { id: excludeId } }),
    },
    select: teacherSelect,
  });
  return row ? mapToTeacher(row) : null;
}

export async function findExistingTeacherIdNumbers(
  organizationId: string,
  idNumbers: string[]
): Promise<Set<string>> {
  if (idNumbers.length === 0) return new Set();
  const db = await getDb();
  const rows = await db.teacher.findMany({
    where: { organizationId, deletedAt: null, idNumber: { in: idNumbers } },
    select: { idNumber: true },
  });
  return new Set(rows.map((r) => r.idNumber).filter((v): v is string => v !== null));
}

/** `emails` must already be trimmed+lowercased — the returned Set is always lowercased too, so callers never need to normalize case themselves. */
export async function findExistingTeacherEmails(
  organizationId: string,
  emails: string[]
): Promise<Set<string>> {
  if (emails.length === 0) return new Set();
  const db = await getDb();
  const rows = await db.teacher.findMany({
    where: { organizationId, deletedAt: null, email: { in: emails } },
    select: { email: true },
  });
  return new Set(
    rows
      .map((r) => r.email)
      .filter((v): v is string => v !== null)
      .map((e) => e.trim().toLowerCase())
  );
}

export async function listActiveBranches(organizationId: string): Promise<TeacherBranch[]> {
  const db = await getDb();
  return db.branch.findMany({
    where: { organizationId, status: "ACTIVE", deletedAt: null },
    select: { id: true, name: true, code: true },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  });
}

export async function findTeacherByUserId(
  organizationId: string,
  userId: string,
  excludeId?: string
): Promise<Teacher | null> {
  const db = await getDb();
  const row = await db.teacher.findFirst({
    where: {
      organizationId,
      userId,
      deletedAt: null,
      ...(excludeId && { NOT: { id: excludeId } }),
    },
    select: teacherSelect,
  });
  return row ? mapToTeacher(row) : null;
}

export interface LinkableTeacherUser {
  id: string;
  name: string;
  email: string;
}

/**
 * Users with the TEACHER role in this org who are not yet linked to any Teacher
 * record — plus, when editing an existing teacher, the user already linked to
 * `currentTeacherId` (so the current selection still appears in the picker).
 */
export async function listLinkableTeacherUsers(
  organizationId: string,
  currentTeacherId?: string
): Promise<LinkableTeacherUser[]> {
  const db = await getDb();
  const [users, linked] = await Promise.all([
    db.user.findMany({
      where: {
        deletedAt: null,
        userRoles: { some: { organizationId, role: { name: "TEACHER" } } },
      },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
    db.teacher.findMany({
      where: {
        organizationId,
        userId: { not: null },
        deletedAt: null,
        ...(currentTeacherId && { NOT: { id: currentTeacherId } }),
      },
      select: { userId: true },
    }),
  ]);
  const linkedIds = new Set(linked.map((t) => t.userId));
  return users.filter((u) => !linkedIds.has(u.id));
}

export async function assignSubject(
  teacherId: string,
  subjectId: string
): Promise<void> {
  const db = await getDb();
  await db.teacherSubject.create({
    data: { teacherId, subjectId },
  });
}

export async function removeSubject(
  teacherId: string,
  subjectId: string
): Promise<void> {
  const db = await getDb();
  await db.teacherSubject.deleteMany({
    where: { teacherId, subjectId },
  });
}

export async function isSubjectAlreadyAssigned(
  teacherId: string,
  subjectId: string
): Promise<boolean> {
  const db = await getDb();
  const existing = await db.teacherSubject.findUnique({
    where: { teacherId_subjectId: { teacherId, subjectId } },
    select: { id: true },
  });
  return existing !== null;
}

export async function findSubjectInOrganization(
  subjectId: string,
  organizationId: string
): Promise<{ id: string; name: string } | null> {
  const db = await getDb();
  const subject = await db.subject.findFirst({
    where: { id: subjectId, organizationId, deletedAt: null },
    select: { id: true, name: true },
  });
  return subject;
}
