import { getDb } from "@/server/db";
import type { StudentDocument } from "@/modules/student-documents/types";

const documentSelect = {
  id: true,
  organizationId: true,
  studentId: true,
  documentType: true,
  fileName: true,
  fileUrl: true,
  fileSize: true,
  status: true,
  notes: true,
  uploadedBy: true,
  verifiedBy: true,
  verifiedAt: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} as const;

function mapToDocument(row: {
  id: string;
  organizationId: string;
  studentId: string;
  documentType: string;
  fileName: string;
  fileUrl: string;
  fileSize: number | null;
  status: string;
  notes: string | null;
  uploadedBy: string | null;
  verifiedBy: string | null;
  verifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}): StudentDocument {
  return { ...row };
}

export async function findDocumentsByStudent(
  studentId: string,
  organizationId: string
): Promise<StudentDocument[]> {
  const db = await getDb();
  const rows = await db.studentDocument.findMany({
    where: { studentId, organizationId, deletedAt: null },
    select: documentSelect,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(mapToDocument);
}

export async function findDocumentByIdInOrganization(
  id: string,
  organizationId: string
): Promise<StudentDocument | null> {
  const db = await getDb();
  const row = await db.studentDocument.findFirst({
    where: { id, organizationId, deletedAt: null },
    select: documentSelect,
  });
  return row ? mapToDocument(row) : null;
}

export async function createStudentDocument(data: {
  organizationId: string;
  studentId: string;
  documentType: string;
  fileName: string;
  fileUrl: string;
  fileSize?: number | null;
  notes?: string | null;
  uploadedBy: string;
}): Promise<StudentDocument> {
  const db = await getDb();
  const row = await db.studentDocument.create({
    data: {
      organizationId: data.organizationId,
      studentId: data.studentId,
      documentType: data.documentType,
      fileName: data.fileName,
      fileUrl: data.fileUrl,
      fileSize: data.fileSize ?? null,
      notes: data.notes ?? null,
      uploadedBy: data.uploadedBy,
      status: "PENDING",
    },
    select: documentSelect,
  });
  return mapToDocument(row);
}

export async function verifyStudentDocument(
  id: string,
  organizationId: string,
  data: { status: "VERIFIED" | "REJECTED"; notes?: string | null; verifiedBy: string }
): Promise<StudentDocument> {
  const db = await getDb();
  const row = await db.studentDocument.update({
    where: { id, organizationId },
    data: {
      status: data.status,
      notes: data.notes ?? undefined,
      verifiedBy: data.verifiedBy,
      verifiedAt: new Date(),
    },
    select: documentSelect,
  });
  return mapToDocument(row);
}

export async function softDeleteStudentDocument(id: string, organizationId: string): Promise<void> {
  const db = await getDb();
  await db.studentDocument.update({
    where: { id, organizationId },
    data: { deletedAt: new Date() },
  });
}

export async function countDocumentsByStudent(
  studentId: string,
  organizationId: string
): Promise<number> {
  const db = await getDb();
  return db.studentDocument.count({
    where: { studentId, organizationId, deletedAt: null },
  });
}
