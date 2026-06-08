import { getDb } from "@/server/db";
import type { LessonAttachment } from "@/modules/lessons/types";

const attachmentSelect = {
  id: true,
  organizationId: true,
  lessonId: true,
  fileName: true,
  fileUrl: true,
  fileType: true,
  fileSize: true,
  isDownloadable: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} as const;

function mapToAttachment(row: {
  id: string;
  organizationId: string;
  lessonId: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  fileSize: number | null;
  isDownloadable: boolean;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}): LessonAttachment {
  return {
    id: row.id,
    organizationId: row.organizationId,
    lessonId: row.lessonId,
    fileName: row.fileName,
    fileUrl: row.fileUrl,
    fileType: row.fileType,
    fileSize: row.fileSize,
    isDownloadable: row.isDownloadable,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

export async function findAttachmentsByLesson(
  lessonId: string,
  organizationId: string
): Promise<LessonAttachment[]> {
  const db = await getDb();
  const rows = await db.lessonAttachment.findMany({
    where: { lessonId, organizationId, deletedAt: null },
    select: attachmentSelect,
    orderBy: { createdAt: "asc" },
  });
  return rows.map(mapToAttachment);
}

export async function findAttachmentByIdInOrganization(
  id: string,
  organizationId: string
): Promise<LessonAttachment | null> {
  const db = await getDb();
  const row = await db.lessonAttachment.findFirst({
    where: { id, organizationId, deletedAt: null },
    select: attachmentSelect,
  });
  return row ? mapToAttachment(row) : null;
}

export async function createLessonAttachment(data: {
  organizationId: string;
  lessonId: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  fileSize?: number | null;
  isDownloadable: boolean;
}): Promise<LessonAttachment> {
  const db = await getDb();
  const row = await db.lessonAttachment.create({
    data: {
      organizationId: data.organizationId,
      lessonId: data.lessonId,
      fileName: data.fileName,
      fileUrl: data.fileUrl,
      fileType: data.fileType,
      fileSize: data.fileSize ?? null,
      isDownloadable: data.isDownloadable,
      status: "ACTIVE",
    },
    select: attachmentSelect,
  });
  return mapToAttachment(row);
}

export async function updateLessonAttachment(
  id: string,
  organizationId: string,
  data: Partial<{
    fileName: string;
    fileUrl: string;
    fileType: string;
    fileSize: number | null;
    isDownloadable: boolean;
  }>
): Promise<LessonAttachment> {
  const db = await getDb();
  const row = await db.lessonAttachment.update({
    where: { id, organizationId },
    data,
    select: attachmentSelect,
  });
  return mapToAttachment(row);
}

export async function softDeleteAttachment(id: string, organizationId: string): Promise<void> {
  const db = await getDb();
  await db.lessonAttachment.update({
    where: { id, organizationId },
    data: { deletedAt: new Date() },
  });
}
