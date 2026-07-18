import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { ExaminationEmptyState } from "@/modules/examinations/components/examination-states";
import type { TeacherExamSessionListItemDto } from "@/modules/teacher-examinations/types";
import { SessionStatusBadge, RoleBadge, formatExamDate, formatExamTime } from "./teacher-exam-status-labels";

// Overview short-lists for the teacher exam Resumo. Presentational — each row
// links into the session detail keyed by examSessionId.

function sessionHref(examSessionId: string): string {
  return `/teacher/examinations/sessions/${examSessionId}`;
}

export function NextSessionHighlight({ session }: { session: TeacherExamSessionListItemDto }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Próximo exame</CardTitle>
      </CardHeader>
      <CardContent>
        <Link
          href={sessionHref(session.examSessionId)}
          className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-4 transition-colors hover:bg-muted/50"
        >
          <div className="space-y-1">
            <p className="font-semibold">{session.subjectName ?? session.title}</p>
            <p className="text-sm text-muted-foreground">
              {formatExamDate(session.startsAt)} · {formatExamTime(session.startsAt)}
              {session.roomName ? ` · ${session.roomName}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <RoleBadge status={session.role} />
            <SessionStatusBadge status={session.sessionStatus} />
          </div>
        </Link>
      </CardContent>
    </Card>
  );
}

function ShortListRow({ session }: { session: TeacherExamSessionListItemDto }) {
  return (
    <li>
      <Link
        href={sessionHref(session.examSessionId)}
        className="flex items-center justify-between gap-3 py-3 transition-colors hover:bg-muted/40"
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{session.subjectName ?? session.title}</p>
          <p className="text-xs text-muted-foreground">
            {formatExamDate(session.startsAt)} · {formatExamTime(session.startsAt)}
          </p>
        </div>
        <SessionStatusBadge status={session.sessionStatus} />
      </Link>
    </li>
  );
}

export function TodayShortList({ items }: { items: TeacherExamSessionListItemDto[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Hoje</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <ExaminationEmptyState
            title="Sem exames hoje."
            description="As sessões de exame que te forem atribuídas para hoje aparecerão aqui."
          />
        ) : (
          <ul className="divide-y">
            {items.map((session) => (
              <ShortListRow key={session.examSessionId} session={session} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function RecentlyCompletedShortList({ items }: { items: TeacherExamSessionListItemDto[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Concluídos recentemente</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <ExaminationEmptyState
            title="Sem exames concluídos recentemente."
            description="As sessões concluídas em que participaste aparecerão aqui."
          />
        ) : (
          <ul className="divide-y">
            {items.map((session) => (
              <ShortListRow key={session.examSessionId} session={session} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
