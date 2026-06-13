"use client";

import Link from "next/link";
import { Layers, BookOpen, Users, GraduationCap, FileEdit } from "lucide-react";

interface Props {
  noLevelsCount: number;
  noSubjectsCount: number;
  noClassGroupCount: number;
  noEnrollmentsCount: number;
  staleDraftCount: number;
}

export function CourseActionBar({
  noLevelsCount,
  noSubjectsCount,
  noClassGroupCount,
  noEnrollmentsCount,
  staleDraftCount,
}: Props) {
  if (
    !noLevelsCount &&
    !noSubjectsCount &&
    !noClassGroupCount &&
    !noEnrollmentsCount &&
    !staleDraftCount
  )
    return null;

  return (
    <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b px-4 sm:px-8 py-2 flex items-center gap-2 flex-wrap">
      {noLevelsCount > 0 && (
        <Link
          href="/courses?status=ACTIVE"
          className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-colors"
        >
          <Layers className="size-3" />
          {noLevelsCount} sem nível
        </Link>
      )}
      {noSubjectsCount > 0 && (
        <Link
          href="/courses?status=ACTIVE"
          className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100 transition-colors"
        >
          <BookOpen className="size-3" />
          {noSubjectsCount} sem disciplinas
        </Link>
      )}
      {noClassGroupCount > 0 && (
        <Link
          href="/courses?status=ACTIVE"
          className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors"
        >
          <Users className="size-3" />
          {noClassGroupCount} sem turma ativa
        </Link>
      )}
      {noEnrollmentsCount > 0 && (
        <Link
          href="/enrollments"
          className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors"
        >
          <GraduationCap className="size-3" />
          {noEnrollmentsCount} sem matrículas
        </Link>
      )}
      {staleDraftCount > 0 && (
        <Link
          href="/courses?status=DRAFT"
          className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100 transition-colors"
        >
          <FileEdit className="size-3" />
          {staleDraftCount} rascunho(s) parado(s)
        </Link>
      )}
    </div>
  );
}
