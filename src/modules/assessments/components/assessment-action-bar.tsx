"use client";

import Link from "next/link";
import { Clock, RefreshCw, Send, Calendar } from "lucide-react";

interface Props {
  openCount: number;
  scheduledCount: number;
  pendingRetakesCount: number;
  readyToPublishCount: number;
}

export function AssessmentActionBar({
  openCount,
  scheduledCount,
  pendingRetakesCount,
  readyToPublishCount,
}: Props) {
  if (!openCount && !scheduledCount && !pendingRetakesCount && !readyToPublishCount) return null;

  return (
    <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b px-4 sm:px-8 py-2 flex items-center gap-2 flex-wrap">
      {openCount > 0 && (
        <Link
          href="/assessments?status=OPEN"
          className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors"
        >
          <Clock className="size-3" />
          {openCount} em curso
        </Link>
      )}
      {scheduledCount > 0 && (
        <Link
          href="/assessments?status=SCHEDULED"
          className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition-colors"
        >
          <Calendar className="size-3" />
          {scheduledCount} agendada(s)
        </Link>
      )}
      {pendingRetakesCount > 0 && (
        <Link
          href="/assessments"
          className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-colors"
        >
          <RefreshCw className="size-3" />
          {pendingRetakesCount} repetição(ões)
        </Link>
      )}
      {readyToPublishCount > 0 && (
        <Link
          href="/assessments?status=GRADED"
          className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors"
        >
          <Send className="size-3" />
          {readyToPublishCount} para publicar
        </Link>
      )}
    </div>
  );
}
