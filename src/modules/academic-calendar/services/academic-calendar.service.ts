import {
  findAcademicYearsByOrganization,
  findAllAcademicYearsByOrganization,
  findAcademicYearByIdInOrganization,
  findDefaultAcademicYear,
  type ListAcademicYearsParams,
} from "@/modules/academic-calendar/repositories/academic-year.repository";
import {
  findAcademicTermsByOrganization,
  findAcademicTermsByYear,
  findAcademicTermByIdInOrganization,
  type ListAcademicTermsParams,
} from "@/modules/academic-calendar/repositories/academic-term.repository";
import {
  findAcademicHolidaysByOrganization,
  findUpcomingHolidaysByOrganization,
  findAcademicHolidayByIdInOrganization,
  type ListAcademicHolidaysParams,
} from "@/modules/academic-calendar/repositories/academic-holiday.repository";
import {
  findAcademicEventsByOrganization,
  findUpcomingEventsByOrganization,
  findAcademicEventByIdInOrganization,
  type ListAcademicEventsParams,
} from "@/modules/academic-calendar/repositories/academic-event.repository";
import { NotFoundError } from "@/shared/lib/command";

// =============================================================================
// ACADEMIC CALENDAR SERVICE
// Read-only wrappers — authorization happens in Commands.
// =============================================================================

export async function getAcademicYearsByOrganization(
  organizationId: string,
  params: ListAcademicYearsParams
) {
  return findAcademicYearsByOrganization(organizationId, params);
}

export async function getAllAcademicYears(organizationId: string) {
  return findAllAcademicYearsByOrganization(organizationId);
}

export async function getAcademicYearById(id: string, organizationId: string) {
  const year = await findAcademicYearByIdInOrganization(id, organizationId);
  if (!year) throw new NotFoundError("Ano Letivo", id);
  return year;
}

export async function getDefaultAcademicYear(organizationId: string) {
  return findDefaultAcademicYear(organizationId);
}

export async function getAcademicTermsByOrganization(
  organizationId: string,
  params: ListAcademicTermsParams
) {
  return findAcademicTermsByOrganization(organizationId, params);
}

export async function getAcademicTermsByYear(
  academicYearId: string,
  organizationId: string
) {
  return findAcademicTermsByYear(academicYearId, organizationId);
}

export async function getAcademicTermById(id: string, organizationId: string) {
  const term = await findAcademicTermByIdInOrganization(id, organizationId);
  if (!term) throw new NotFoundError("Período Letivo", id);
  return term;
}

export async function getAcademicHolidaysByOrganization(
  organizationId: string,
  params: ListAcademicHolidaysParams
) {
  return findAcademicHolidaysByOrganization(organizationId, params);
}

export async function getUpcomingHolidays(organizationId: string, limit = 5) {
  return findUpcomingHolidaysByOrganization(organizationId, limit);
}

export async function getAcademicHolidayById(id: string, organizationId: string) {
  const holiday = await findAcademicHolidayByIdInOrganization(id, organizationId);
  if (!holiday) throw new NotFoundError("Feriado", id);
  return holiday;
}

export async function getAcademicEventsByOrganization(
  organizationId: string,
  params: ListAcademicEventsParams
) {
  return findAcademicEventsByOrganization(organizationId, params);
}

export async function getUpcomingEvents(organizationId: string, limit = 5) {
  return findUpcomingEventsByOrganization(organizationId, limit);
}

export async function getAcademicEventById(id: string, organizationId: string) {
  const event = await findAcademicEventByIdInOrganization(id, organizationId);
  if (!event) throw new NotFoundError("Evento", id);
  return event;
}

export async function getCalendarDashboardData(organizationId: string) {
  const [defaultYear, upcomingHolidays, upcomingEvents] = await Promise.all([
    findDefaultAcademicYear(organizationId),
    findUpcomingHolidaysByOrganization(organizationId, 5),
    findUpcomingEventsByOrganization(organizationId, 5),
  ]);

  const activeTerms = defaultYear
    ? await findAcademicTermsByYear(defaultYear.id, organizationId)
    : [];

  const now = new Date();
  const activeTerm = activeTerms.find(
    (t) => t.status === "ACTIVE" && new Date(t.startDate) <= now && new Date(t.endDate) >= now
  ) ?? null;

  return { defaultYear, activeTerm, upcomingHolidays, upcomingEvents };
}
