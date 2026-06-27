import { UserX, UserCog, Bell, FileText } from "lucide-react";
import { requirePermissionOrRedirect } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getStudentByUserId } from "@/modules/students/services/student.service";
import {
  getStudentPortalData,
  resolveStudentPortalBlockedReason,
} from "@/modules/student-portal/services/student-portal.service";
import { EmptyState } from "@/shared/components/layout/empty-state";
import {
  ExecutiveMainGrid,
  ExecutiveLeftColumn,
  ExecutiveRightColumn,
  DashboardSideCard,
} from "@/shared/components/layout/executive-dashboard";
import { StudentPortalHeader } from "@/modules/student-portal/components/student-portal-header";
import { StudentQuickActions } from "@/modules/student-portal/components/student-quick-actions";
import { StudentKpiCards } from "@/modules/student-portal/components/student-kpi-cards";
import { StudentAcademicOverviewCard } from "@/modules/student-portal/components/student-academic-overview";
import { StudentUpcomingClasses } from "@/modules/student-portal/components/student-upcoming-classes";
import { StudentAssessmentsPanel } from "@/modules/student-portal/components/student-assessments-panel";
import { StudentGradesPanel } from "@/modules/student-portal/components/student-grades-panel";
import { StudentAttendancePanel } from "@/modules/student-portal/components/student-attendance-panel";
import { StudentPaymentsPanel } from "@/modules/student-portal/components/student-payments-panel";
import { StudentNotificationsPanel } from "@/modules/student-portal/components/student-notifications-panel";
import { StudentDocumentsPanel } from "@/modules/student-portal/components/student-documents-panel";

export const metadata = { title: "Portal do Aluno" };

export default async function StudentPortalPage() {
  // studentId is NEVER read from the URL/query — it's resolved server-side from
  // the authenticated user (currentUser.id → Student.userId).
  const context = await requirePermissionOrRedirect(PERMISSIONS.STUDENT_PORTAL_VIEW);
  const student = await getStudentByUserId(context.organizationId, context.userId);

  if (!student) {
    return (
      <>
        <StudentPortalHeader />
        <div className="p-4 sm:p-8">
          <EmptyState
            icon={<UserX className="size-8" />}
            title="Esta conta ainda não está vinculada a um perfil de aluno."
            description="Contacte a secretaria para associar a sua conta a um perfil de aluno existente."
          />
        </div>
      </>
    );
  }

  // resolveStudentPortalBlockedReason also covers the "no Student linked" case
  // above, but can only return "INACTIVE" here since `student` is non-null.
  if (resolveStudentPortalBlockedReason(student)) {
    return (
      <>
        <StudentPortalHeader />
        <div className="p-4 sm:p-8">
          <EmptyState
            icon={<UserCog className="size-8" />}
            title="Este perfil de aluno não está activo."
            description="Contacte a secretaria se isto não estiver correto."
          />
        </div>
      </>
    );
  }

  const data = await getStudentPortalData(
    student.id,
    student.fullName,
    context.userId,
    context.organizationId
  );

  return (
    <>
      <StudentPortalHeader />
      <div className="p-4 sm:p-8 space-y-6">
        <StudentQuickActions />
        <StudentKpiCards kpis={data.kpis} />

        <ExecutiveMainGrid>
          <ExecutiveLeftColumn>
            <div id="resumo" className="scroll-mt-20">
              <StudentAcademicOverviewCard overview={data.overview} />
            </div>
            <StudentUpcomingClasses classes={data.upcomingClasses} />
            <StudentAssessmentsPanel assessments={data.assessments} />
            <StudentGradesPanel grades={data.grades} />
            <StudentAttendancePanel
              kpis={data.attendanceKpis}
              trend={data.attendanceTrend}
              sessions={data.attendanceSessions}
            />
            <StudentPaymentsPanel
              summary={data.paymentsSummary}
              invoices={data.invoices}
              payments={data.payments}
            />
          </ExecutiveLeftColumn>

          <ExecutiveRightColumn>
            <DashboardSideCard
              title="Notificações"
              icon={<Bell className="size-4" />}
              badge={
                data.unreadNotificationCount > 0 ? (
                  <span className="text-xs text-muted-foreground">{data.unreadNotificationCount} não lidas</span>
                ) : undefined
              }
            >
              <StudentNotificationsPanel notifications={data.notifications} />
            </DashboardSideCard>

            <DashboardSideCard title="Documentos" icon={<FileText className="size-4" />}>
              <div id="documentos" className="scroll-mt-20">
                <StudentDocumentsPanel documents={data.documents} />
              </div>
            </DashboardSideCard>
          </ExecutiveRightColumn>
        </ExecutiveMainGrid>
      </div>
    </>
  );
}
