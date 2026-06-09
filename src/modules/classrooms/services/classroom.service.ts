import {
  findClassroomsByOrganization,
  findClassroomById,
  countClassroomsByStatus,
  type ListClassroomsParams,
} from "@/modules/classrooms/repositories/classroom.repository";
import {
  findBookingsByOrganization,
  findBookingById,
  findBookingsByClassroomInRange,
  type ListClassroomBookingsParams,
} from "@/modules/classrooms/repositories/classroom-booking.repository";
import { findFeaturesByClassroom } from "@/modules/classrooms/repositories/classroom-feature.repository";
import { findResourcesByClassroom } from "@/modules/classrooms/repositories/classroom-resource.repository";
import { findMaintenancesByClassroom } from "@/modules/classrooms/repositories/classroom-maintenance.repository";
import type {
  Classroom,
  ClassroomFeature,
  ClassroomResource,
  ClassroomMaintenance,
  ClassroomBooking,
} from "@/modules/classrooms/types";
import type { PaginatedResult } from "@/shared/types/common";

// =============================================================================
// CLASSROOM SERVICE — read-only helpers for pages/components
// =============================================================================

export async function getClassroomsByOrganization(
  organizationId: string,
  params: ListClassroomsParams
): Promise<PaginatedResult<Classroom>> {
  return findClassroomsByOrganization(organizationId, params);
}

export async function getClassroomById(
  id: string,
  organizationId: string
): Promise<Classroom | null> {
  return findClassroomById(id, organizationId);
}

export async function getClassroomStats(
  organizationId: string
): Promise<Record<string, number>> {
  return countClassroomsByStatus(organizationId);
}

export async function getClassroomFeatures(
  classroomId: string,
  organizationId: string
): Promise<ClassroomFeature[]> {
  return findFeaturesByClassroom(classroomId, organizationId);
}

export async function getClassroomResources(
  classroomId: string,
  organizationId: string
): Promise<ClassroomResource[]> {
  return findResourcesByClassroom(classroomId, organizationId);
}

export async function getClassroomMaintenances(
  classroomId: string,
  organizationId: string
): Promise<ClassroomMaintenance[]> {
  return findMaintenancesByClassroom(classroomId, organizationId);
}

export async function getClassroomBookingsByOrganization(
  organizationId: string,
  params: ListClassroomBookingsParams
): Promise<PaginatedResult<ClassroomBooking>> {
  return findBookingsByOrganization(organizationId, params);
}

export async function getClassroomBookingById(
  id: string,
  organizationId: string
): Promise<ClassroomBooking | null> {
  return findBookingById(id, organizationId);
}

export async function getClassroomBookingsInRange(
  classroomId: string,
  organizationId: string,
  startDate: Date,
  endDate: Date
): Promise<ClassroomBooking[]> {
  return findBookingsByClassroomInRange(classroomId, organizationId, startDate, endDate);
}
