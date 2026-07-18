import { Badge } from "@/shared/components/ui/badge";

// =============================================================================
// STUDENT EXAMINATIONS — STATUS LABELS & BADGES (presentational only)
// -----------------------------------------------------------------------------
// Central PT-PT registry for the student-facing exam portal, mirroring the admin
// `examinations/components/status-badges.tsx` pattern: map a domain VALUE
// (English, from the DTO) → PT-PT label + badge variant. Pure display, no logic,
// server-renderable. Unknown values fall back to the raw value with a neutral
// variant. Domain strings stay English; PT-PT lives only at this render layer.
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

// The student's own candidate status.
const CANDIDATE: Registry = {
  PENDING_ELIGIBILITY: { label: "Pendente", variant: "secondary" },
  ELIGIBLE: { label: "Elegível", variant: "info" },
  INELIGIBLE: { label: "Não elegível", variant: "destructive" },
  REGISTERED: { label: "Inscrito", variant: "success" },
  WITHDRAWN: { label: "Retirado", variant: "secondary" },
  DISQUALIFIED: { label: "Desqualificado", variant: "destructive" },
};

// Published-result outcome code.
const RESULT_CODE: Registry = {
  SCORED: { label: "Pontuado", variant: "info" },
  ABSENT: { label: "Ausente", variant: "secondary" },
  EXCUSED: { label: "Justificado", variant: "secondary" },
  DISQUALIFIED: { label: "Desqualificado", variant: "destructive" },
};

// Attendance status recorded for the candidacy.
const ATTENDANCE: Registry = {
  PRESENT: { label: "Presente", variant: "success" },
  ABSENT: { label: "Ausente", variant: "destructive" },
  LATE: { label: "Atrasado", variant: "warning" },
  EXCUSED: { label: "Justificado", variant: "secondary" },
  DISQUALIFIED: { label: "Desqualificado", variant: "destructive" },
};

// Appeal lifecycle status.
const APPEAL: Registry = {
  PENDING: { label: "Pendente", variant: "warning" },
  UNDER_REVIEW: { label: "Em análise", variant: "info" },
  APPROVED: { label: "Aprovado", variant: "success" },
  REJECTED: { label: "Rejeitado", variant: "destructive" },
  WITHDRAWN: { label: "Retirado", variant: "secondary" },
  CLOSED: { label: "Encerrado", variant: "secondary" },
};

// Public decision on an appeal (never the private decisionReason).
const APPEAL_DECISION: Registry = {
  APPROVED: { label: "Aprovado", variant: "success" },
  REJECTED: { label: "Rejeitado", variant: "destructive" },
};

// Eligibility blocker codes → PT-PT reasons. Label-only (no badge variant); an
// unknown code renders its raw value so nothing is silently swallowed.
const ELIGIBILITY_BLOCKER: Record<string, string> = {
  NO_STUDENT: "Sem aluno associado",
  NO_ACTIVE_ENROLLMENT: "Sem matrícula ativa",
  LEVEL_SUBJECT_NOT_FOUND: "Disciplina não encontrada",
  SUBJECT_NOT_REGISTERED: "Disciplina não inscrita",
  SUBJECT_ALREADY_PASSED: "Disciplina já concluída",
  ATTENDANCE_BELOW_REQUIRED: "Frequência insuficiente",
  PREREQUISITE_NOT_MET: "Pré-requisito não cumprido",
  FINANCIAL_CLEARANCE_REQUIRED: "Regularização financeira necessária",
  DISCIPLINARY_BLOCK: "Bloqueio disciplinar",
  EXAM_PERIOD_CLOSED: "Época de exames fechada",
  EXAM_SESSION_NOT_AVAILABLE: "Sessão de exame indisponível",
};

const REGISTRIES = {
  session: SESSION,
  candidate: CANDIDATE,
  resultCode: RESULT_CODE,
  attendance: ATTENDANCE,
  appeal: APPEAL,
  appealDecision: APPEAL_DECISION,
} as const;

export type StudentExamBadgeKind = keyof typeof REGISTRIES;

/** PT-PT label for a status VALUE (same source as the badges). Falls back to the
 *  raw value for unmapped states. */
export function getStudentExamStatusLabel(kind: StudentExamBadgeKind, value: string): string {
  return REGISTRIES[kind][value]?.label ?? value;
}

/** PT-PT reason for an eligibility blocker code. Unknown codes return the raw code. */
export function translateEligibilityBlocker(code: string): string {
  return ELIGIBILITY_BLOCKER[code] ?? code;
}

export function StudentExamStatusBadge({
  kind,
  status,
}: {
  kind: StudentExamBadgeKind;
  status: string | null | undefined;
}) {
  if (!status) return <Badge variant="outline">—</Badge>;
  const entry = REGISTRIES[kind][status];
  return <Badge variant={entry?.variant ?? "outline"}>{entry?.label ?? status}</Badge>;
}

export const SessionStatusBadge = ({ status }: { status: string | null | undefined }) => (
  <StudentExamStatusBadge kind="session" status={status} />
);
export const CandidateStatusBadge = ({ status }: { status: string | null | undefined }) => (
  <StudentExamStatusBadge kind="candidate" status={status} />
);
export const ResultCodeBadge = ({ status }: { status: string | null | undefined }) => (
  <StudentExamStatusBadge kind="resultCode" status={status} />
);
export const AttendanceStatusBadge = ({ status }: { status: string | null | undefined }) => (
  <StudentExamStatusBadge kind="attendance" status={status} />
);
export const AppealStatusBadge = ({ status }: { status: string | null | undefined }) => (
  <StudentExamStatusBadge kind="appeal" status={status} />
);
export const AppealDecisionBadge = ({ status }: { status: string | null | undefined }) => (
  <StudentExamStatusBadge kind="appealDecision" status={status} />
);

// ─── Shared formatting helpers (pt-PT) ───────────────────────────────────────

/** Short date, e.g. "17/07/2026". */
export const formatExamDate = (d: Date | string): string =>
  new Date(d).toLocaleDateString("pt-PT");

/** Time only, e.g. "14:30". */
export const formatExamTime = (d: Date | string): string =>
  new Date(d).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });

/** Duration in minutes → "2h00" / "1h30" / "45min". Null when unknown. */
export function formatExamDuration(minutes: number | null): string | null {
  if (minutes == null) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}min`;
  return `${h}h${String(m).padStart(2, "0")}`;
}
