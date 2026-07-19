import { Badge } from "@/shared/components/ui/badge";

// =============================================================================
// GUARDIAN EXAMINATIONS — STATUS LABELS & BADGES (presentational only)
// -----------------------------------------------------------------------------
// PT-PT render layer for the supervision (guardian) exam portal. Maps a domain
// VALUE (English, from the DTO) → PT-PT label + badge variant. Pure display, no
// logic, server-renderable. Unknown values fall back to the raw value with a
// neutral variant. Domain strings stay English; PT-PT lives only here.
// =============================================================================

type Variant = "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info";
type Entry = { label: string; variant: Variant };
type Registry = Record<string, Entry>;

// ExamSession lifecycle.
const SESSION: Registry = {
  DRAFT: { label: "Rascunho", variant: "secondary" },
  SCHEDULED: { label: "Agendado", variant: "info" },
  LOCKED: { label: "Bloqueado", variant: "warning" },
  IN_PROGRESS: { label: "Em curso", variant: "info" },
  COMPLETED: { label: "Concluído", variant: "success" },
  RESULTS_RECORDED: { label: "Resultados registados", variant: "info" },
  PUBLISHED: { label: "Publicado", variant: "success" },
  CANCELLED: { label: "Cancelado", variant: "destructive" },
};

// Published-result outcome code.
const RESULT_CODE: Registry = {
  SCORED: { label: "Pontuado", variant: "info" },
  ABSENT: { label: "Ausente", variant: "secondary" },
  EXCUSED: { label: "Justificado", variant: "secondary" },
  DISQUALIFIED: { label: "Desqualificado", variant: "destructive" },
};

// GuardianStudent relationship type.
const RELATIONSHIP: Registry = {
  FATHER: { label: "Pai", variant: "outline" },
  MOTHER: { label: "Mãe", variant: "outline" },
  GUARDIAN: { label: "Encarregado", variant: "outline" },
  SPONSOR: { label: "Responsável", variant: "outline" },
  OTHER: { label: "Outro", variant: "outline" },
};

// Appeal lifecycle status (read-only supervision view).
const APPEAL_STATUS: Registry = {
  PENDING: { label: "Pendente", variant: "warning" },
  UNDER_REVIEW: { label: "Em análise", variant: "info" },
  APPROVED: { label: "Aprovado", variant: "success" },
  REJECTED: { label: "Rejeitado", variant: "destructive" },
  WITHDRAWN: { label: "Retirado", variant: "secondary" },
  CLOSED: { label: "Encerrado", variant: "secondary" },
};

// Public appeal decision outcome.
const APPEAL_DECISION: Registry = {
  APPROVED: { label: "Aprovado", variant: "success" },
  REJECTED: { label: "Rejeitado", variant: "destructive" },
};

// Candidate attendance status.
const ATTENDANCE: Registry = {
  PRESENT: { label: "Presente", variant: "success" },
  ABSENT: { label: "Ausente", variant: "destructive" },
  LATE: { label: "Atrasado", variant: "warning" },
  EXCUSED: { label: "Justificado", variant: "secondary" },
  DISQUALIFIED: { label: "Desqualificado", variant: "destructive" },
};

const REGISTRIES = {
  session: SESSION,
  resultCode: RESULT_CODE,
  relationship: RELATIONSHIP,
  appealStatus: APPEAL_STATUS,
  appealDecision: APPEAL_DECISION,
  attendance: ATTENDANCE,
} as const;

export type GuardianExamBadgeKind = keyof typeof REGISTRIES;

/** PT-PT label for a status VALUE (same source as the badges). Falls back to the
 *  raw value for unmapped states. */
export function getGuardianExamStatusLabel(kind: GuardianExamBadgeKind, value: string): string {
  return REGISTRIES[kind][value]?.label ?? value;
}

export function GuardianExamStatusBadge({
  kind,
  status,
}: {
  kind: GuardianExamBadgeKind;
  status: string | null | undefined;
}) {
  if (!status) return <Badge variant="outline">—</Badge>;
  const entry = REGISTRIES[kind][status];
  return <Badge variant={entry?.variant ?? "outline"}>{entry?.label ?? status}</Badge>;
}

export const SessionStatusBadge = ({ status }: { status: string | null | undefined }) => (
  <GuardianExamStatusBadge kind="session" status={status} />
);
export const ResultCodeBadge = ({ status }: { status: string | null | undefined }) => (
  <GuardianExamStatusBadge kind="resultCode" status={status} />
);
export const RelationshipBadge = ({ status }: { status: string | null | undefined }) => (
  <GuardianExamStatusBadge kind="relationship" status={status} />
);
export const AppealStatusBadge = ({ status }: { status: string | null | undefined }) => (
  <GuardianExamStatusBadge kind="appealStatus" status={status} />
);
export const AppealDecisionBadge = ({ status }: { status: string | null | undefined }) => (
  <GuardianExamStatusBadge kind="appealDecision" status={status} />
);
export const AttendanceStatusBadge = ({ status }: { status: string | null | undefined }) => (
  <GuardianExamStatusBadge kind="attendance" status={status} />
);

// ─── Shared formatting helpers (pt-PT) ───────────────────────────────────────

/** Short date, e.g. "17/07/2026". */
export const formatExamDate = (d: Date | string): string =>
  new Date(d).toLocaleDateString("pt-PT");

/** Time only, e.g. "14:30". */
export const formatExamTime = (d: Date | string): string =>
  new Date(d).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });

/** Duration in minutes → "2h00" / "45min". */
export const formatExamDuration = (minutes: number | null): string | null => {
  if (minutes == null) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}min`;
  return `${h}h${String(m).padStart(2, "0")}`;
};
