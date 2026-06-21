"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/shared/components/ui/dropdown-menu";
import { UploadDocumentDrawer } from "@/modules/students/student-360/components/upload-document-drawer";
import { Pencil, GraduationCap, FileText, Wallet, MessageCircle, Upload, Mail, Phone } from "lucide-react";
import type { Student } from "@/modules/students/types";

interface StudentQuickActionsProps {
  student: Student;
  canEdit: boolean;
  canCreateEnrollment: boolean;
  canCreateInvoice: boolean;
  canCreatePayment: boolean;
  canUploadDocument: boolean;
}

export function StudentQuickActions({
  student,
  canEdit,
  canCreateEnrollment,
  canCreateInvoice,
  canCreatePayment,
  canUploadDocument,
}: StudentQuickActionsProps) {
  const [showUpload, setShowUpload] = React.useState(false);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {canEdit && (
        <Button asChild variant="outline" size="sm">
          <Link href={`/students/${student.id}/edit`}>
            <Pencil className="size-4 mr-1.5" />
            Editar
          </Link>
        </Button>
      )}
      {canCreateEnrollment && (
        <Button asChild variant="outline" size="sm">
          <Link href={`/enrollments/new?studentId=${student.id}`}>
            <GraduationCap className="size-4 mr-1.5" />
            Nova Matrícula
          </Link>
        </Button>
      )}
      {canCreateInvoice && (
        <Button asChild variant="outline" size="sm">
          <Link href={`/invoices/new?studentId=${student.id}`}>
            <FileText className="size-4 mr-1.5" />
            Nova Fatura
          </Link>
        </Button>
      )}
      {canCreatePayment && (
        <Button asChild variant="outline" size="sm">
          <Link href={`/payments/new?studentId=${student.id}`}>
            <Wallet className="size-4 mr-1.5" />
            Registar Pagamento
          </Link>
        </Button>
      )}
      {(student.email || student.phone) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <MessageCircle className="size-4 mr-1.5" />
              Contactar
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {student.email && (
              <DropdownMenuItem asChild>
                <a href={`mailto:${student.email}`}>
                  <Mail className="size-4 mr-2" />
                  {student.email}
                </a>
              </DropdownMenuItem>
            )}
            {student.phone && (
              <DropdownMenuItem asChild>
                <a href={`tel:${student.phone}`}>
                  <Phone className="size-4 mr-2" />
                  {student.phone}
                </a>
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {canUploadDocument && (
        <>
          <Button variant="outline" size="sm" onClick={() => setShowUpload(true)}>
            <Upload className="size-4 mr-1.5" />
            Carregar Documento
          </Button>
          <UploadDocumentDrawer studentId={student.id} open={showUpload} onOpenChange={setShowUpload} />
        </>
      )}
    </div>
  );
}
