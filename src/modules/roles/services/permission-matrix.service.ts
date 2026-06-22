import {
  findAllPermissions,
  findRolePermissionIds,
} from "@/modules/roles/repositories/permission.repository";
import type { PermissionMatrix, PermissionMatrixGroup } from "@/modules/roles/types";

// =============================================================================
// PERMISSION MATRIX SERVICE
// Groups the global Permission catalog by module for display, with PT labels.
// Permissions are read-only here — granting/revoking only ever touches the
// RolePermission join table, never the Permission catalog itself.
// =============================================================================

export const MODULE_LABELS: Record<string, string> = {
  academicCalendar: "Calendário Académico",
  academicEvents: "Eventos Académicos",
  academicHolidays: "Feriados Académicos",
  academicTerms: "Períodos Académicos",
  academicYears: "Anos Académicos",
  assessmentComponents: "Componentes de Avaliação",
  assessmentPeriods: "Períodos de Avaliação",
  assessmentPolicies: "Políticas de Avaliação",
  assessmentPublications: "Publicações de Avaliação",
  assessmentResults: "Resultados de Avaliação",
  assessments: "Avaliações",
  attendanceJustifications: "Justificações de Presença",
  attendanceRecords: "Registos de Presença",
  attendanceSessions: "Sessões de Presença",
  audit_logs: "Registos de Auditoria",
  billingPolicies: "Políticas de Faturação",
  branches: "Filiais",
  classGroupSchedules: "Horários de Turmas",
  class_groups: "Turmas",
  classroomBookings: "Reservas de Salas",
  classroomFeatures: "Características de Salas",
  classroomMaintenance: "Manutenção de Salas",
  classroomResources: "Recursos de Salas",
  classrooms: "Salas",
  course_categories: "Categorias de Cursos",
  course_levels: "Níveis de Curso",
  courses: "Cursos",
  dashboard: "Painel Principal",
  discountRules: "Regras de Desconto",
  domainEvents: "Eventos de Domínio",
  enrollments: "Matrículas",
  feeDefinitions: "Definições de Taxas",
  financialReports: "Relatórios Financeiros",
  gradeComponents: "Componentes de Notas",
  gradePolicies: "Políticas de Notas",
  grades: "Notas",
  invoices: "Faturas",
  lessonAttachments: "Anexos de Aulas",
  lessonProgress: "Progresso de Aulas",
  lessons: "Aulas",
  levelProgression: "Progressão de Nível",
  level_subjects: "Disciplinas por Nível",
  organizationRoles: "Roles da Organização",
  organizations: "Organizações",
  paymentPlans: "Planos de Pagamento",
  payments: "Pagamentos",
  practical_lessons: "Aulas Práticas",
  prerequisites: "Pré-requisitos",
  receipts: "Recibos",
  refunds: "Reembolsos",
  reports: "Relatórios",
  roles: "Roles (legado)",
  schedulePeriods: "Períodos de Horário",
  scheduleSlots: "Blocos de Horário",
  studentCourseProgress: "Progresso do Aluno no Curso",
  studentDocuments: "Documentos do Aluno",
  studentLevelProgress: "Progresso do Aluno no Nível",
  studentProgress: "Progresso do Aluno",
  studentSubjectProgress: "Progresso do Aluno na Disciplina",
  studentTimeline: "Histórico do Aluno",
  students: "Alunos",
  subjectLessons: "Aulas da Disciplina",
  subjects: "Disciplinas",
  taxRules: "Regras de Imposto",
  teachers: "Formadores",
  transcripts: "Certidões Académicas",
  users: "Utilizadores",
  vehicles: "Veículos",
  walletTransactions: "Transações de Carteira",
  wallets: "Carteiras",
};

export const ACTION_LABELS: Record<string, string> = {
  activate: "Ativar",
  adjust: "Ajustar",
  applyCredit: "Aplicar Crédito",
  approve: "Aprovar",
  archive: "Arquivar",
  assign: "Atribuir",
  assignSubject: "Atribuir Disciplina",
  assignUsers: "Atribuir Utilizadores",
  calculate: "Calcular",
  cancel: "Cancelar",
  complete: "Concluir",
  confirm: "Confirmar",
  create: "Criar",
  createNote: "Criar Nota",
  delete: "Eliminar",
  deleteNote: "Eliminar Nota",
  deposit: "Depositar",
  disable: "Desativar",
  export: "Exportar",
  grade: "Classificar",
  invalidate: "Invalidar",
  invite: "Convidar",
  issue: "Emitir",
  lock: "Bloquear",
  manage: "Gerir",
  managePermissions: "Gerir Permissões",
  mark: "Marcar",
  publish: "Publicar",
  read: "Ver",
  refund: "Reembolsar",
  reject: "Rejeitar",
  remove: "Remover",
  reopen: "Reabrir",
  reorder: "Reordenar",
  reset_password: "Repor Palavra-passe",
  setDefault: "Definir Padrão",
  suspend: "Suspender",
  update: "Atualizar",
  upload: "Carregar",
  verify: "Verificar",
  view: "Ver",
};

function humanizeKey(key: string): string {
  const withSpaces = key
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1).toLowerCase();
}

export function getModuleLabel(module: string): string {
  return MODULE_LABELS[module] ?? humanizeKey(module);
}

export function getActionLabel(action: string): string {
  return ACTION_LABELS[action] ?? humanizeKey(action);
}

export async function getPermissionMatrix(roleId?: string): Promise<PermissionMatrix> {
  const [allPermissions, grantedIds] = await Promise.all([
    findAllPermissions(),
    roleId ? findRolePermissionIds(roleId) : Promise.resolve<string[]>([]),
  ]);
  const grantedSet = new Set(grantedIds);

  const byModule = new Map<string, PermissionMatrixGroup>();
  for (const permission of allPermissions) {
    const group = byModule.get(permission.module) ?? {
      module: permission.module,
      label: getModuleLabel(permission.module),
      total: 0,
      grantedCount: 0,
      permissions: [],
    };
    const granted = grantedSet.has(permission.id);
    group.permissions.push({
      ...permission,
      code: `${permission.module}.${permission.action}`,
      label: getActionLabel(permission.action),
      granted,
    });
    group.total += 1;
    if (granted) group.grantedCount += 1;
    byModule.set(permission.module, group);
  }

  const groups = [...byModule.values()].sort((a, b) => a.label.localeCompare(b.label, "pt-PT"));

  return {
    groups,
    totalPermissions: allPermissions.length,
    totalGranted: grantedSet.size,
  };
}

export function diffPermissions(
  before: string[],
  after: string[]
): { added: string[]; removed: string[] } {
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  return {
    added: after.filter((id) => !beforeSet.has(id)),
    removed: before.filter((id) => !afterSet.has(id)),
  };
}
