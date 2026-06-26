import { notFound, redirect } from "next/navigation";
import { requireOrganization } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { NotFoundError } from "@/shared/lib/command";
import { getActiveSubjectsByOrganization } from "@/modules/courses/services/course.service";
import { getTeacherById } from "@/modules/teachers/services/teacher.service";
import {
  getTeacher360Core,
  buildHealthScoreInput,
  buildAlertsInput,
  buildSummaryCards,
  computeYearsOfService,
  getScheduleTabData,
  getSubjectsTabData,
  getClassGroupsTabData,
  getAssessmentsTabData,
  getAttendanceTabData,
  getPerformanceTabData,
  getTimelineTabData,
  getDocumentsTabData,
  type Teacher360Core,
} from "@/modules/teachers/teacher-360/services/teacher-360.service";
import { calculateTeacherHealthScore } from "@/modules/teachers/teacher-360/services/teacher-health.service";
import { computeTeacherAlerts } from "@/modules/teachers/teacher-360/services/teacher-alerts.service";
import {
  getTeacher360TabAccess,
  resolveActiveTeacher360Tab,
  canViewTeacher360,
} from "@/modules/teachers/teacher-360/services/teacher-360-access.service";
import { Teacher360Header } from "@/modules/teachers/teacher-360/components/teacher-360-header";
import { TeacherHealthCard } from "@/modules/teachers/teacher-360/components/teacher-health-card";
import { TeacherAlertsPanel } from "@/modules/teachers/teacher-360/components/teacher-alerts-panel";
import { TeacherSummaryCards } from "@/modules/teachers/teacher-360/components/teacher-summary-cards";
import { Teacher360TabsNav } from "@/modules/teachers/teacher-360/components/teacher-360-tabs-nav";
import { TeacherOverviewTab } from "@/modules/teachers/teacher-360/components/tabs/teacher-overview-tab";
import { TeacherScheduleTab } from "@/modules/teachers/teacher-360/components/tabs/teacher-schedule-tab";
import { TeacherClassGroupsTab } from "@/modules/teachers/teacher-360/components/tabs/teacher-class-groups-tab";
import { TeacherSubjectsTab } from "@/modules/teachers/teacher-360/components/tabs/teacher-subjects-tab";
import { TeacherAssessmentsTab } from "@/modules/teachers/teacher-360/components/tabs/teacher-assessments-tab";
import { TeacherAttendanceTab } from "@/modules/teachers/teacher-360/components/tabs/teacher-attendance-tab";
import { TeacherPerformanceTab } from "@/modules/teachers/teacher-360/components/tabs/teacher-performance-tab";
import { TeacherTimelineTab } from "@/modules/teachers/teacher-360/components/tabs/teacher-timeline-tab";
import { TeacherDocumentsTab } from "@/modules/teachers/teacher-360/components/tabs/teacher-documents-tab";
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  BookOpen,
  ClipboardList,
  ClipboardCheck,
  TrendingUp,
  History,
  FileText,
} from "lucide-react";
import type { Teacher360TabDef } from "@/modules/teachers/teacher-360/components/teacher-360-tabs-nav";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ teacherId: string }>;
}) {
  const { teacherId } = await params;
  return { title: `Professor ${teacherId}` };
}

export default async function TeacherDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ teacherId: string }>;
  searchParams: Promise<{ tab?: string; page?: string }>;
}) {
  const context = await requireOrganization();

  const { teacherId } = await params;
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);

  // Lightweight lookup first — confirms tenant (404 on cross-org) and resolves
  // ownership for the self-scope check, before paying for the full
  // Teacher360Core aggregate fetch. Mirrors the Student 360 convention of
  // authorizing before loading core data (requirePermissionOrRedirect runs
  // before getStudent360Core there).
  let teacherForAuth;
  try {
    teacherForAuth = await getTeacherById(teacherId, context.organizationId);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }

  const isOwner = teacherForAuth.userId === context.userId;
  if (!canViewTeacher360((p) => context.ability.can(p), isOwner)) {
    redirect("/forbidden");
  }

  let core: Teacher360Core;
  try {
    core = await getTeacher360Core(teacherId, context.organizationId);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }

  const yearsOfService = computeYearsOfService(core.teacher.hireDate);

  const tabAccess = getTeacher360TabAccess((permission) => context.ability.can(permission));
  const activeTab = resolveActiveTeacher360Tab(sp.tab, tabAccess);
  const visible = new Set(tabAccess.filter((t) => t.visible).map((t) => t.key));

  const health = calculateTeacherHealthScore(buildHealthScoreInput(core));
  const alerts = computeTeacherAlerts(buildAlertsInput(core));
  const summary = buildSummaryCards(core);

  const tabs: Teacher360TabDef[] = [
    { key: "overview", label: "Visão Geral", icon: <LayoutDashboard className="size-3.5" /> },
  ];
  if (visible.has("schedule")) {
    tabs.push({ key: "schedule", label: "Horário", icon: <CalendarDays className="size-3.5" /> });
  }
  if (visible.has("classGroups")) {
    tabs.push({
      key: "classGroups",
      label: "Turmas",
      icon: <Users className="size-3.5" />,
      count: core.counts.activeClassGroupCount,
    });
  }
  if (visible.has("subjects")) {
    tabs.push({
      key: "subjects",
      label: "Disciplinas",
      icon: <BookOpen className="size-3.5" />,
      count: core.counts.subjectCount,
    });
  }
  if (visible.has("assessments")) {
    tabs.push({
      key: "assessments",
      label: "Avaliações",
      icon: <ClipboardList className="size-3.5" />,
      count: core.assessmentMetrics.openCount,
    });
  }
  if (visible.has("attendance")) {
    tabs.push({ key: "attendance", label: "Presenças", icon: <ClipboardCheck className="size-3.5" /> });
  }
  if (visible.has("performance")) {
    tabs.push({ key: "performance", label: "Performance", icon: <TrendingUp className="size-3.5" /> });
  }
  if (visible.has("timeline")) {
    tabs.push({ key: "timeline", label: "Timeline", icon: <History className="size-3.5" /> });
  }
  if (visible.has("documents")) {
    tabs.push({
      key: "documents",
      label: "Documentos",
      icon: <FileText className="size-3.5" />,
      count: core.documentCount,
    });
  }

  return (
    <>
      <Teacher360Header
        teacher={core.teacher}
        canEdit={context.ability.can(PERMISSIONS.TEACHERS_UPDATE)}
        canAssignSubject={context.ability.can(PERMISSIONS.TEACHERS_ASSIGN_SUBJECT)}
        canCreateClassGroup={context.ability.can(PERMISSIONS.CLASS_GROUPS_CREATE)}
        canViewSchedule={visible.has("schedule")}
        yearsOfService={yearsOfService}
      />

      <div className="p-4 sm:p-8 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <TeacherHealthCard health={health} />
          </div>
          <TeacherAlertsPanel alerts={alerts} />
        </div>

        <TeacherSummaryCards summary={summary} />

        <Teacher360TabsNav active={activeTab} tabs={tabs} />

        <ActiveTabPanel
          activeTab={activeTab}
          core={core}
          organizationId={context.organizationId}
          page={page}
          canAssignSubject={context.ability.can(PERMISSIONS.TEACHERS_ASSIGN_SUBJECT)}
          canRemoveSubject={context.ability.can(PERMISSIONS.TEACHERS_ASSIGN_SUBJECT)}
          canUploadDocument={context.ability.can(PERMISSIONS.TEACHER_DOCUMENTS_UPLOAD)}
          canDeleteDocument={context.ability.can(PERMISSIONS.TEACHER_DOCUMENTS_DELETE)}
        />
      </div>
    </>
  );
}

