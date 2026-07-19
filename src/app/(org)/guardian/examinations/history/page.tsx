import { notFound } from "next/navigation";
import { requirePermissionOrRedirect } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { guardianExaminationService } from "@/modules/guardian-examinations/services/guardian-examination.service";
import { GuardianExamHistoryTable } from "@/modules/guardian-examinations/components/guardian-exam-history-table";
import { getGuardianExamStatusLabel } from "@/modules/guardian-examinations/components/guardian-exam-status-labels";
import { ExaminationFilterBar } from "@/modules/examinations/components/examination-filter-bar";
import { ExaminationEmptyState } from "@/modules/examinations/components/examination-states";

export const metadata = { title: "Exames · Histórico" };

// Guardian Examination Portal — Histórico (supervision, READ-ONLY).
// guardianUserId is ALWAYS context.userId (the authenticated guardian), NEVER the URL.
// The `student` param is only a SELECTION — the backend validates the link and returns
// null (→ notFound) for any student the guardian may not academically supervise.

// The candidate-status values the history may be filtered by. Values stay English
// (they travel in the URL); PT-PT comes from the guardian render-layer registry.
const CANDIDATE_STATUS_OPTIONS = [
  "PENDING_ELIGIBILITY",
  "ELIGIBLE",
  "INELIGIBLE",
  "REGISTERED",
  "WITHDRAWN",
  "DISQUALIFIED",
] as const;

export default async function GuardianExamHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    student?: string;
    year?: string;
    subjectId?: string;
    status?: string;
    page?: string;
  }>;
}) {
  const sp = await searchParams;
  const context = await requirePermissionOrRedirect(PERMISSIONS.GUARDIAN_PORTAL_VIEW);

  const options = await guardianExaminationService.getHistoryStudentOptions(
    context.organizationId,
    context.userId
  );

  // No academically-visible educando → nothing to supervise.
  if (options.length === 0) {
    return <ExaminationEmptyState title="Nenhum educando com visibilidade académica." />;
  }

  // The URL `student` is only a selection. An explicit invalid selection must NOT
  // silently fall back to another educando — fail closed.
  let selectedStudentId: string;
  if (sp.student) {
    if (!options.some((o) => o.studentId === sp.student)) notFound();
    selectedStudentId = sp.student;
  } else {
    selectedStudentId = options[0].studentId;
  }

  const yearNum = sp.year ? Number(sp.year) : undefined;
  const pageNum = sp.page ? Number(sp.page) : 1;

  const history = await guardianExaminationService.getHistory(
    context.organizationId,
    context.userId,
    selectedStudentId,
    {
      year: yearNum && Number.isFinite(yearNum) ? yearNum : undefined,
      subjectId: sp.subjectId || undefined,
      status: sp.status || undefined,
      page: Number.isFinite(pageNum) && pageNum > 0 ? pageNum : 1,
    }
  );
  // Fail-closed: null = not linked / no academic visibility for this educando.
  if (!history) notFound();

  const filtered = Boolean(sp.year || sp.subjectId || sp.status);

  return (
    <div className="space-y-4">
      <ExaminationFilterBar
        showSearch={false}
        selects={[
          {
            param: "student",
            label: "Educando",
            options: options.map((o) => ({ value: o.studentId, label: o.studentName })),
          },
          {
            param: "year",
            label: "Ano",
            options: history.facets.years.map((y) => ({ value: String(y), label: String(y) })),
          },
          {
            param: "subjectId",
            label: "Disciplina",
            options: history.facets.subjects.map((s) => ({ value: s.id, label: s.name })),
          },
          {
            param: "status",
            label: "Estado",
            options: CANDIDATE_STATUS_OPTIONS.map((value) => ({
              value,
              label: getGuardianExamStatusLabel("candidate", value),
            })),
          },
        ]}
      />
      <GuardianExamHistoryTable page={history} filtered={filtered} />
    </div>
  );
}
