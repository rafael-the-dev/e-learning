import { z } from "zod";

const CLASSROOM_TYPES = [
  "STANDARD_ROOM",
  "COMPUTER_LAB",
  "LANGUAGE_LAB",
  "DESIGN_STUDIO",
  "DRIVING_ROOM",
  "MEETING_ROOM",
  "ONLINE_ROOM",
  "OTHER",
] as const;

const CLASSROOM_STATUSES = ["ACTIVE", "MAINTENANCE", "INACTIVE", "ARCHIVED"] as const;

const MEETING_PROVIDERS = ["ZOOM", "GOOGLE_MEET", "MICROSOFT_TEAMS", "CUSTOM"] as const;

export const createClassroomSchema = z.object({
  branchId: z.string().optional().nullable(),
  code: z.string().min(1, "O código é obrigatório").max(50),
  name: z.string().min(2, "O nome deve ter pelo menos 2 caracteres").max(200),
  description: z.string().max(2000).optional().nullable(),
  classroomType: z.enum(CLASSROOM_TYPES).default("STANDARD_ROOM"),
  capacity: z.number().int().min(1, "A capacidade deve ser maior que 0"),
  location: z.string().max(200).optional().nullable(),
  floor: z.string().max(50).optional().nullable(),
  meetingProvider: z.enum(MEETING_PROVIDERS).optional().nullable(),
  meetingUrl: z.string().url("URL inválido").max(1000).optional().nullable(),
  status: z.enum(CLASSROOM_STATUSES).default("ACTIVE"),
});

export type CreateClassroomSchema = z.infer<typeof createClassroomSchema>;

export const updateClassroomSchema = z.object({
  branchId: z.string().optional().nullable(),
  code: z.string().min(1).max(50).optional(),
  name: z.string().min(2).max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  classroomType: z.enum(CLASSROOM_TYPES).optional(),
  capacity: z.number().int().min(1).optional(),
  location: z.string().max(200).optional().nullable(),
  floor: z.string().max(50).optional().nullable(),
  meetingProvider: z.enum(MEETING_PROVIDERS).optional().nullable(),
  meetingUrl: z.string().url("URL inválido").max(1000).optional().nullable(),
  status: z.enum(CLASSROOM_STATUSES).optional(),
});

export type UpdateClassroomSchema = z.infer<typeof updateClassroomSchema>;

export const archiveClassroomSchema = z.object({
  classroomId: z.string().min(1),
});

export type ArchiveClassroomSchema = z.infer<typeof archiveClassroomSchema>;
