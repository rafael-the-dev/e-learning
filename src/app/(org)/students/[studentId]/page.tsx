import { notFound } from "next/navigation";
import { requirePermissionOrRedirect } from "@/server/auth/context";
import { assertTeacherCanAccessStudent } from "@/server/auth/teacher-access";
import { PERMISSIONS } from "@/server/auth/permissions";
import { AuthorizationError, NotFoundError } from "@/shared/lib/command";
import {
  getStudent360Core,
  buildHealthScoreInput,
  toStudentAlerts,
  getAttendanceTabData,
  getGradesTabData,
  getProgressTabData,
  getDocumentsTabData,
  getTimelineTabData,
  resolveCurrentEnrollmentLevel,
} from "@/modules/students/student-360/services/student-360.service";
import { getStudentPortalAccountStatus } from "@/modules/students/services/student-user-provisioning.service";
import { getStudentGuardianLinks } from "@/modules/guardian-portal/services/guardian-provisioning.service";
import { calculateHealthScore } from "@/modules/students/student-360/services/student-health.service";
import {
  getStudent360TabAccess,
  resolveActiveStudent360Tab,
} from "@/modules/students/student-360/services/student-360-access.service";
import { StudentProfileHeader } from "@/modules/students/student-360/components/student-profile-header";
import { StudentStatusBand } from "@/modules/students/student-360/components/student-status-band";
import { StudentAlertsPanel } from "@/modules/students/student-360/components/student-alerts-panel";
import { StudentOperationalCards } from "@/modules/students/student-360/components/student-operational-cards";
import { StudentRecentActivity } from "@/modules/students/student-360/components/student-recent-activity";
import { Student360TabsNav } from "@/modules/students/student-360/components/student-360-tabs-nav";
import { StudentOverviewTab } from "@/modules/students/student-360/components/student-overview-tab";
import { StudentEnrollmentsTab } from "@/modules/students/student-360/components/student-enrollments-tab";
import { StudentFinanceTab } from "@/modules/students/student-360/components/student-finance-tab";
import { StudentAttendanceTab } from "@/modules/students/student-360/components/student-attendance-tab";
import { StudentGradesTab } from "@/modules/students/student-360/components/student-grades-tab";
import { StudentProgressTab } from "@/modules/students/student-360/components/student-progress-tab";
import { StudentDocumentsTab } from "@/modules/students/student-360/components/student-documents-tab";
import { StudentTimelineTab } from "@/modules/students/student-360/components/student-timeline-tab";
import {
  LayoutDashboard,
  GraduationCap,
  CircleDollarSign,
  ClipboardList,
  BookOpen,
  TrendingUp,
  FileText,
  History,
} from "lucide-react";
import type { Student360TabDef } from "@/modules/students/student-360/components/student-360-tabs-nav";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = await params;
  return { title: `Aluno ${studentId}` };
}

