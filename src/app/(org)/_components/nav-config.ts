// =============================================================================
// NAVIGATION CONFIG
// Groups, items, labels, and permission gates for the sidebar.
// Icon references are kept as string names to remain serializable
// across the server→client boundary (LucideIcon refs are not serializable).
// =============================================================================

export type NavIconName =
  | "LayoutDashboard"
  | "GraduationCap"
  | "ClipboardList"
  | "UsersRound"
  | "CalendarDays"
  | "CheckSquare"
  | "ClipboardCheck"
  | "BarChart3"
  | "BookUser"
  | "CreditCard"
  | "FileText"
  | "Receipt"
  | "Wallet"
  | "BookOpen"
  | "Library"
  | "Video"
  | "DoorOpen"
  | "CalendarCheck"
  | "CalendarRange"
  | "Tags"
  | "Settings"
  | "SlidersHorizontal"
  | "Calendar"
  | "Users"
  | "Activity"
  | "PenLine";

export interface NavigationItem {
  href: string;
  label: string;
  iconName: NavIconName;
  /** Permission string. Omit to show unconditionally. */
  requiredPermission?: string;
}

export interface NavigationGroup {
  id: string;
  /** Shown as section label. Empty string renders no label. */
  label: string;
  items: NavigationItem[];
}

// =============================================================================
// NAVIGATION HIERARCHY
// Ordered by: daily operations → academic → financial → learning → resources
// → configuration → system administration.
// Organized by how users work, not by database entities.
// =============================================================================

export const NAVIGATION_GROUPS: NavigationGroup[] = [
  // ── Standalone ─────────────────────────────────────────────────────────────
  {
    id: "main",
    label: "",
    items: [
      {
        href: "/dashboard",
        label: "Dashboard",
        iconName: "LayoutDashboard",
        requiredPermission: "dashboard.view",
      },
    ],
  },

  // ── Academic Operations ─────────────────────────────────────────────────────
  // Daily workflow: Students → Enrollments → Class Groups → Schedules →
  // Attendance → Assessments → Progress → Teachers
  {
    id: "academic",
    label: "Operações Académicas",
    items: [
      {
        href: "/students",
        label: "Alunos",
        iconName: "GraduationCap",
        requiredPermission: "students.read",
      },
      {
        href: "/enrollments",
        label: "Matrículas",
        iconName: "ClipboardList",
        requiredPermission: "enrollments.view",
      },
      {
        href: "/class-groups",
        label: "Turmas",
        iconName: "UsersRound",
        requiredPermission: "class_groups.read",
      },
      {
        href: "/schedules",
        label: "Horários",
        iconName: "CalendarDays",
        requiredPermission: "scheduleSlots.view",
      },
      {
        href: "/attendance",
        label: "Presenças",
        iconName: "CheckSquare",
        requiredPermission: "attendanceSessions.view",
      },
      {
        href: "/assessments",
        label: "Avaliações",
        iconName: "ClipboardCheck",
        requiredPermission: "assessments.view",
      },
      {
        href: "/grades",
        label: "Notas",
        iconName: "PenLine",
        requiredPermission: "grades.view",
      },
      {
        href: "/student-progress",
        label: "Progresso por Disciplina",
        iconName: "BarChart3",
        requiredPermission: "studentSubjectProgress.view",
      },
      {
        href: "/level-progression",
        label: "Progressão por Nível",
        iconName: "BarChart3",
        requiredPermission: "levelProgression.view",
      },
      {
        href: "/teachers",
        label: "Professores",
        iconName: "BookUser",
        requiredPermission: "teachers.read",
      },
    ],
  },

  // ── Financial Operations ────────────────────────────────────────────────────
  // High-frequency for secretaries: payments first, then invoices/receipts/wallets
  {
    id: "financial",
    label: "Operações Financeiras",
    items: [
      {
        href: "/payments",
        label: "Pagamentos",
        iconName: "CreditCard",
        requiredPermission: "payments.view",
      },
      {
        href: "/invoices",
        label: "Faturas",
        iconName: "FileText",
        requiredPermission: "invoices.view",
      },
      {
        href: "/receipts",
        label: "Recibos",
        iconName: "Receipt",
        requiredPermission: "receipts.view",
      },
      {
        href: "/student-wallets",
        label: "Carteiras",
        iconName: "Wallet",
        requiredPermission: "wallets.view",
      },
    ],
  },

  // ── Learning Management ─────────────────────────────────────────────────────
  // Curriculum layer: courses → subjects → lessons
  {
    id: "learning",
    label: "Gestão de Aprendizagem",
    items: [
      {
        href: "/courses",
        label: "Cursos",
        iconName: "BookOpen",
        requiredPermission: "courses.read",
      },
      {
        href: "/subjects",
        label: "Disciplinas",
        iconName: "Library",
        requiredPermission: "subjects.view",
      },
      {
        href: "/lessons",
        label: "Lições",
        iconName: "Video",
        requiredPermission: "lessons.view",
      },
    ],
  },

  // ── Resources ───────────────────────────────────────────────────────────────
  // Physical + calendar resources
  {
    id: "resources",
    label: "Recursos",
    items: [
      {
        href: "/classrooms",
        label: "Salas",
        iconName: "DoorOpen",
        requiredPermission: "classrooms.view",
      },
      {
        href: "/classroom-bookings",
        label: "Reservas de Sala",
        iconName: "CalendarCheck",
        requiredPermission: "classroomBookings.view",
      },
      {
        href: "/academic-calendar",
        label: "Calendário Académico",
        iconName: "CalendarRange",
        requiredPermission: "academicCalendar.view",
      },
    ],
  },

  // ── Configuration ───────────────────────────────────────────────────────────
  // Low-frequency setup pages — deliberately pushed to the bottom
  {
    id: "config",
    label: "Configuração",
    items: [
      {
        href: "/courses/categories",
        label: "Categorias de Cursos",
        iconName: "Tags",
        requiredPermission: "course_categories.view",
      },
      {
        href: "/settings/billing",
        label: "Políticas de Faturação",
        iconName: "Settings",
        requiredPermission: "billingPolicies.view",
      },
      {
        href: "/assessment-policies",
        label: "Políticas de Avaliação",
        iconName: "SlidersHorizontal",
        requiredPermission: "assessmentPolicies.view",
      },
      {
        href: "/assessment-periods",
        label: "Períodos de Avaliação",
        iconName: "Calendar",
        requiredPermission: "assessmentPeriods.view",
      },
    ],
  },

  // ── System Administration ───────────────────────────────────────────────────
  // ORG_ADMIN and SUPER_ADMIN only — hidden from teachers and secretaries
  {
    id: "system",
    label: "Sistema",
    items: [
      {
        href: "/users",
        label: "Utilizadores",
        iconName: "Users",
        requiredPermission: "users.read",
      },
      {
        href: "/system/events",
        label: "Eventos de Sistema",
        iconName: "Activity",
        requiredPermission: "domainEvents.view",
      },
    ],
  },
];
