import { Badge } from "@/shared/components/ui/badge";

// =============================================================================
// EXAMINATION STATUS BADGES (Phase 12, Increment 3) — presentational only
// -----------------------------------------------------------------------------
// Pure display: map a domain status VALUE (English, from the DTO) to a PT-PT
// label + a badge variant. NO logic, NO permission/lifecycle decision. Server-
// renderable. Unknown values fall back to the raw value with a neutral variant.
// =============================================================================

type Variant = "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info";
type Entry = { label: string; variant: Variant };
type Registry = Record<string, Entry>;

const PERIOD: Registry = {
  DRAFT: { label: "Rascunho", variant: "secondary" },
  OPEN: { label: "Aberto", variant: "info" },
  LOCKED: { label: "Bloqueado", variant: "warning" },
  COMPLETED: { label: "Concluído", variant: "success" },
  CANCELLED: { label: "Cancelado", variant: "destructive" },
};
const SESSION: Registry = {
  DRAFT: { label: "Rascunho", variant: "secondary" },
  SCHEDULED: { label: "Agendada", variant: "info" },
  LOCKED: { label: "Bloqueada", variant: "warning" },
  IN_PROGRESS: { label: "Em curso", variant: "info" },
  COMPLETED: { label: "Concluída", variant: "success" },
  RESULTS_RECORDED: { label: "Resultados registados", variant: "info" },
  PUBLISHED: { label: "Publicada", variant: "success" },
  CANCELLED: { label: "Cancelada", variant: "destructive" },
};
const ROOM: Registry = {
  ACTIVE: { label: "Ativa", variant: "success" },
  INACTIVE: { label: "Inativa", variant: "secondary" },
  ARCHIVED: { label: "Arquivada", variant: "outline" },
};
const RESULT: Registry = {
  DRAFT: { label: "Rascunho", variant: "secondary" },
  SUBMITTED: { label: "Submetido", variant: "info" },
  REVIEWED: { label: "Revisto", variant: "warning" },
  APPROVED: { label: "Aprovado", variant: "success" },
  PUBLISHED: { label: "Publicado", variant: "success" },
  INVALIDATED: { label: "Invalidado", variant: "destructive" },
};
const CANDIDATE: Registry = {
  PENDING_ELIGIBILITY: { label: "Elegibilidade pendente", variant: "secondary" },
  ELIGIBLE: { label: "Elegível", variant: "info" },
  INELIGIBLE: { label: "Não elegível", variant: "destructive" },
  REGISTERED: { label: "Inscrito", variant: "success" },
  WITHDRAWN: { label: "Retirado", variant: "secondary" },
  DISQUALIFIED: { label: "Desqualificado", variant: "destructive" },
};
const ATTENDANCE: Registry = {
  PRESENT: { label: "Presente", variant: "success" },
  ABSENT: { label: "Ausente", variant: "destructive" },
  LATE: { label: "Atrasado", variant: "warning" },
  EXCUSED: { label: "Justificado", variant: "info" },
  DISQUALIFIED: { label: "Desqualificado", variant: "destructive" },
};
const APPEAL: Registry = {
  PENDING: { label: "Pendente", variant: "secondary" },
  UNDER_REVIEW: { label: "Em análise", variant: "info" },
  APPROVED: { label: "Aprovado", variant: "success" },
  REJECTED: { label: "Rejeitado", variant: "destructive" },
  WITHDRAWN: { label: "Retirado", variant: "secondary" },
  CLOSED: { label: "Encerrado", variant: "secondary" },
};
const GRADE_STATE: Registry = {
  CURRENT: { label: "Atual", variant: "success" },
  MISSING: { label: "Em falta", variant: "warning" },
  STALE: { label: "Desatualizado", variant: "warning" },
  UNSUPPORTED: { label: "Não suportado", variant: "secondary" },
};
const RESULT_CODE: Registry = {
  SCORED: { label: "Pontuado", variant: "info" },
  ABSENT: { label: "Ausente", variant: "secondary" },
  EXCUSED: { label: "Justificado", variant: "secondary" },
  DISQUALIFIED: { label: "Desqualificado", variant: "destructive" },
};

const REGISTRIES = {
  period: PERIOD,
  session: SESSION,
  room: ROOM,
  result: RESULT,
  candidate: CANDIDATE,
  attendance: ATTENDANCE,
  appeal: APPEAL,
  gradeState: GRADE_STATE,
  resultCode: RESULT_CODE,
} as const;

export type ExaminationBadgeKind = keyof typeof REGISTRIES;

/** Value→PT-PT label options for a status vocabulary, for filter selects. Keeps the
 *  filter labels identical to the badges (single source of truth). */
export function getStatusOptions(kind: ExaminationBadgeKind): Array<{ value: string; label: string }> {
  return Object.entries(REGISTRIES[kind]).map(([value, entry]) => ({ value, label: entry.label }));
}

export function ExaminationStatusBadge({
  kind,
  status,
}: {
  kind: ExaminationBadgeKind;
  status: string | null | undefined;
}) {
  if (!status) return <Badge variant="outline">—</Badge>;
  const entry = REGISTRIES[kind][status];
  return <Badge variant={entry?.variant ?? "outline"}>{entry?.label ?? status}</Badge>;
}

export const ResultStatusBadge = ({ status }: { status: string | null | undefined }) => (
  <ExaminationStatusBadge kind="result" status={status} />
);
export const CandidateStatusBadge = ({ status }: { status: string | null | undefined }) => (
  <ExaminationStatusBadge kind="candidate" status={status} />
);
export const AppealStatusBadge = ({ status }: { status: string | null | undefined }) => (
  <ExaminationStatusBadge kind="appeal" status={status} />
);
