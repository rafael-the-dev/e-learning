import type { TeacherStatus, Gender } from "@/shared/types/common";

export interface TeacherDto {
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
  licenseNumber: string | null;
  specialization: string | null;
  status: TeacherStatus;
  createdAt: Date;
  subjects?: { id: string; name: string }[];
}

export interface CreateTeacherInput {
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
  licenseNumber?: string;
  specialization?: string;
  notes?: string;
  subjectIds?: string[];
}

export interface UpdateTeacherInput {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  licenseNumber?: string;
  specialization?: string;
  status?: TeacherStatus;
  subjectIds?: string[];
}
