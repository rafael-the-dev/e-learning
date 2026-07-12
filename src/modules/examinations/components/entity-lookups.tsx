"use client";

import { EntityLookupCombobox, type LookupItem } from "./entity-lookup-combobox";

// =============================================================================
// Entity lookups (Increment 4) — thin specialisations of EntityLookupCombobox.
// Each only supplies a fetcher (hitting a /lookups route) + labels + recent key.
// Same behaviour everywhere: search, debounce, loading, empty, keyboard, clear,
// selected badge, recent selections.
// =============================================================================

interface LookupProps {
  value: string | null;
  selectedLabel?: string | null;
  onChange: (value: string | null, item: LookupItem | null) => void;
  disabled?: boolean;
}

async function fetchItems(url: string): Promise<Array<Record<string, unknown>>> {
  const res = await fetch(url);
  if (!res.ok) return [];
  const json = (await res.json().catch(() => ({}))) as { items?: Array<Record<string, unknown>> };
  return json.items ?? [];
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const strOrUndef = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);

export function StudentLookup(props: LookupProps) {
  return (
    <EntityLookupCombobox
      {...props}
      recentKey="exam.recent.students"
      placeholder="Pesquisar aluno por nome ou número…"
      emptyText="Nenhum aluno encontrado."
      fetcher={async (q) =>
        (await fetchItems(`/api/examinations/lookups/students?q=${encodeURIComponent(q)}`)).map((r) => ({
          value: str(r.id),
          label: str(r.name),
          sublabel: strOrUndef(r.code) ? `Nº ${str(r.code)}` : undefined,
        }))
      }
    />
  );
}

export function EnrollmentLookup({ studentId, ...props }: LookupProps & { studentId: string | null }) {
  return (
    <EntityLookupCombobox
      {...props}
      disabled={props.disabled || !studentId}
      placeholder={studentId ? "Selecionar matrícula…" : "Escolha primeiro o aluno"}
      emptyText="Este aluno não tem matrículas."
      fetcher={async () =>
        studentId
          ? (await fetchItems(`/api/examinations/lookups/enrollments?studentId=${encodeURIComponent(studentId)}`)).map((r) => ({
              value: str(r.id),
              label: str(r.courseName),
              sublabel: strOrUndef(r.enrollmentNumber) ? `Matrícula ${str(r.enrollmentNumber)} · ${str(r.status)}` : str(r.status),
            }))
          : []
      }
    />
  );
}

export function RoomLookup(props: LookupProps) {
  return (
    <EntityLookupCombobox
      {...props}
      recentKey="exam.recent.rooms"
      placeholder="Pesquisar sala por nome ou código…"
      emptyText="Nenhuma sala encontrada."
      fetcher={async (q) =>
        (await fetchItems(`/api/examinations/lookups/rooms?q=${encodeURIComponent(q)}`)).map((r) => ({
          value: str(r.id),
          label: str(r.name),
          sublabel: strOrUndef(r.code),
        }))
      }
    />
  );
}

export function LevelSubjectLookup(props: LookupProps) {
  return (
    <EntityLookupCombobox
      {...props}
      recentKey="exam.recent.levelSubjects"
      placeholder="Pesquisar disciplina…"
      emptyText="Nenhuma disciplina encontrada."
      fetcher={async (q) =>
        (await fetchItems(`/api/examinations/lookups/level-subjects?q=${encodeURIComponent(q)}`)).map((r) => ({
          value: str(r.id),
          label: str(r.subjectName),
          sublabel: [str(r.courseName), str(r.levelName)].filter(Boolean).join(" · ") || undefined,
        }))
      }
    />
  );
}

export function PeriodLookup(props: LookupProps) {
  return (
    <EntityLookupCombobox
      {...props}
      recentKey="exam.recent.periods"
      placeholder="Pesquisar período…"
      emptyText="Nenhum período encontrado."
      fetcher={async (q) =>
        (await fetchItems(`/api/examinations/lookups/periods?q=${encodeURIComponent(q)}`)).map((r) => ({
          value: str(r.id),
          label: str(r.name),
          sublabel: strOrUndef(r.academicYear),
        }))
      }
    />
  );
}
