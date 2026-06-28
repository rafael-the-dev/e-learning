"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Users } from "lucide-react";
import { STUDENT_STATUS_LABELS } from "@/modules/students/types";
import type { GuardianStudentOption } from "@/modules/guardian-portal/types";

interface Props {
  students: GuardianStudentOption[];
  selectedStudentId: string | null;
}

const STATUS_BADGE: Record<string, "success" | "warning" | "destructive" | "secondary"> = {
  ACTIVE: "success",
  PENDING: "warning",
  SUSPENDED: "destructive",
  DROPPED: "destructive",
  COMPLETED: "secondary",
};

/**
 * Top-of-portal student switcher. Changing the selection updates the
 * `?studentId=` query param; the server re-validates it against the guardian's
 * links before using it (the param is only a *request*, never trusted).
 */
export function GuardianStudentSelector({ students, selectedStudentId }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const selected = students.find((s) => s.studentId === selectedStudentId) ?? students[0];

  function onChange(studentId: string) {
    startTransition(() => {
      router.push(`/guardian?studentId=${encodeURIComponent(studentId)}`);
    });
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-muted">
            <Users className="size-4 text-muted-foreground" />
          </span>
          <div>
            <p className="text-xs text-muted-foreground">Educando selecionado</p>
            <p className="text-sm font-medium">{selected?.studentName ?? "—"}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {selected && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {selected.studentNumber && <span>Nº {selected.studentNumber}</span>}
              {selected.courseName && <span className="hidden sm:inline">· {selected.courseName}</span>}
              {selected.classGroupName && <span className="hidden sm:inline">· {selected.classGroupName}</span>}
              <Badge variant={STATUS_BADGE[selected.status] ?? "secondary"}>
                {STUDENT_STATUS_LABELS[selected.status] ?? selected.status}
              </Badge>
            </div>
          )}

          {students.length > 1 ? (
            <Select value={selected?.studentId} onValueChange={onChange} disabled={isPending}>
              <SelectTrigger className="w-full sm:w-64" aria-label="Selecionar educando">
                <SelectValue placeholder="Selecionar educando" />
              </SelectTrigger>
              <SelectContent>
                {students.map((s) => (
                  <SelectItem key={s.studentId} value={s.studentId}>
                    {s.studentName}
                    {s.courseName ? ` — ${s.courseName}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
