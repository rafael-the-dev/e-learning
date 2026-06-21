import Link from "next/link";
import { PageHeader } from "@/shared/components/layout/page-header";
import { StatusBadge } from "@/shared/components/data/status-badge";
import { StudentDetailActions } from "@/modules/students/components/student-detail-actions";
import { StudentQuickActions } from "@/modules/students/student-360/components/student-quick-actions";
import { ID_TYPE_LABELS } from "@/modules/students/types";
import { Building2, Mail, Phone, CreditCard } from "lucide-react";
import type { Student } from "@/modules/students/types";

interface StudentProfileHeaderProps {
  student: Student;
  canEdit: boolean;
  canCreateEnrollment: boolean;
  canCreateInvoice: boolean;
  canCreatePayment: boolean;
  canUploadDocument: boolean;
}

export function StudentProfileHeader({
  student,
  canEdit,
  canCreateEnrollment,
  canCreateInvoice,
  canCreatePayment,
  canUploadDocument,
}: StudentProfileHeaderProps) {
  const initials = `${student.firstName.charAt(0)}${student.lastName.charAt(0)}`.toUpperCase();

  const breadcrumb = (
    <nav className="flex items-center gap-2 text-muted-foreground">
      <Link href="/students" className="hover:text-foreground transition-colors">
        Alunos
      </Link>
      <span>/</span>
      <span className="text-foreground">{student.fullName}</span>
    </nav>
  );

  return (
    <>
      <PageHeader
        title={student.fullName}
        breadcrumb={breadcrumb}
        actions={
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <StudentQuickActions
              student={student}
              canEdit={canEdit}
              canCreateEnrollment={canCreateEnrollment}
              canCreateInvoice={canCreateInvoice}
              canCreatePayment={canCreatePayment}
              canUploadDocument={canUploadDocument}
            />
            <StudentDetailActions student={student} />
          </div>
        }
      />
      <div className="px-4 sm:px-8 pt-6 flex items-start gap-4 flex-wrap">
        <div className="size-14 rounded-full bg-primary/10 text-primary flex items-center justify-center text-lg font-semibold shrink-0">
          {initials}
        </div>
        <div className="flex flex-col gap-2 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={student.status} />
            {student.code && (
              <span className="text-sm border rounded-full px-2.5 py-0.5 font-mono">#{student.code}</span>
            )}
            {student.branch && (
              <span className="text-sm border rounded-full px-2.5 py-0.5 flex items-center gap-1.5">
                <Building2 className="size-3" />
                {student.branch.name}
              </span>
            )}
          </div>
          <div className="flex items-center gap-4 flex-wrap text-sm text-muted-foreground">
            {student.email && (
              <span className="flex items-center gap-1.5">
                <Mail className="size-3.5" />
                {student.email}
              </span>
            )}
            {student.phone && (
              <span className="flex items-center gap-1.5">
                <Phone className="size-3.5" />
                {student.phone}
              </span>
            )}
            {student.idNumber && (
              <span className="flex items-center gap-1.5">
                <CreditCard className="size-3.5" />
                {student.idType ? `${ID_TYPE_LABELS[student.idType] ?? student.idType} · ` : ""}
                {student.idNumber}
              </span>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
