import { z } from "zod";

export const retryNotificationDeliverySchema = z.object({
  deliveryId: z.string().min(1),
});

export type RetryNotificationDeliverySchema = z.infer<typeof retryNotificationDeliverySchema>;

export const cancelNotificationDeliverySchema = z.object({
  deliveryId: z.string().min(1),
});

export type CancelNotificationDeliverySchema = z.infer<typeof cancelNotificationDeliverySchema>;
