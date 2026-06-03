import * as React from "react";
import { Badge } from "@/shared/components/ui/badge";
import type { BadgeProps } from "@/shared/components/ui/badge";

// =============================================================================
// STATUS BADGE
// Maps domain status strings to visual badge variants.
// Add new status mappings here as new modules are built.
// =============================================================================

const STATUS_MAP: Record<string, BadgeProps["variant"]> = {
  // Students / Teachers
  ACTIVE: "success",
  PENDING: "warning",
  SUSPENDED: "destructive",
  COMPLETED: "secondary",
  DROPPED: "destructive",
  INACTIVE: "secondary",
  ON_LEAVE: "warning",

  // Enrollments
  DRAFT: "secondary",
  PENDING_PAYMENT: "warning",
  CANCELLED: "destructive",

  // Financial
  PAID: "success",
  PARTIALLY_PAID: "warning",
  OVERDUE: "destructive",

  // Payments
  CONFIRMED: "success",
  REFUNDED: "info",

  // Lessons / Class Groups
  SCHEDULED: "info",
  FORMING: "warning",
  IN_PROGRESS: "info",
  NO_SHOW: "destructive",

  // Vehicles
  MAINTENANCE: "warning",

  // Organization
  TRIAL: "info",

  // Users
  DISABLED: "destructive",
  INVITED: "warning",
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Ativo",
  PENDING: "Pendente",
  SUSPENDED: "Suspenso",
  COMPLETED: "Concluído",
  DROPPED: "Abandonado",
  INACTIVE: "Inativo",
  ON_LEAVE: "Em Licença",
  DRAFT: "Rascunho",
  PENDING_PAYMENT: "Pagamento Pendente",
  CANCELLED: "Cancelado",
  PAID: "Pago",
  PARTIALLY_PAID: "Parcialmente Pago",
  OVERDUE: "Em Atraso",
  CONFIRMED: "Confirmado",
  REFUNDED: "Reembolsado",
  SCHEDULED: "Agendado",
  FORMING: "Em Formação",
  IN_PROGRESS: "Em Curso",
  NO_SHOW: "Não Compareceu",
  MAINTENANCE: "Em Manutenção",
  TRIAL: "Experimental",
  DISABLED: "Desativado",
  INVITED: "Convidado",
};

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const variant = STATUS_MAP[status] ?? "secondary";
  const label = STATUS_LABELS[status] ?? status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, " ");

  return (
    <Badge variant={variant} className={className}>
      {label}
    </Badge>
  );
}