export default async function StudentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ studentId: string }>;
  searchParams: Promise<{ tab?: string; page?: string }>;
}) {
  const context = await requirePermissionOrRedirect(PERMISSIONS.STUDENTS_READ);

  const { studentId } = await params;
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);

  // Finance is split into two independent capabilities so the RBAC policy is explicit:
  // billing (invoices/dívida) ← INVOICES_VIEW, wallet (saldo/movimentos/reembolsos) ←
  // WALLETS_VIEW. Each half is fetched/derived/returned ONLY when its capability holds;
  // a viewer without a half receives no query, no figure, no payload for it anywhere
  // (cards, health, alerts, overview, finance tab).
  const canViewInvoices = context.ability.can(PERMISSIONS.INVOICES_VIEW);
  const canViewWallet = context.ability.can(PERMISSIONS.WALLETS_VIEW);

  let core;
  try {
    // Teacher-scoped users may only open a student enrolled in a class group they
    // teach — never any org student by id (IDOR). 404 (not 403) so we don't
    // disclose that the record exists. See docs/teacher-access-scope.md.
    await assertTeacherCanAccessStudent(context, studentId);
    core = await getStudent360Core(studentId, context.organizationId, { canViewInvoices, canViewWallet });
  } catch (e) {
    if (e instanceof NotFoundError || e instanceof AuthorizationError) notFound();
    throw e;
  }

  const tabAccess = getStudent360TabAccess((permission) => context.ability.can(permission));
  const activeTab = resolveActiveStudent360Tab(sp.tab, tabAccess);
  const visible = new Set(tabAccess.filter((t) => t.visible).map((t) => t.key));

  const health = calculateHealthScore(buildHealthScoreInput(core));
  // Alerts are a projection of the canonical risk reasons (H6) — never re-derived.
  const alerts = toStudentAlerts(core.riskSummary);

  const tabs: Student360TabDef[] = [
    { key: "overview", label: "Visão Geral", icon: <LayoutDashboard className="size-3.5" /> },
  ];
  if (visible.has("enrollments")) {
    tabs.push({
      key: "enrollments",
      label: "Matrículas",
      icon: <GraduationCap className="size-3.5" />,
      count: core.enrollments.length,
    });
  }
  if (visible.has("finance")) {
    tabs.push({ key: "finance", label: "Financeiro", icon: <CircleDollarSign className="size-3.5" /> });
  }
  if (visible.has("attendance")) {
    tabs.push({ key: "attendance", label: "Presenças", icon: <ClipboardList className="size-3.5" /> });
  }
  if (visible.has("grades")) {
    tabs.push({ key: "grades", label: "Notas", icon: <BookOpen className="size-3.5" /> });
  }
  if (visible.has("progress")) {
    tabs.push({ key: "progress", label: "Progresso", icon: <TrendingUp className="size-3.5" /> });
  }
  if (visible.has("documents")) {
    tabs.push({
      key: "documents",
      label: "Documentos",
      icon: <FileText className="size-3.5" />,
      count: core.documentCount,
    });
  }
  if (visible.has("timeline")) {
    tabs.push({ key: "timeline", label: "Timeline", icon: <History className="size-3.5" /> });
  }

  return (
    <>
      <StudentProfileHeader
        student={core.student}
        canEdit={context.ability.can(PERMISSIONS.STUDENTS_UPDATE)}
        canCreateEnrollment={context.ability.can(PERMISSIONS.ENROLLMENTS_CREATE)}
        canCreateInvoice={context.ability.can(PERMISSIONS.INVOICES_CREATE)}
        canCreatePayment={context.ability.can(PERMISSIONS.PAYMENTS_CREATE)}
        canUploadDocument={context.ability.can(PERMISSIONS.STUDENT_DOCUMENTS_UPLOAD)}
      />

      {/* Executive hierarchy (H7): estado atual → o que exige atenção → resumo operacional
          → atividade recente → detalhe nos separadores. Each metric appears once. */}
      <div className="p-4 sm:p-8 space-y-6">
        <StudentStatusBand
          health={health}
          risk={core.riskSummary}
          academicStatusLabel={core.academicSummary.progressionStatus}
        />

        <StudentAlertsPanel alerts={alerts} />

        <StudentOperationalCards
          academicSummary={core.academicSummary}
          attendanceSummary={core.attendanceSummary}
          riskSummary={core.riskSummary}
          finance={core.finance}
        />

        <StudentRecentActivity studentId={studentId} events={core.recentTimeline} />

        <Student360TabsNav active={activeTab} tabs={tabs} />

        <ActiveTabPanel
          activeTab={activeTab}
          studentId={studentId}
          organizationId={context.organizationId}
          page={page}
          core={core}
          canManagePortalAccount={context.ability.can(PERMISSIONS.STUDENTS_MANAGE_PORTAL_ACCOUNT)}
          canManageGuardians={context.ability.can(PERMISSIONS.GUARDIAN_LINKS_MANAGE)}
          canDeleteDocument={context.ability.can(PERMISSIONS.STUDENT_DOCUMENTS_DELETE)}
          canVerifyDocument={context.ability.can(PERMISSIONS.STUDENT_DOCUMENTS_VERIFY)}
          canUploadDocument={context.ability.can(PERMISSIONS.STUDENT_DOCUMENTS_UPLOAD)}
          canDeposit={context.ability.can(PERMISSIONS.WALLET_TRANSACTIONS_DEPOSIT)}
          canCreateNote={context.ability.can(PERMISSIONS.STUDENT_TIMELINE_CREATE_NOTE)}
          canDeleteNote={context.ability.can(PERMISSIONS.STUDENT_TIMELINE_DELETE_NOTE)}
        />
      </div>
    </>
  );
}

