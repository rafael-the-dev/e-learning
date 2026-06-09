import { findClassroomById } from "@/modules/classrooms/repositories/classroom.repository";
import { findActiveMaintenancesForClassroom } from "@/modules/classrooms/repositories/classroom-maintenance.repository";
import { findConflictingBookings } from "@/modules/classrooms/repositories/classroom-booking.repository";
import type { Classroom, ClassroomBooking, ClassroomMaintenance } from "@/modules/classrooms/types";

// =============================================================================
// CLASSROOM AVAILABILITY SERVICE
// Centralises all conflict and capacity checks.
// =============================================================================

export interface AvailabilityCheckInput {
  classroomId: string;
  organizationId: string;
  startDate: Date;
  endDate: Date;
  classGroupCapacity?: number;
  excludeBookingId?: string;
}

export interface AvailabilityResult {
  available: boolean;
  classroom: Classroom | null;
  conflicts: ClassroomBooking[];
  maintenanceConflicts: ClassroomMaintenance[];
  capacityViolation: boolean;
  reasons: string[];
}

export const classroomAvailabilityService = {
  async validateClassroomAvailability(
    input: AvailabilityCheckInput
  ): Promise<AvailabilityResult> {
    const result: AvailabilityResult = {
      available: true,
      classroom: null,
      conflicts: [],
      maintenanceConflicts: [],
      capacityViolation: false,
      reasons: [],
    };

    // 1. Load classroom
    const classroom = await findClassroomById(input.classroomId, input.organizationId);
    result.classroom = classroom;

    if (!classroom) {
      result.available = false;
      result.reasons.push("Sala não encontrada.");
      return result;
    }

    // 2. Check classroom status
    if (classroom.status !== "ACTIVE") {
      result.available = false;
      result.reasons.push(`A sala está no estado "${classroom.status}" e não pode ser reservada.`);
    }

    // 3. Check maintenance conflicts
    const maintenances = await this.checkMaintenanceConflicts(
      input.classroomId,
      input.startDate,
      input.endDate
    );
    if (maintenances.length > 0) {
      result.available = false;
      result.maintenanceConflicts = maintenances;
      result.reasons.push("A sala tem manutenção agendada no período selecionado.");
    }

    // 4. Check booking conflicts
    const conflicts = await this.checkBookingConflicts(
      input.classroomId,
      input.startDate,
      input.endDate,
      input.excludeBookingId
    );
    if (conflicts.length > 0) {
      result.available = false;
      result.conflicts = conflicts;
      result.reasons.push("Existem reservas em conflito no período selecionado.");
    }

    // 5. Check capacity
    if (input.classGroupCapacity && input.classGroupCapacity > classroom.capacity) {
      result.capacityViolation = true;
      result.available = false;
      result.reasons.push(
        `A capacidade da turma (${input.classGroupCapacity}) excede a capacidade da sala (${classroom.capacity}).`
      );
    }

    return result;
  },

  async checkBookingConflicts(
    classroomId: string,
    startDate: Date,
    endDate: Date,
    excludeId?: string
  ): Promise<ClassroomBooking[]> {
    return findConflictingBookings(classroomId, startDate, endDate, excludeId);
  },

  async checkMaintenanceConflicts(
    classroomId: string,
    startDate: Date,
    endDate: Date
  ): Promise<ClassroomMaintenance[]> {
    return findActiveMaintenancesForClassroom(classroomId, startDate, endDate);
  },

  async checkCapacityCompatibility(
    classroom: Classroom,
    classGroupCapacity: number
  ): Promise<boolean> {
    return classGroupCapacity <= classroom.capacity;
  },

  async findAvailableClassrooms(input: {
    organizationId: string;
    startDate: Date;
    endDate: Date;
    minCapacity?: number;
    branchId?: string | null;
    classroomType?: string | null;
  }): Promise<Classroom[]> {
    const { getDb } = await import("@/server/db");
    const db = await getDb();

    const candidates = await db.classroom.findMany({
      where: {
        organizationId: input.organizationId,
        deletedAt: null,
        status: "ACTIVE",
        ...(input.branchId ? { branchId: input.branchId } : {}),
        ...(input.classroomType ? { classroomType: input.classroomType } : {}),
        ...(input.minCapacity ? { capacity: { gte: input.minCapacity } } : {}),
      },
      select: {
        id: true,
        organizationId: true,
        branchId: true,
        code: true,
        name: true,
        description: true,
        classroomType: true,
        capacity: true,
        location: true,
        floor: true,
        meetingProvider: true,
        meetingUrl: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
        branch: { select: { id: true, name: true } },
        _count: { select: { features: true, resources: true, bookings: true } },
      },
    });

    const available: Classroom[] = [];

    for (const c of candidates) {
      const [conflicts, maintenances] = await Promise.all([
        findConflictingBookings(c.id, input.startDate, input.endDate),
        findActiveMaintenancesForClassroom(c.id, input.startDate, input.endDate),
      ]);

      if (conflicts.length === 0 && maintenances.length === 0) {
        available.push({
          id: c.id,
          organizationId: c.organizationId,
          branchId: c.branchId,
          code: c.code,
          name: c.name,
          description: c.description,
          classroomType: c.classroomType,
          capacity: c.capacity,
          location: c.location,
          floor: c.floor,
          meetingProvider: c.meetingProvider,
          meetingUrl: c.meetingUrl,
          status: c.status,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
          deletedAt: c.deletedAt,
          branchName: c.branch?.name ?? null,
          featuresCount: c._count.features,
          resourcesCount: c._count.resources,
          bookingsCount: c._count.bookings,
        });
      }
    }

    return available;
  },
};
