import { z } from "zod";

const CLASSROOM_FEATURES = [
  "AIR_CONDITIONING",
  "INTERNET",
  "PROJECTOR",
  "SMART_BOARD",
  "RECORDING",
  "ACCESSIBLE",
  "SOUND_SYSTEM",
  "CCTV",
  "GENERATOR",
  "OTHER",
] as const;

export const addClassroomFeatureSchema = z.object({
  classroomId: z.string().min(1),
  feature: z.enum(CLASSROOM_FEATURES),
});

export type AddClassroomFeatureSchema = z.infer<typeof addClassroomFeatureSchema>;

export const removeClassroomFeatureSchema = z.object({
  featureId: z.string().min(1),
  classroomId: z.string().min(1),
});

export type RemoveClassroomFeatureSchema = z.infer<typeof removeClassroomFeatureSchema>;
