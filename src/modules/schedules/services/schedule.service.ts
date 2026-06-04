import {
  findSchedulePeriodsByOrganization,
  findSchedulePeriodByIdInOrganization,
  findAllSchedulePeriodsByOrganization,
  type ListSchedulePeriodsParams,
} from "@/modules/schedules/repositories/schedule-period.repository";
import {
  findScheduleSlotsByOrganization,
  findScheduleSlotsByPeriod,
  findActiveSlotsByOrganization,
  countActiveScheduleSlots,
  type ListScheduleSlotsParams,
} from "@/modules/schedules/repositories/schedule-slot.repository";
import {
  findSchedulesByClassGroup,
} from "@/modules/schedules/repositories/class-group-schedule.repository";
import { NotFoundError } from "@/shared/lib/command";

// =============================================================================
// SCHEDULE SERVICE
// Read-only wrappers — authorization happens in Commands.
// =============================================================================

export async function getSchedulePeriodsByOrganization(
  organizationId: string,
  params: ListSchedulePeriodsParams
) {
  return findSchedulePeriodsByOrganization(organizationId, params);
}

export async function getAllSchedulePeriods(organizationId: string) {
  return findAllSchedulePeriodsByOrganization(organizationId);
}

export async function getSchedulePeriodById(id: string, organizationId: string) {
  const period = await findSchedulePeriodByIdInOrganization(id, organizationId);
  if (!period) throw new NotFoundError("Período", id);
  return period;
}

export async function getScheduleSlotsByOrganization(
  organizationId: string,
  params: ListScheduleSlotsParams
) {
  return findScheduleSlotsByOrganization(organizationId, params);
}

export async function getScheduleSlotsByPeriod(
  schedulePeriodId: string,
  organizationId: string
) {
  return findScheduleSlotsByPeriod(schedulePeriodId, organizationId);
}

export async function getActiveSlotsByOrganization(organizationId: string) {
  return findActiveSlotsByOrganization(organizationId);
}

export async function getSchedulesByClassGroup(
  classGroupId: string,
  organizationId: string
) {
  return findSchedulesByClassGroup(classGroupId, organizationId);
}

export async function getActiveSlotsCount(organizationId: string): Promise<number> {
  return countActiveScheduleSlots(organizationId);
}

export async function getScheduleFormData(organizationId: string) {
  const [periods, slots] = await Promise.all([
    findAllSchedulePeriodsByOrganization(organizationId),
    findActiveSlotsByOrganization(organizationId),
  ]);
  return { periods, slots };
}
