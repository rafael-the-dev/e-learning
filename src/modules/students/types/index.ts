import type { StudentStatus, Gender } from "@/shared/types/common";

export interface StudentDto {
  id: string;
  organizationId: string;
  branchId: string | null;
  code: string | null;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  dateOfBirth: Date | null;
  gender: Gender | null;
  address: string | null;
  photoUrl: string | null;
  idType: string | null;
  idNumber: string | null;
  status: StudentStatus;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateStudentInput {
  organizationId: string;
  branchId?: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  dateOfBirth?: Date;
  gender?: Gender;
  address?: string;
  idType?: string;
  idNumber?: string;
  notes?: string;
}

export interface UpdateStudentInput {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  dateOfBirth?: Date;
  gender?: Gender;
  address?: string;
  idType?: string;
  idNumber?: string;
  photoUrl?: string;
  notes?: string;
}

export interface StudentFilters {
  search?: string;
  status?: StudentStatus;
  branchId?: string;
  courseId?: string;
}
