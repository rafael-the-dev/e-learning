import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/shared/components/layout/page-header";
import { Badge } from "@/shared/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { requirePermission } from "@/server/auth/context";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import {
  getClassroomById,
  getClassroomFeatures,
  getClassroomResources,
  getClassroomMaintenances,
} from "@/modules/classrooms/services/classroom.service";
import { ClassroomDetailActions } from "@/modules/classrooms/components/classroom-detail-actions";
import { ClassroomFeaturePanel } from "@/modules/classrooms/components/classroom-feature-panel";
import { ClassroomResourcePanel } from "@/modules/classrooms/components/classroom-resource-panel";
import { ClassroomMaintenancePanel } from "@/modules/classrooms/components/classroom-maintenance-panel";
import {
  CLASSROOM_STATUS_LABELS,
  CLASSROOM_TYPE_LABELS,
  MEETING_PROVIDER_LABELS,
} from "@/modules/classrooms/types";
import type { AuthContext } from "@/server/auth/context";

export const metadata = { title: "Detalhe da Sala" };

export default async function ClassroomDetailPage({
  params,
}: {
  params: Promise<{ classroomId: string }>;
}) {
  let context: AuthContext;
  try {
    context = await requirePermission(PERMISSIONS.CLASSROOMS_VIEW);
  } catch {
    redirect("/forbidden");
  }

  const { classroomId } = await params;

  const [classroom, perms] = await Promise.all([
    getClassroomById(classroomId, context.organizationId),
    getUserPermissions(context.userId, context.organizationId),
  ]);

  if (!classroom) notFound();

  const ability = createAbility(perms);
  const canEdit = ability.can(PERMISSIONS.CLASSROOMS_UPDATE);
  const canArchive = ability.can(PERMISSIONS.CLASSROOMS_ARCHIVE);
  const canManageFeatures = ability.can(PERMISSIONS.CLASSROOM_FEATURES_MANAGE);
  const canViewResources = ability.can(PERMISSIONS.CLASSROOM_RESOURCES_VIEW);
  const canCreateResource = ability.can(PERMISSIONS.CLASSROOM_RESOURCES_CREATE);
  const canDeleteResource = ability.can(PERMISSIONS.CLASSROOM_RESOURCES_DELETE);
  const canViewMaintenance = ability.can(PERMISSIONS.CLASSROOM_MAINTENANCE_VIEW);
  const canCreateMaintenance = ability.can(PERMISSIONS.CLASSROOM_MAINTENANCE_CREATE);
  const canCancelMaintenance = ability.can(PERMISSIONS.CLASSROOM_MAINTENANCE_CANCEL);

  const [features, resources, maintenances] = await Promise.all([
    getClassroomFeatures(classroomId, context.organizationId),
    canViewResources ? getClassroomResources(classroomId, context.organizationId) : Promise.resolve([]),
    canViewMaintenance ? getClassroomMaintenances(classroomId, context.organizationId) : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader
        title={`${classroom.code} — ${classroom.name}`}
        description={CLASSROOM_TYPE_LABELS[classroom.classroomType] ?? classroom.classroomType}
        actions={
          <ClassroomDetailActions
            classroomId={classroomId}
            classroomName={classroom.name}
            canEdit={canEdit}
            canArchive={canArchive}
            isArchived={classroom.status === "ARCHIVED"}
          />
        }
      />
      <div className="p-8 space-y-6">
        {/* General Info */}
        <Card>
          <CardHeader>
            <CardTitle>Informação Geral</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              <div>
                <dt className="text-muted-foreground">Estado</dt>
                <dd className="mt-1">
                  <Badge variant={classroom.status === "ACTIVE" ? "default" : "outline"}>
                    {CLASSROOM_STATUS_LABELS[classroom.status] ?? classroom.status}
                  </Badge>
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Capacidade</dt>
                <dd className="mt-1 font-medium">{classroom.capacity} lugares</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Filial</dt>
                <dd className="mt-1">{classroom.branchName ?? "—"}</dd>
              </div>
              {classroom.location && (
                <div>
                  <dt className="text-muted-foreground">Localização</dt>
                  <dd className="mt-1">{classroom.location}</dd>
                </div>
              )}
              {classroom.floor && (
                <div>
                  <dt className="text-muted-foreground">Piso</dt>
                  <dd className="mt-1">{classroom.floor}</dd>
                </div>
              )}
              {classroom.meetingProvider && (
                <div>
                  <dt className="text-muted-foreground">Plataforma</dt>
                  <dd className="mt-1">{MEETING_PROVIDER_LABELS[classroom.meetingProvider] ?? classroom.meetingProvider}</dd>
                </div>
              )}
              {classroom.meetingUrl && (
                <div className="col-span-2">
                  <dt className="text-muted-foreground">URL da Reunião</dt>
                  <dd className="mt-1">
                    <a href={classroom.meetingUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate block">
                      {classroom.meetingUrl}
                    </a>
                  </dd>
                </div>
              )}
              {classroom.description && (
                <div className="col-span-3">
                  <dt className="text-muted-foreground">Descrição</dt>
                  <dd className="mt-1 text-muted-foreground">{classroom.description}</dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>

        {/* Features */}
        <Card>
          <CardHeader>
            <CardTitle>Funcionalidades</CardTitle>
          </CardHeader>
          <CardContent>
            <ClassroomFeaturePanel
              classroomId={classroomId}
              features={features}
              canManage={canManageFeatures}
            />
          </CardContent>
        </Card>

        {/* Resources */}
        {canViewResources && (
          <Card>
            <CardHeader>
              <CardTitle>Recursos</CardTitle>
            </CardHeader>
            <CardContent>
              <ClassroomResourcePanel
                classroomId={classroomId}
                resources={resources}
                canCreate={canCreateResource}
                canDelete={canDeleteResource}
              />
            </CardContent>
          </Card>
        )}

        {/* Maintenance */}
        {canViewMaintenance && (
          <Card>
            <CardHeader>
              <CardTitle>Manutenções</CardTitle>
            </CardHeader>
            <CardContent>
              <ClassroomMaintenancePanel
                classroomId={classroomId}
                maintenances={maintenances}
                canCreate={canCreateMaintenance}
                canCancel={canCancelMaintenance}
              />
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
