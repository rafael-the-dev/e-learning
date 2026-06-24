import { NotificationSeverity, NotificationRulePriority } from "@/shared/types/common";
import type { NotificationSeverity as NotificationSeverityType } from "@/shared/types/common";

// =============================================================================
// NOTIFICATION EVENT CATALOG
// Global, read-only reference of every domain event the Notifications Center
// knows how to configure. This is the single source of truth for:
// - which variables a template/actionUrl pattern may reference (validated at
//   template save time)
// - the default severity/title/body/actionUrl used both to seed an org's
//   default rule+template and as the last-resort hardcoded fallback when an
//   org has no usable template at all
//
// Catalog membership does NOT imply a handler exists. enrollment.created and
// lesson.published are registered here (they are real, emitted domain
// events) but have no notification-creation code wired to them — see
// docs/notifications-center.md "Phase 2".
// =============================================================================

export type NotificationEventCategory =
  | "FINANCE"
  | "ACADEMIC"
  | "ATTENDANCE"
  | "ENROLLMENT"
  | "LEARNING";

export interface NotificationEventDefinition {
  eventType: string;
  label: string;
  description: string;
  category: NotificationEventCategory;
  defaultSeverity: NotificationSeverityType;
  /** {{variable}} pattern rendered the same way as title/body. Optional. */
  defaultActionUrlPattern?: string;
  supportedChannels: readonly string[];
  /** Every variable name usable by this event's templates and actionUrl pattern. */
  variables: readonly string[];
  /** Realistic example values, keyed by variable name — auto-fills the preview form. */
  sampleVariables: Record<string, string>;
  defaultTitleTemplate: string;
  defaultBodyTemplate: string;
}

