import {
  findDocumentsByTeacher,
  countDocumentsByTeacher,
} from "@/modules/teacher-documents/repositories/teacher-document.repository";
import type { TeacherDocument } from "@/modules/teacher-documents/types";

export async function getTeacherDocuments(
  teacherId: string,
  organizationId: string
): Promise<TeacherDocument[]> {
  return findDocumentsByTeacher(teacherId, organizationId);
}

export async function getTeacherDocumentCount(
  teacherId: string,
  organizationId: string
): Promise<number> {
  return countDocumentsByTeacher(teacherId, organizationId);
}
