import { Badge } from "@/shared/components/ui/badge";

// =============================================================================
// TEACHER EXAMINATIONS — STATUS LABELS & BADGES (presentational only)
// -----------------------------------------------------------------------------
// Central PT-PT registry for the teacher-facing exam portal, mirroring the admin
// `examinations/components/status-badges.tsx` and student portal patterns: map a
// domain VALUE (English, from the DTO) → PT-PT label + badge variant. Pure display,
// no logic, server-renderable. Unknown values fall back to the raw value with a
// neutral variant. Domain strings stay English; PT-PT lives only at this render
// layer.
// =============================================================================

type Variant = "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info";
type Entry = { label: string; variant: Variant };
type Registry = Record<string, Entry>;

// ExamSession lifecycle — same labels as the admin registry.
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

// The teacher's invigilator/marker role on a session.
const ROLE: Registry = {
  CHIEF: { label: "Vigilante-chefe", variant: "default" },
  INVIGILATOR: { label: "Vigilante", variant: "info" },
  MARKER: { label: "Corretor", variant: "warning" },
  OBSERVER: { label: "Observador", variant: "secondary" },
};

// A candidate's status in the session.
const CANDIDATE: Registry = {
  PENDING_ELIGIBILITY: { label: "Elegibilidade pendente", variant: "secondary" },
  ELIGIBLE: { label: "Elegível", variant: "info" },
  INELIGIBLE: { label: "Não elegível", variant: "destructive" },
  REGISTERED: { label: "Inscrito", variant: "success" },
  WITHDRAWN: { label: "Retirado", variant: "secondary" },
  DISQUALIFIED: { label: "Desqualificado", variant: "destructive" },
};

// Attendance status recorded for a candidacy.
const ATTENDANCE: Registry = {
  PRESENT: { label: "Presente", variant: "success" },
  ABSENT: { label: "Ausente", variant: "destructive" },
  LATE: { label: "Atrasado", variant: "warning" },
  EXCUSED: { label: "Justificado", variant: "info" },
  DISQUALIFIED: { label: "Desqualificado", variant: "destructive" },
};

// Result lifecycle status for a candidacy.
const RESULT: Registry = {
  DRAFT: { label: "Rascunho", variant: "secondary" },
  SUBMITTED: { label: "Submetido", variant: "info" },
  REVIEWED: { label: "Revisto", variant: "warning" },
  APPROVED: { label: "Aprovado", variant: "success" },
  PUBLISHED: { label: "Publicado", variant: "success" },
  INVALIDATED: { label: "Invalidado", variant: "destructive" },
};

// Published-result outcome code.
const RESULT_CODE: Registry = {
  SCORED: { label: "Pontuado", variant: "info" },
  ABSENT: { label: "Ausente", variant: "secondary" },
  EXCUSED: { label: "Justificado", variant: "secondary" },
  DISQUALIFIED: { label: "Desqualificado", variant: "destructive" },
};

const REGISTRIES = {
  session: SESSION,
  role: ROLE,
  candidate: CANDIDATE,
  attendance: ATTENDANCE,
  result: RESULT,
  resultCode: RESULT_CODE,
} as const;

export type TeacherExamBadgeKind = keyof typeof REGISTRIES;

/** Value→PT-PT label options for a status vocabulary, for filter selects. Keeps the
 *  filter labels identical to the badges (single source of truth). */
export function getTeacherExamStatusOptions(
  kind: TeacherExamBadgeKind
): Array<{ value: string; label: string }> {
  return Object.entries(REGISTRIES[kind]).map(([value, entry]) => ({ value, label: entry.label }));
}

/** PT-PT label for a status VALUE (same source as the badges). Falls back to the
 *  raw value for unmapped states. */
export function getTeacherExamStatusLabel(kind: TeacherExamBadgeKind, value: string): string {
  return REGISTRIES[kind][value]?.label ?? value;
}

export function TeacherExamStatusBadge({
  kind,
  status,
}: {
  kind: TeacherExamBadgeKind;
  status: string | null | undefined;
}) {
  if (!status) return <Badge variant="outline">—</Badge>;
  const entry = REGISTRIES[kind][status];
  return <Badge variant={entry?.variant ?? "outline"}>{entry?.label ?? status}</Badge>;
}

export const SessionStatusBadge = ({ status }: { status: string | null | undefined }) => (
  <TeacherExamStatusBadge kind="session" status={status} />
);
export const RoleBadge = ({ status }: { status: string | null | undefined }) => (
  <TeacherExamStatusBadge kind="role" status={status} />
);
export const CandidateStatusBadge = ({ status }: { status: string | null | undefined }) => (
  <TeacherExamStatusBadge kind="candidate" status={status} />
);
export const AttendanceStatusBadge = ({ status }: { status: string | null | undefined }) => (
  <TeacherExamStatusBadge kind="attendance" status={status} />
);
export const ResultStatusBadge = ({ status }: { status: string | null | undefined }) => (
  <TeacherExamStatusBadge kind="result" status={status} />
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
