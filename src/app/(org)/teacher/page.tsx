import { UserX, UserCog, ShieldAlert, Bell, CalendarClock } from "lucide-react";
import { requirePermissionOrRedirect } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getTeacherByUserId } from "@/modules/teachers/services/teacher.service";
import { getTeacherPortalData, resolveTeacherPortalBlockedReason } from "@/modules/teacher-portal/services/teacher-portal.service";
import { EmptyState } from "@/shared/components/layout/empty-state";
import {
  ExecutiveMainGrid,
  ExecutiveLeftColumn,
  ExecutiveRightColumn,
  DashboardSideCard,
} from "@/shared/components/layout/executive-dashboard";
import { TeacherPortalHeader } from "@/modules/teacher-portal/components/teacher-portal-header";
import { TeacherTodayOverviewCard } from "@/modules/teacher-portal/components/teacher-today-overview";
import { TeacherQuickActions } from "@/modules/teacher-portal/components/teacher-quick-actions";
import { TeacherKpiCards } from "@/modules/teacher-portal/components/teacher-kpi-cards";
import { TeacherTodaySchedule } from "@/modules/teacher-portal/components/teacher-today-schedule";
import { TeacherPendingWorkCard } from "@/modules/teacher-portal/components/teacher-pending-work";
import { TeacherMyClasses } from "@/modules/teacher-portal/components/teacher-my-classes";
import { TeacherStudentRiskList } from "@/modules/teacher-portal/components/teacher-student-risk-list";
import { TeacherNotificationsPanel } from "@/modules/teacher-portal/components/teacher-notifications-panel";
import { TeacherUpcomingDeadlines } from "@/modules/teacher-portal/components/teacher-upcoming-deadlines";
import { teacherExaminationService } from "@/modules/teacher-examinations/services/teacher-examination.service";
import { TeacherExamSummaryCard } from "@/modules/teacher-examinations/components/teacher-exam-summary-card";

export const metadata = { title: "Portal do Professor" };

export default async function TeacherPortalPage() {
  const context = await requirePermissionOrRedirect(PERMISSIONS.TEACHER_PORTAL_VIEW);
  const teacher = await getTeacherByUserId(context.organizationId, context.userId);

  if (!teacher) {
    return (
      <>
        <TeacherPortalHeader />
        <div className="p-4 sm:p-8">
          <EmptyState
            icon={<UserX className="size-8" />}
            title="Esta conta ainda não está vinculada a um perfil de professor."
            description="Contacte um administrador para associar a sua conta a um perfil de professor existente."
          />
        </div>
      </>
    );
  }

  // resolveTeacherPortalBlockedReason also covers the "no Teacher linked" case
  // (the !teacher branch above), but can only return "INACTIVE" here since
  // `teacher` is already known non-null at this point.
  if (resolveTeacherPortalBlockedReason(teacher)) {
    return (
      <>
        <TeacherPortalHeader />
        <div className="p-4 sm:p-8">
          <EmptyState
            icon={<UserCog className="size-8" />}
            title="Este perfil de professor não está activo."
            description="Contacte um administrador se isto não estiver correto."
          />
        </div>
      </>
    );
  }

  // Unscoped 360 view is only held by ORG_ADMIN/SUPER_ADMIN previewing the portal
  // (TEACHER only ever holds the own-profile variant) — used to decide whether
  // generic org-wide links (e.g. /class-groups) are safe to show.
  const canViewOrgWide = context.ability.can(PERMISSIONS.TEACHERS_VIEW_360);

  const data = await getTeacherPortalData(teacher.id, teacher.fullName, context.userId, context.organizationId);
  const examOverview = await teacherExaminationService.getOverview(context.organizationId, teacher.id);

  return (
    <>
      <TeacherPortalHeader />
      <div className="p-4 sm:p-8 space-y-6">
        <TeacherTodayOverviewCard overview={data.todayOverview} />
        <TeacherQuickActions teacherId={data.teacherId} canViewOrgWide={canViewOrgWide} />
        <TeacherKpiCards kpis={data.kpis} />

        <ExecutiveMainGrid>
          <ExecutiveLeftColumn>
            <TeacherTodaySchedule sessions={data.todaySchedule} />
            <TeacherPendingWorkCard pendingWork={data.pendingWork} />
            <TeacherMyClasses classGroups={data.myClasses} total={data.myClassesTotal} canViewOrgWide={canViewOrgWide} />
          </ExecutiveLeftColumn>

          <ExecutiveRightColumn>
            <TeacherExamSummaryCard overview={examOverview} />

            <DashboardSideCard
              title="Alunos em Risco"
              icon={<ShieldAlert className="size-4" />}
              badge={<span className="text-xs text-muted-foreground">{data.riskList.length}</span>}
            >
              <TeacherStudentRiskList rows={data.riskList} />
            </DashboardSideCard>

            <DashboardSideCard
              title="Notificações"
              icon={<Bell className="size-4" />}
              badge={
                data.unreadNotificationCount > 0 ? (
                  <span className="text-xs text-muted-foreground">{data.unreadNotificationCount} não lidas</span>
                ) : undefined
              }
            >
              <TeacherNotificationsPanel notifications={data.notifications} />
            </DashboardSideCard>

            <DashboardSideCard title="Próximos Prazos" icon={<CalendarClock className="size-4" />}>
              <TeacherUpcomingDeadlines deadlines={data.deadlines} />
            </DashboardSideCard>
          </ExecutiveRightColumn>
        </ExecutiveMainGrid>
      </div>
    </>
  );
}