export const NOTIFICATION_EVENT_CATALOG: Record<string, NotificationEventDefinition> = {
  "payment.confirmed": {
    eventType: "payment.confirmed",
    label: "Pagamento confirmado",
    description: "Disparado quando um pagamento é confirmado pela secretaria.",
    category: "FINANCE",
    defaultSeverity: NotificationSeverity.SUCCESS,
    defaultActionUrlPattern: "/payments/{{paymentId}}",
    supportedChannels: ["IN_APP"],
    variables: ["paymentId", "paymentNumber"],
    sampleVariables: { paymentId: "pay_demo123", paymentNumber: "PAY-2026-0001" },
    defaultTitleTemplate: "Pagamento confirmado",
    defaultBodyTemplate: "O pagamento {{paymentNumber}} foi confirmado.",
  },

  "invoice.overdue": {
    eventType: "invoice.overdue",
    label: "Factura vencida",
    description: "Disparado quando uma factura passa a estar vencida.",
    category: "FINANCE",
    defaultSeverity: NotificationSeverity.WARNING,
    defaultActionUrlPattern: "/invoices/{{invoiceId}}",
    supportedChannels: ["IN_APP"],
    variables: ["invoiceId", "invoiceNumber"],
    sampleVariables: { invoiceId: "inv_demo123", invoiceNumber: "INV-2026-0001" },
    defaultTitleTemplate: "Factura vencida",
    defaultBodyTemplate: "A factura {{invoiceNumber}} está vencida.",
  },

  "assessment.results_published": {
    eventType: "assessment.results_published",
    label: "Resultados de avaliação publicados",
    description: "Disparado quando os resultados de uma avaliação são publicados para os alunos.",
    category: "ACADEMIC",
    defaultSeverity: NotificationSeverity.INFO,
    defaultActionUrlPattern: "/assessments/{{assessmentId}}",
    supportedChannels: ["IN_APP"],
    variables: ["assessmentId", "assessmentTitle"],
    sampleVariables: { assessmentId: "assess_demo123", assessmentTitle: "Exame de Código da Estrada" },
    defaultTitleTemplate: "Resultados publicados",
    defaultBodyTemplate: "Os resultados de {{assessmentTitle}} foram publicados.",
  },

  "attendance.student_at_risk": {
    eventType: "attendance.student_at_risk",
    label: "Frequência em risco",
    description: "Disparado quando a frequência de um aluno se aproxima do mínimo exigido.",
    category: "ATTENDANCE",
    defaultSeverity: NotificationSeverity.WARNING,
    defaultActionUrlPattern: "/students/{{studentId}}",
    supportedChannels: ["IN_APP"],
    variables: ["studentId"],
    sampleVariables: { studentId: "student_demo123" },
    defaultTitleTemplate: "Frequência em risco",
    defaultBodyTemplate: "A frequência está próxima do mínimo exigido.",
  },

  // ── Legacy events — already emitted/handled before Phase 2, catalogued
  // for configurability. No new handler code was added for any of these.
  "enrollment.created": {
    eventType: "enrollment.created",
    label: "Matrícula criada",
    description: "Disparado quando uma nova matrícula é criada. Catalogado para configuração futura — nenhum handler de notificação está associado ainda.",
    category: "ENROLLMENT",
    defaultSeverity: NotificationSeverity.INFO,
    defaultActionUrlPattern: "/enrollments/{{enrollmentId}}",
    supportedChannels: ["IN_APP"],
    variables: ["enrollmentId"],
    sampleVariables: { enrollmentId: "enrollment_demo123" },
    defaultTitleTemplate: "Matrícula criada",
    defaultBodyTemplate: "A sua matrícula foi criada.",
  },

  "enrollment.activated": {
    eventType: "enrollment.activated",
    label: "Matrícula ativada",
    description: "Disparado quando uma matrícula é ativada — automaticamente após confirmação de pagamento, ou manualmente por um administrador.",
    category: "ENROLLMENT",
    defaultSeverity: NotificationSeverity.SUCCESS,
    defaultActionUrlPattern: "/enrollments/{{enrollmentId}}",
    supportedChannels: ["IN_APP"],
    variables: ["enrollmentId", "enrollmentNumber", "studentName", "courseName"],
    sampleVariables: {
      enrollmentId: "enrollment_demo123",
      enrollmentNumber: "ENR-2026-0001",
      studentName: "Maria Silva",
      courseName: "Categoria B",
    },
    defaultTitleTemplate: "Matrícula ativada",
    defaultBodyTemplate: "A matrícula de {{studentName}} no curso {{courseName}} foi ativada.",
  },

  "attendance.justification_approved": {
    eventType: "attendance.justification_approved",
    label: "Justificação de falta aprovada",
    description: "Disparado quando uma justificação de falta é aprovada.",
    category: "ATTENDANCE",
    defaultSeverity: NotificationSeverity.SUCCESS,
    supportedChannels: ["IN_APP"],
    variables: ["justificationId"],
    sampleVariables: { justificationId: "justification_demo123" },
    defaultTitleTemplate: "Justificação de falta aprovada",
    defaultBodyTemplate: "A sua justificação de falta foi aprovada.",
  },

  "attendance.justification_rejected": {
    eventType: "attendance.justification_rejected",
    label: "Justificação de falta rejeitada",
    description: "Disparado quando uma justificação de falta é rejeitada.",
    category: "ATTENDANCE",
    defaultSeverity: NotificationSeverity.WARNING,
    supportedChannels: ["IN_APP"],
    variables: ["justificationId", "rejectionReason"],
    sampleVariables: { justificationId: "justification_demo123", rejectionReason: "Documento ilegível" },
    defaultTitleTemplate: "Justificação de falta rejeitada",
    defaultBodyTemplate: "A sua justificação de falta foi rejeitada.",
  },

  "lesson.published": {
    eventType: "lesson.published",
    label: "Lição publicada",
    description: "Disparado quando uma lição é publicada. Catalogado para configuração futura — nenhum handler de notificação está associado ainda (nunca teve um destinatário único).",
    category: "LEARNING",
    defaultSeverity: NotificationSeverity.INFO,
    defaultActionUrlPattern: "/lessons/{{lessonId}}",
    supportedChannels: ["IN_APP"],
    variables: ["lessonId", "lessonTitle"],
    sampleVariables: { lessonId: "lesson_demo123", lessonTitle: "Introdução ao Código da Estrada" },
    defaultTitleTemplate: "Nova lição publicada",
    defaultBodyTemplate: "Uma nova lição foi publicada.",
  },
};

export function getEventCatalogEntry(eventType: string): NotificationEventDefinition | undefined {
  return NOTIFICATION_EVENT_CATALOG[eventType];
}

export function listEventCatalog(): NotificationEventDefinition[] {
  return Object.values(NOTIFICATION_EVENT_CATALOG);
}

/** LOW for INFO/SUCCESS-only events would bury real signal — NORMAL is the floor. */
export function defaultPriorityForSeverity(severity: NotificationSeverityType): string {
  switch (severity) {
    case NotificationSeverity.CRITICAL:
      return NotificationRulePriority.CRITICAL;
    case NotificationSeverity.WARNING:
      return NotificationRulePriority.HIGH;
    default:
      return NotificationRulePriority.NORMAL;
  }
}
