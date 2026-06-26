import Link from "next/link";
import { PageHeader } from "@/shared/components/layout/page-header";
import { StatusBadge } from "@/shared/components/data/status-badge";
import { TeacherDetailActions } from "@/modules/teachers/components/teacher-detail-actions";
import { TeacherQuickActions } from "@/modules/teachers/teacher-360/components/teacher-quick-actions";
import { Building2, Mail, Phone, Award, Calendar } from "lucide-react";
import type { TeacherWithSubjects } from "@/modules/teachers/types";

interface Teacher360HeaderProps {
  teacher: TeacherWithSubjects;
  canEdit: boolean;
  canAssignSubject: boolean;
  canCreateClassGroup: boolean;
  canViewSchedule: boolean;
  // Computed server-side (teacher-360.service.ts#computeYearsOfService) rather
  // than from Date.now() here — components/hooks must stay pure.
  yearsOfService: number | null;
}

export function Teacher360Header({
  teacher,
  canEdit,
  canAssignSubject,
  canCreateClassGroup,
  canViewSchedule,
  yearsOfService,
}: Teacher360HeaderProps) {
  const initials = `${teacher.firstName.charAt(0)}${teacher.lastName.charAt(0)}`.toUpperCase();

  const breadcrumb = (
    <nav className="flex items-center gap-2 text-muted-foreground">
      <Link href="/teachers" className="hover:text-foreground transition-colors">
        Professores
      </Link>
      <span>/</span>
      <span className="text-foreground">{teacher.fullName}</span>
    </nav>
  );

  return (
    <>
      <PageHeader
        title={teacher.fullName}
        breadcrumb={breadcrumb}
        actions={
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <TeacherQuickActions
              teacher={teacher}
              canEdit={canEdit}
              canAssignSubject={canAssignSubject}
              canCreateClassGroup={canCreateClassGroup}
              canViewSchedule={canViewSchedule}
            />
            <TeacherDetailActions teacher={teacher} />
          </div>
        }
      />
      <div className="px-4 sm:px-8 pt-6 flex items-start gap-4 flex-wrap">
        <div className="size-14 rounded-full bg-primary/10 text-primary flex items-center justify-center text-lg font-semibold shrink-0">
          {initials}
        </div>
        <div className="flex flex-col gap-2 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={teacher.status} />
            {teacher.code && (
              <span className="text-sm border rounded-full px-2.5 py-0.5 font-mono">#{teacher.code}</span>
            )}
            {teacher.branch && (
              <span className="text-sm border rounded-full px-2.5 py-0.5 flex items-center gap-1.5">
                <Building2 className="size-3" />
                {teacher.branch.name}
              </span>
            )}
            {teacher.specialization && (
              <span className="text-sm border rounded-full px-2.5 py-0.5 flex items-center gap-1.5">
                <Award className="size-3" />
                {teacher.specialization}
              </span>
            )}
          </div>
          <div className="flex items-center gap-4 flex-wrap text-sm text-muted-foreground">
            {teacher.email && (
              <span className="flex items-center gap-1.5">
                <Mail className="size-3.5" />
                {teacher.email}
              </span>
            )}
            {teacher.phone && (
              <span className="flex items-center gap-1.5">
                <Phone className="size-3.5" />
                {teacher.phone}
              </span>
            )}
            {teacher.hireDate && (
              <span className="flex items-center gap-1.5">
                <Calendar className="size-3.5" />
                Admissão: {new Date(teacher.hireDate).toLocaleDateString("pt-PT")}
                {yearsOfService != null &&
                  (yearsOfService === 0 ? " (menos de 1 ano)" : ` (${yearsOfService} ano(s))`)}
              </span>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
