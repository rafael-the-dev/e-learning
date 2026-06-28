import { StudentNotificationsPanel } from "@/modules/student-portal/components/student-notifications-panel";
import type { Notification } from "@/modules/notifications/types";

// Reuses the Student Portal notifications inbox. These are the GUARDIAN's own
// notifications (recipientUserId = guardianUserId) — never a child's private
// notifications. Mark-read / archive server actions are scoped to the recipient.
export function GuardianNotificationsPanel({ notifications }: { notifications: Notification[] }) {
  return <StudentNotificationsPanel notifications={notifications} />;
}
