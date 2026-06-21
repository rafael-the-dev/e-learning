import {
  findDocumentsByStudent,
  countDocumentsByStudent,
} from "@/modules/student-documents/repositories/student-document.repository";
import type { StudentDocument } from "@/modules/student-documents/types";

export async function getStudentDocuments(
  studentId: string,
  organizationId: string
): Promise<StudentDocument[]> {
  return findDocumentsByStudent(studentId, organizationId);
}

export async function getStudentDocumentCount(
  studentId: string,
  organizationId: string
): Promise<number> {
  return countDocumentsByStudent(studentId, organizationId);
}
