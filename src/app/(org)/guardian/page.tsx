import { Bell, FileText } from "lucide-react";
import { requirePermissionOrRedirect } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getGuardianPortalData } from "@/modules/guardian-portal/services/guardian-portal.service";
import { guardianExaminationService } from "@/modules/guardian-examinations/services/guardian-examination.service";
import { GuardianExamSummaryCard } from "@/modules/guardian-examinations/components/guardian-exam-summary-card";
import {
  ExecutiveMainGrid,
  ExecutiveLeftColumn,
  ExecutiveRightColumn,
  DashboardSideCard,
} from "@/shared/components/layout/executive-dashboard";
import { GuardianPortalHeader } from "@/modules/guardian-portal/components/guardian-portal-header";
import { GuardianEmptyState } from "@/modules/guardian-portal/components/guardian-empty-state";
import { GuardianStudentSelector } from "@/modules/guardian-portal/components/guardian-student-selector";
import { GuardianAcademicOverviewCard } from "@/modules/guardian-portal/components/guardian-academic-overview";
import { GuardianKpiCards } from "@/modules/guardian-portal/components/guardian-kpi-cards";
import { GuardianUpcomingEvents } from "@/modules/guardian-portal/components/guardian-upcoming-events";
import { GuardianGradesPanel } from "@/modules/guardian-portal/components/guardian-grades-panel";
import { GuardianAttendancePanel } from "@/modules/guardian-portal/components/guardian-attendance-panel";
import { GuardianPaymentsPanel } from "@/modules/guardian-portal/components/guardian-payments-panel";
import { GuardianDocumentsPanel } from "@/modules/guardian-portal/components/guardian-documents-panel";
import { GuardianNotificationsPanel } from "@/modules/guardian-portal/components/guardian-notifications-panel";

export const metadata = { title: "Portal do Encarregado" };

export default async function GuardianPortalPage({
  searchParams,
}: {
  searchParams: Promise<{ studentId?: string | string[] }>;
}) {
  // guardianUserId and organizationId come from the authenticated context; the
  // studentId query param is only a *selection request* — getGuardianPortalData
  // validates it against the guardian's GuardianStudent links before any read.
  const context = await requirePermissionOrRedirect(PERMISSIONS.GUARDIAN_PORTAL_VIEW);
  const { studentId } = await searchParams;
  // A repeated `?studentId=a&studentId=b` arrives as an array — take the first.
  const requestedStudentId = Array.isArray(studentId) ? studentId[0] ?? null : studentId ?? null;

  const data = await getGuardianPortalData(context, requestedStudentId);
  // Supervision exam overview across all linked educandos (READ-ONLY). Scoped to the
  // authenticated guardian (context.userId), never a studentId from the URL.
  const examOverview = await guardianExaminationService.getOverview(
    context.organizationId,
    context.userId
  );

  // Blocked state — no ACTIVE links to any student.
  if (data.students.length === 0 || !data.selected) {
    return (
      <>
        <GuardianPortalHeader />
        <div className="p-4 sm:p-8">
          <GuardianEmptyState />
        </div>
      </>
    );
  }

  const selected = data.selected;
  const { permissions } = selected;
  const showClasses = permissions.canViewAcademic || permissions.canViewAttendance;

  return (
    <>
      <GuardianPortalHeader />
      <div className="p-4 sm:p-8 space-y-6">
        <GuardianStudentSelector students={data.students} selectedStudentId={data.selectedStudentId} />

        <GuardianKpiCards kpis={selected.kpis} />

        <ExecutiveMainGrid>
          <ExecutiveLeftColumn>
            <div id="resumo" className="scroll-mt-20">
              <GuardianAcademicOverviewCard
                overview={selected.overview}
                relationshipType={selected.relationshipType}
              />
            </div>

            {showClasses && (
              <GuardianUpcomingEvents classes={selected.upcomingClasses} assessments={selected.assessments} />
            )}

            {permissions.canViewAcademic && selected.grades !== null && (
              <GuardianGradesPanel grades={selected.grades} />
            )}

            {permissions.canViewAttendance && selected.attendanceKpis !== null && (
              <GuardianAttendancePanel
                kpis={selected.attendanceKpis}
                trend={selected.attendanceTrend}
                sessions={selected.attendanceSessions}
              />
            )}

            {permissions.canViewFinance && selected.paymentsSummary !== null && (
              <GuardianPaymentsPanel
                summary={selected.paymentsSummary}
                invoices={selected.invoices}
                payments={selected.payments}
              />
            )}
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
              <GuardianNotificationsPanel notifications={data.notifications} />
            </DashboardSideCard>

            {examOverview.hasLinks && <GuardianExamSummaryCard overview={examOverview} />}

            {permissions.canViewDocuments && selected.documents !== null && (
              <DashboardSideCard title="Documentos" icon={<FileText className="size-4" />}>
                <div id="documentos" className="scroll-mt-20">
                  <GuardianDocumentsPanel documents={selected.documents} />
                </div>
              </DashboardSideCard>
            )}
          </ExecutiveRightColumn>
        </ExecutiveMainGrid>
      </div>
    </>
  );
}
