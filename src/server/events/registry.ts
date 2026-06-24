import { CommunicationEventHandler } from "./handlers/communication.handler";
import { StudentTimelineEventHandler } from "./handlers/student-timeline.handler";
import { EnrollmentActivationEventHandler } from "./handlers/enrollment-activation.handler";
import { AssessmentEventHandler } from "./handlers/assessment.handler";
import { NotificationEventHandler } from "./handlers/notification.handler";
import type { DomainEventHandler } from "./event-handlers";

// =============================================================================
// HANDLER REGISTRY
// All domain event handlers are registered here.
// To add a new handler: instantiate and add to the array.
// =============================================================================

export const registeredHandlers: DomainEventHandler[] = [
  new CommunicationEventHandler(),
  new StudentTimelineEventHandler(),
  new EnrollmentActivationEventHandler(),
  new AssessmentEventHandler(),
  new NotificationEventHandler(),
];