async function ActiveTabPanel({
  activeTab,
  core,
  organizationId,
  page,
  canAssignSubject,
  canRemoveSubject,
  canUploadDocument,
  canDeleteDocument,
}: {
  activeTab: string;
  core: Teacher360Core;
  organizationId: string;
  page: number;
  canAssignSubject: boolean;
  canRemoveSubject: boolean;
  canUploadDocument: boolean;
  canDeleteDocument: boolean;
}) {
  const teacherId = core.teacher.id;

  switch (activeTab) {
    case "schedule": {
      const schedule = await getScheduleTabData(teacherId, organizationId);
      return <TeacherScheduleTab schedule={schedule} />;
    }

    case "classGroups": {
      const classGroups = await getClassGroupsTabData(teacherId, organizationId, page, 10);
      return (
        <TeacherClassGroupsTab
          classGroups={classGroups}
          activeClassGroupCount={core.counts.activeClassGroupCount}
          distinctActiveStudentCount={core.workload.distinctActiveStudentCount}
          avgOccupancyPercent={core.workload.avgOccupancyPercent}
        />
      );
    }

    case "subjects": {
      const [rows, allSubjects] = await Promise.all([
        getSubjectsTabData(core, organizationId),
        getActiveSubjectsByOrganization(organizationId),
      ]);
      const assignedIds = new Set(core.teacher.teacherSubjects.map((ts) => ts.subjectId));
      const availableSubjects = allSubjects.filter((s) => !assignedIds.has(s.id));
      return (
        <TeacherSubjectsTab
          teacher={core.teacher}
          rows={rows}
          availableSubjects={availableSubjects}
          canAssign={canAssignSubject}
          canRemove={canRemoveSubject}
        />
      );
    }

    case "assessments": {
      const assessments = await getAssessmentsTabData(teacherId, organizationId, page, 10);
      return <TeacherAssessmentsTab assessments={assessments} metrics={core.assessmentMetrics} />;
    }

    case "attendance": {
      const { kpis, monthlyTrend, sessions } = await getAttendanceTabData(teacherId, organizationId, page, 10);
      return <TeacherAttendanceTab kpis={kpis} monthlyTrend={monthlyTrend} sessions={sessions} page={page} pageSize={10} />;
    }

    case "performance": {
      const { subjectPassRates, gradeTrend, organizationAveragePassRate } = await getPerformanceTabData(
        core,
        organizationId
      );
      const denominator = core.qualityRaw.passedCount + core.qualityRaw.failedCount;
      const teacherPassRate = denominator > 0 ? Math.round((core.qualityRaw.passedCount / denominator) * 100) : null;
      return (
        <TeacherPerformanceTab
          subjectPassRates={subjectPassRates}
          gradeTrend={gradeTrend}
          organizationAveragePassRate={organizationAveragePassRate}
          teacherPassRate={teacherPassRate}
          avgStudentAttendance={core.qualityRaw.avgAttendance}
        />
      );
    }

    case "timeline": {
      const { items, total } = await getTimelineTabData(teacherId, organizationId, page, 20);
      return <TeacherTimelineTab events={items} total={total} page={page} pageSize={20} />;
    }

    case "documents": {
      const documents = await getDocumentsTabData(teacherId, organizationId);
      return (
        <TeacherDocumentsTab
          teacherId={teacherId}
          documents={documents}
          canUpload={canUploadDocument}
          canDelete={canDeleteDocument}
        />
      );
    }

    case "overview":
    default:
      return <TeacherOverviewTab core={core} />;
  }
}
