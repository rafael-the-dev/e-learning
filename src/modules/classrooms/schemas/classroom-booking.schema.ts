import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de data inválido (AAAA-MM-DD)");

export const createClassroomBookingSchema = z.object({
  classroomId: z.string().min(1, "A sala é obrigatória"),
  classGroupId: z.string().optional().nullable(),
  scheduleSlotId: z.string().optional().nullable(),
  academicYearId: z.string().min(1, "O ano letivo é obrigatório"),
  academicTermId: z.string().optional().nullable(),
  startDate: isoDate,
  endDate: isoDate,
});

export type CreateClassroomBookingSchema = z.infer<typeof createClassroomBookingSchema>;

export const updateClassroomBookingSchema = z.object({
  classGroupId: z.string().optional().nullable(),
  scheduleSlotId: z.string().optional().nullable(),
  academicTermId: z.string().optional().nullable(),
  startDate: isoDate.optional(),
  endDate: isoDate.optional(),
  status: z.enum(["ACTIVE", "COMPLETED", "CANCELLED", "ARCHIVED"]).optional(),
});

export type UpdateClassroomBookingSchema = z.infer<typeof updateClassroomBookingSchema>;

export const cancelClassroomBookingSchema = z.object({
  bookingId: z.string().min(1),
});

export type CancelClassroomBookingSchema = z.infer<typeof cancelClassroomBookingSchema>;

export const findAvailableClassroomsSchema = z.object({
  academicYearId: z.string().min(1),
  academicTermId: z.string().optional().nullable(),
  classGroupId: z.string().optional().nullable(),
  scheduleSlotId: z.string().optional().nullable(),
  startDate: isoDate,
  endDate: isoDate,
  branchId: z.string().optional().nullable(),
  minCapacity: z.number().int().min(1).optional(),
  classroomType: z.string().optional().nullable(),
});

export type FindAvailableClassroomsSchema = z.infer<typeof findAvailableClassroomsSchema>;
