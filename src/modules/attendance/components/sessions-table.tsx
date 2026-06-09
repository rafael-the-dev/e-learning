"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { type PaginationState } from "@tanstack/react-table";
import { DataTable } from "@/shared/components/data/data-table";
import { EmptyState } from "@/shared/components/layout/empty-state";
import { Input } from "@/shared/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { getSessionColumns } from "./session-columns";
import {
  cancelAttendanceSessionAction,
  completeAttendanceSessionAction,
} from "@/modules/attendance/actions/attendance.actions";
import { toast } from "@/shared/hooks/use-toast";
import { ClipboardList } from "lucide-react";
import { ATTENDANCE_SESSION_STATUS_LABELS } from "@/modules/attendance/types";
import type { AttendanceSession } from "@/modules/attendance/types";
import type { PaginatedResult } from "@/shared/types/common";

interface FilterOption {
  id: string;
  name: string;
}

interface SessionsTableProps {
  result: PaginatedResult<AttendanceSession>;
  classGroups: FilterOption[];
  subjects: FilterOption[];
  defaultSearch?: string;
  defaultStatus?: string;
  defaultClassGroupId?: string;
  defaultSubjectId?: string;
  canComplete: boolean;
  canCancel: boolean;
}

const ALL = "__all__";

export function SessionsTable({
  result,
  classGroups,
  subjects,
  defaultSearch,
  defaultStatus,
  defaultClassGroupId,
  defaultSubjectId,
  canComplete,
  canCancel,
}: SessionsTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [search, setSearch] = React.useState(defaultSearch ?? "");
  const [status, setStatus] = React.useState(defaultStatus ?? ALL);
  const [classGroupId, setClassGroupId] = React.useState(defaultClassGroupId ?? ALL);
  const [subjectId, setSubjectId] = React.useState(defaultSubjectId ?? ALL);
  const [loading, setLoading] = React.useState(false);

  const pagination: PaginationState = {
    pageIndex: result.page - 1,
    pageSize: result.pageSize,
  };

  function push(overrides: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(overrides).forEach(([k, v]) => {
      if (v && v !== ALL) params.set(k, v);
      else params.delete(k);
    });
    params.delete("page");
    router.push(`?${params.toString()}`);
  }

  function handlePaginationChange(next: PaginationState) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(next.pageIndex + 1));
    router.push(`?${params.toString()}`);
  }

  const searchRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  function handleSearch(value: string) {
    setSearch(value);
    clearTimeout(searchRef.current);
    searchRef.current = setTimeout(() => push({ search: value }), 400);
  }

  async function handleComplete(session: AttendanceSession) {
    setLoading(true);
    const res = await completeAttendanceSessionAction({ sessionId: session.id });
    setLoading(false);
    if (res.success) toast({ title: "Sessão concluída" });
    else toast({ title: "Erro", description: res.error, variant: "destructive" });
    router.refresh();
  }

  async function handleCancel(session: AttendanceSession) {
    setLoading(true);
    const res = await cancelAttendanceSessionAction({ sessionId: session.id });
    setLoading(false);
    if (res.success) toast({ title: "Sessão cancelada" });
    else toast({ title: "Erro", description: res.error, variant: "destructive" });
    router.refresh();
  }

  const columns = getSessionColumns({
    onComplete: handleComplete,
    onCancel: handleCancel,
    canComplete,
    canCancel,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Pesquisar sessões..."
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v);
            push({ status: v });
          }}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os estados</SelectItem>
            {Object.entries(ATTENDANCE_SESSION_STATUS_LABELS).map(([val, label]) => (
              <SelectItem key={val} value={val}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={classGroupId}
          onValueChange={(v) => {
            setClassGroupId(v);
            push({ classGroupId: v });
          }}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Turma" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas as turmas</SelectItem>
            {classGroups.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={subjectId}
          onValueChange={(v) => {
            setSubjectId(v);
            push({ subjectId: v });
          }}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Disciplina" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas as disciplinas</SelectItem>
            {subjects.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {result.data.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="size-8" />}
          title="Nenhuma sessão encontrada"
          description="Crie uma nova sessão de presença para começar."
        />
      ) : (
        <DataTable
          columns={columns}
          data={result.data}
          totalRows={result.total}
          pagination={pagination}
          onPaginationChange={handlePaginationChange}
          isLoading={loading}
        />
      )}
    </div>
  );
}
