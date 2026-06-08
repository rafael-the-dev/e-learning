"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { Badge } from "@/shared/components/ui/badge";
import { EmptyState } from "@/shared/components/layout/empty-state";
import { LessonAttachmentsPanel } from "./lesson-attachments-panel";
import { BookOpen, FileText, Paperclip } from "lucide-react";
import Link from "next/link";
import type { LessonAttachment } from "@/modules/lessons/types";

interface LessonDetailTabsProps {
  description: string | null;
  objectives: string | null;
  lessonId: string;
  attachments: LessonAttachment[];
  canCreateAttachment: boolean;
  canDeleteAttachment: boolean;
  subjects: { subjectId: string; subjectName: string }[];
}

export function LessonDetailTabs({
  description,
  objectives,
  lessonId,
  attachments,
  canCreateAttachment,
  canDeleteAttachment,
  subjects,
}: LessonDetailTabsProps) {
  return (
    <Tabs defaultValue="description">
      <TabsList>
        <TabsTrigger value="description">
          <FileText className="size-3.5 mr-1.5" />
          Descrição
        </TabsTrigger>
        <TabsTrigger value="attachments">
          <Paperclip className="size-3.5 mr-1.5" />
          Anexos
          {attachments.length > 0 && (
            <span className="ml-1.5 rounded-full bg-muted-foreground/20 px-1.5 py-px text-xs font-medium tabular-nums">
              {attachments.length}
            </span>
          )}
        </TabsTrigger>
        <TabsTrigger value="subjects">
          <BookOpen className="size-3.5 mr-1.5" />
          Disciplinas
          {subjects.length > 0 && (
            <span className="ml-1.5 rounded-full bg-muted-foreground/20 px-1.5 py-px text-xs font-medium tabular-nums">
              {subjects.length}
            </span>
          )}
        </TabsTrigger>
      </TabsList>

      {/* Description */}
      <TabsContent value="description" className="space-y-6">
        {!description && !objectives ? (
          <EmptyState
            icon={<FileText className="size-8" />}
            title="Sem descrição"
            description="Esta lição ainda não tem descrição nem objetivos definidos."
          />
        ) : (
          <>
            {description && (
              <section className="space-y-2">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Descrição
                </h3>
                <p className="text-sm whitespace-pre-wrap leading-relaxed">{description}</p>
              </section>
            )}
            {objectives && (
              <section className="space-y-2">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Objetivos de Aprendizagem
                </h3>
                <p className="text-sm whitespace-pre-wrap leading-relaxed">{objectives}</p>
              </section>
            )}
          </>
        )}
      </TabsContent>

      {/* Attachments */}
      <TabsContent value="attachments">
        <LessonAttachmentsPanel
          lessonId={lessonId}
          attachments={attachments}
          canCreate={canCreateAttachment}
          canDelete={canDeleteAttachment}
        />
      </TabsContent>

      {/* Subjects */}
      <TabsContent value="subjects">
        {subjects.length === 0 ? (
          <EmptyState
            icon={<BookOpen className="size-8" />}
            title="Sem disciplinas"
            description="Esta lição ainda não foi atribuída a nenhuma disciplina."
          />
        ) : (
          <ul className="divide-y rounded-md border">
            {subjects.map((s) => (
              <li key={s.subjectId}>
                <Link
                  href={`/subjects/${s.subjectId}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors"
                >
                  <span className="text-sm font-medium">{s.subjectName}</span>
                  <Badge variant="outline" className="text-xs">
                    Ver disciplina
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </TabsContent>
    </Tabs>
  );
}
