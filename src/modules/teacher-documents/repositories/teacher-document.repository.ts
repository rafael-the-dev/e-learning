import { getDb } from "@/server/db";
import type { TeacherDocument } from "@/modules/teacher-documents/types";

const documentSelect = {
  id: true,
  organizationId: true,
  teacherId: true,
  type: true,
  name: true,
  url: true,
  mimeType: true,
  size: true,
  uploadedById: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} as const;

function mapToDocument(row: {
  id: string;
  organizationId: string;
  teacherId: string;
  type: string;
  name: string;
  url: string;
  mimeType: string | null;
  size: number | null;
  uploadedById: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}): TeacherDocument {
  return { ...row };
}

export async function findDocumentsByTeacher(
  teacherId: string,
  organizationId: string
): Promise<TeacherDocument[]> {
  const db = await getDb();
  const rows = await db.teacherDocument.findMany({
    where: { teacherId, organizationId, deletedAt: null },
    select: documentSelect,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(mapToDocument);
}

export async function findDocumentByIdInOrganization(
  id: string,
  organizationId: string
): Promise<TeacherDocument | null> {
  const db = await getDb();
  const row = await db.teacherDocument.findFirst({
    where: { id, organizationId, deletedAt: null },
    select: documentSelect,
  });
  return row ? mapToDocument(row) : null;
}

export async function createTeacherDocument(data: {
  organizationId: string;
  teacherId: string;
  type: string;
  name: string;
  url: string;
  mimeType?: string | null;
  size?: number | null;
  uploadedById: string;
}): Promise<TeacherDocument> {
  const db = await getDb();
  const row = await db.teacherDocument.create({
    data: {
      organizationId: data.organizationId,
      teacherId: data.teacherId,
      type: data.type,
      name: data.name,
      url: data.url,
      mimeType: data.mimeType ?? null,
      size: data.size ?? null,
      uploadedById: data.uploadedById,
    },
    select: documentSelect,
  });
  return mapToDocument(row);
}

export async function softDeleteTeacherDocument(id: string, organizationId: string): Promise<void> {
  const db = await getDb();
  await db.teacherDocument.update({
    where: { id, organizationId },
    data: { deletedAt: new Date() },
  });
}

export async function countDocumentsByTeacher(
  teacherId: string,
  organizationId: string
): Promise<number> {
  const db = await getDb();
  return db.teacherDocument.count({
    where: { teacherId, organizationId, deletedAt: null },
  });
}