async function ActiveTabPanel({
  activeTab,
  studentId,
  organizationId,
  page,
  core,
  canManagePortalAccount,
  canManageGuardians,
  canDeleteDocument,
  canVerifyDocument,
  canUploadDocument,
  canDeposit,
  canCreateNote,
  canDeleteNote,
}: {
  activeTab: string;
  studentId: string;
  organizationId: string;
  page: number;
  core: Awaited<ReturnType<typeof getStudent360Core>>;
  canManagePortalAccount: boolean;
  canManageGuardians: boolean;
  canDeleteDocument: boolean;
  canVerifyDocument: boolean;
  canUploadDocument: boolean;
  canDeposit: boolean;
  canCreateNote: boolean;
  canDeleteNote: boolean;
}) {
  switch (activeTab) {
    case "enrollments":
      return <StudentEnrollmentsTab enrollments={core.enrollments} />;

    case "finance":
      return (
        <StudentFinanceTab
          billing={core.finance?.billing ?? null}
          wallet={core.finance?.wallet ?? null}
          canDeposit={canDeposit}
          studentId={studentId}
        />
      );

    case "attendance": {
      const { records, justifications } = await getAttendanceTabData(studentId, organizationId, page, 10);
      return (
        <StudentAttendanceTab
          subjects={core.attendanceSubjects}
          summary={core.attendanceSummary}
          records={records}
          justifications={justifications}
          pendingJustificationCount={core.pendingJustificationCount}
        />
      );
    }

    case "grades": {
      const { assessments } = await getGradesTabData(studentId, organizationId, page, 10);
      return (
        <StudentGradesTab
          assessments={assessments}
          subjectProgress={core.subjectProgress}
          academicSummary={core.academicSummary}
        />
      );
    }

    case "progress": {
      const { eligibility } = await getProgressTabData(organizationId, core.currentEnrollment);
      const hasResolvedLevel = resolveCurrentEnrollmentLevel(core.currentEnrollment).id != null;
      return (
        <StudentProgressTab
          courseProgress={core.courseProgress}
          levelProgress={core.levelProgress}
          subjectProgress={core.subjectProgress}
          eligibility={eligibility}
          hasResolvedLevel={hasResolvedLevel}
        />
      );
    }

    case "documents": {
      const documents = await getDocumentsTabData(studentId, organizationId);
      return (
        <StudentDocumentsTab
          studentId={studentId}
          documents={documents}
          canUpload={canUploadDocument}
          canDelete={canDeleteDocument}
          canVerify={canVerifyDocument}
        />
      );
    }

    case "timeline": {
      const { events, total, pageSize } = await getTimelineTabData(studentId, organizationId, page, 20);
      return (
        <StudentTimelineTab
          studentId={studentId}
          events={events}
          total={total}
          page={page}
          pageSize={pageSize}
          canCreateNote={canCreateNote}
          canDeleteNote={canDeleteNote}
        />
      );
    }

    case "overview":
    default: {
      const [portalAccount, guardianLinks] = await Promise.all([
        getStudentPortalAccountStatus(studentId, organizationId),
        getStudentGuardianLinks(studentId, organizationId),
      ]);
      return (
        <StudentOverviewTab
          core={core}
          portalAccount={portalAccount}
          canManagePortalAccount={canManagePortalAccount}
          guardianLinks={guardianLinks}
          canManageGuardians={canManageGuardians}
        />
      );
    }
  }
}
