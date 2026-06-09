import { z } from "zod";

export const createManualNoteSchema = z.object({
  studentId: z.string().min(1),
  title: z.string().min(1, "O título é obrigatório").max(255, "O título não pode ter mais de 255 caracteres"),
  description: z.string().max(4000, "A descrição não pode ter mais de 4000 caracteres").optional(),
  occurredAt: z.string().min(1, "A data é obrigatória"),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type CreateManualNoteSchema = z.infer<typeof createManualNoteSchema>;

export const deleteManualNoteSchema = z.object({
  eventId: z.string().min(1),
});

export type DeleteManualNoteSchema = z.infer<typeof deleteManualNoteSchema>;

export const createTimelineEventSchema = z.object({
  studentId: z.string().min(1),
  eventType: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  referenceType: z.string().optional(),
  referenceId: z.string().optional(),
  sourceEventId: z.string().optional(),
  actorUserId: z.string().optional(),
  visibility: z.enum(["INTERNAL", "STUDENT_VISIBLE"]).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  occurredAt: z.date(),
});

export type CreateTimelineEventSchema = z.infer<typeof createTimelineEventSchema>;
