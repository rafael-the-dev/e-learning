"use client";

import Link from "next/link";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/shared/components/ui/dropdown-menu";
import { Pencil, BookOpen, Users, CalendarDays, MessageCircle, Mail, Phone, Printer } from "lucide-react";
import type { TeacherWithSubjects } from "@/modules/teachers/types";

interface TeacherQuickActionsProps {
  teacher: TeacherWithSubjects;
  canEdit: boolean;
  canAssignSubject: boolean;
  canCreateClassGroup: boolean;
  canViewSchedule: boolean;
}

export function TeacherQuickActions({
  teacher,
  canEdit,
  canAssignSubject,
  canCreateClassGroup,
  canViewSchedule,
}: TeacherQuickActionsProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {canEdit && (
        <Button asChild variant="outline" size="sm">
          <Link href={`/teachers/${teacher.id}/edit`}>
            <Pencil className="size-4 mr-1.5" />
            Editar
          </Link>
        </Button>
      )}
      {canAssignSubject && (
        <Button asChild variant="outline" size="sm">
          <Link href="?tab=subjects">
            <BookOpen className="size-4 mr-1.5" />
            Atribuir Disciplina
          </Link>
        </Button>
      )}
      {canCreateClassGroup && (
        <Button asChild variant="outline" size="sm">
          <Link href="/class-groups/new">
            <Users className="size-4 mr-1.5" />
            Atribuir Turma
          </Link>
        </Button>
      )}
      {canViewSchedule && (
        <Button asChild variant="outline" size="sm">
          <Link href="?tab=schedule">
            <CalendarDays className="size-4 mr-1.5" />
            Ver Horário
          </Link>
        </Button>
      )}
      {(teacher.email || teacher.phone) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <MessageCircle className="size-4 mr-1.5" />
              Contactar
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {teacher.email && (
              <DropdownMenuItem asChild>
                <a href={`mailto:${teacher.email}`}>
                  <Mail className="size-4 mr-2" />
                  {teacher.email}
                </a>
              </DropdownMenuItem>
            )}
            {teacher.phone && (
              <DropdownMenuItem asChild>
                <a href={`tel:${teacher.phone}`}>
                  <Phone className="size-4 mr-2" />
                  {teacher.phone}
                </a>
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <Button variant="outline" size="sm" onClick={() => window.print()}>
        <Printer className="size-4 mr-1.5" />
        Imprimir
      </Button>
    </div>
  );
}
