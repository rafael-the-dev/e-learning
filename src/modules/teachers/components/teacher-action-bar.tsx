"use client";

import Link from "next/link";
import { BookOpen, Building2, AlertTriangle } from "lucide-react";

interface Props {
  noSubjectsCount: number;
  noClassGroupCount: number;
  overdueAssessmentsCount: number;
}

export function TeacherActionBar({
  noSubjectsCount,
  noClassGroupCount,
  overdueAssessmentsCount,
}: Props) {
  if (!noSubjectsCount && !noClassGroupCount && !overdueAssessmentsCount) return null;

  return (
    <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b px-4 sm:px-8 py-2 flex items-center gap-2 flex-wrap">
      {overdueAssessmentsCount > 0 && (
        <Link
          href="/assessments?status=OPEN"
          className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-colors"
        >
          <AlertTriangle className="size-3" />
          {overdueAssessmentsCount} avaliação(ões) em atraso
        </Link>
      )}
      {noSubjectsCount > 0 && (
        <Link
          href="/teachers"
          className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100 transition-colors"
        >
          <BookOpen className="size-3" />
          {noSubjectsCount} sem disciplinas
        </Link>
      )}
      {noClassGroupCount > 0 && (
        <Link
          href="/teachers"
          className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors"
        >
          <Building2 className="size-3" />
          {noClassGroupCount} sem turma ativa
        </Link>
      )}
    </div>
  );
}
