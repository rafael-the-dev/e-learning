import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/shared/components/layout/page-header";
import { Badge } from "@/shared/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { requirePermission } from "@/server/auth/context";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getSubjectById } from "@/modules/courses/services/course.service";
import {
  getSubjectLessons,
  getPublishedLessons,
} from "@/modules/lessons/services/lesson.service";
import { SubjectLessonsPanel } from "@/modules/lessons/components/subject-lessons-panel";
import { SUBJECT_STATUS_LABELS } from "@/modules/courses/types";
import { findActivePolicyForLevelSubject } from "@/modules/assessments/repositories/assessment-policy.repository";
import { findActiveComponentsByPolicy } from "@/modules/assessments/repositories/assessment-component.repository";
import { SubjectPolicyPanel } from "@/modules/grades/components/subject-policy-panel";
import { getDb } from "@/server/db";
import type { AuthContext } from "@/server/auth/context";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ subjectId: string }>;
}) {
  const { subjectId } = await params;
  return { title: `Disciplina ${subjectId}` };
}

export default async function SubjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ subjectId: string }>;
  searchParams: Promise<{ tab?: string; levelSubjectId?: string }>;
}) {
  let context: AuthContext;
  try {
    context = await requirePermission(PERMISSIONS.SUBJECTS_VIEW);
  } catch {
    redirect("/forbidden");
  }

  const { subjectId } = await params;
  const sp = await searchParams;
  const activeTab =
    sp.tab === "lessons" ? "lessons" : sp.tab === "policy" ? "policy" : "info";

  const subject = await getSubjectById(subjectId, context.organizationId).catch(() => null);
  if (!subject) notFound();

  const perms = await getUserPermissions(context.userId, context.organizationId);
  const ability = createAbility(perms);

  const canViewLessons = ability.can(PERMISSIONS.SUBJECT_LESSONS_VIEW);
  const canViewPolicy = ability.can(PERMISSIONS.GRADE_POLICIES_VIEW);

  const [subjectLessons, publishedLessons] = canViewLessons
    ? await Promise.all([
        getSubjectLessons(subjectId, context.organizationId),
        getPublishedLessons(context.organizationId),
      ])
    : [[], []];

  // Load LevelSubjects for this subject — each one can have its own AssessmentPolicy
  const db = await getDb();
  const levelSubjects = canViewPolicy
    ? await db.levelSubject.findMany({
        where: { subjectId, organizationId: context.organizationId, deletedAt: null },
        select: {
          id: true,
          courseLevel: { select: { name: true, course: { select: { name: true } } } },
        },
        orderBy: [{ courseLevel: { course: { name: "asc" } } }, { courseLevel: { name: "asc" } }],
      })
    : [];

  // For each LevelSubject, load its active policy and components
  const levelSubjectPolicies = await Promise.all(
    levelSubjects.map(async (ls) => {
      const policy = await findActivePolicyForLevelSubject(ls.id, context.organizationId);
      const components = policy
        ? await findActiveComponentsByPolicy(policy.id, context.organizationId)
        : [];
      return { levelSubject: ls, policy, components };
    })
  );

  const statusVariant =
    subject.status === "ACTIVE" ? "default" : subject.status === "INACTIVE" ? "secondary" : "outline";

  return (
    <>
      <PageHeader
        title={subject.name}
        description={subject.description ?? undefined}
      />

      <div className="p-8 space-y-6">
        <div className="flex items-center gap-3">
          <Badge variant={statusVariant}>
            {SUBJECT_STATUS_LABELS[subject.status] ?? subject.status}
          </Badge>
          {subject.code && (
            <span className="text-sm text-muted-foreground font-mono">{subject.code}</span>
          )}
        </div>

        <Tabs defaultValue={activeTab}>
          <TabsList>
            <TabsTrigger value="info">Informação</TabsTrigger>
            {canViewLessons && (
              <TabsTrigger value="lessons">
                Lições ({subjectLessons.length})
              </TabsTrigger>
            )}
            {canViewPolicy && (
              <TabsTrigger value="policy">Política de Avaliação</TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="info" className="mt-4">
            <div className="rounded-md border p-4 space-y-3 max-w-lg">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <span className="text-muted-foreground">Nome</span>
                <span>{subject.name}</span>
                {subject.code && (
                  <>
                    <span className="text-muted-foreground">Código</span>
                    <span className="font-mono">{subject.code}</span>
                  </>
                )}
                <span className="text-muted-foreground">Estado</span>
                <span>{SUBJECT_STATUS_LABELS[subject.status] ?? subject.status}</span>
                <span className="text-muted-foreground">Criada em</span>
                <span>{subject.createdAt.toLocaleDateString("pt-PT")}</span>
              </div>
            </div>
          </TabsContent>

          {canViewLessons && (
            <TabsContent value="lessons" className="mt-4">
              <SubjectLessonsPanel
                subjectId={subjectId}
                subjectLessons={subjectLessons}
                availableLessons={publishedLessons}
                canAssign={ability.can(PERMISSIONS.SUBJECT_LESSONS_ASSIGN)}
                canEdit={ability.can(PERMISSIONS.SUBJECT_LESSONS_UPDATE)}
                canRemove={ability.can(PERMISSIONS.SUBJECT_LESSONS_REMOVE)}
                canReorder={ability.can(PERMISSIONS.SUBJECT_LESSONS_REORDER)}
              />
            </TabsContent>
          )}

          {canViewPolicy && (
            <TabsContent value="policy" className="mt-4">
              {levelSubjectPolicies.length === 0 ? (
                <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">
                  Esta disciplina ainda não está associada a nenhum nível de curso.
                </div>
              ) : (
                <div className="space-y-6">
                  {levelSubjectPolicies.map(({ levelSubject, policy, components }) => (
                    <div key={levelSubject.id} className="space-y-3">
                      <div className="text-sm font-medium text-muted-foreground">
                        {levelSubject.courseLevel.course.name} — {levelSubject.courseLevel.name}
                      </div>
                      <SubjectPolicyPanel
                        levelSubjectId={levelSubject.id}
                        policy={policy}
                        components={components}
                        canCreate={ability.can(PERMISSIONS.GRADE_POLICIES_CREATE)}
                        canEdit={ability.can(PERMISSIONS.GRADE_POLICIES_UPDATE)}
                        canArchive={ability.can(PERMISSIONS.GRADE_POLICIES_ARCHIVE)}
                        canManageComponents={ability.can(PERMISSIONS.GRADE_COMPONENTS_CREATE)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          )}
        </Tabs>
      </div>
    </>
  );
}
