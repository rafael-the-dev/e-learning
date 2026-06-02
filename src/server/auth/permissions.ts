// =============================================================================
// PERMISSION CATALOG
// Single source of truth for every permission in the system.
// Format: "module.action"
// New permissions are added here first, then seeded into the database.
// =============================================================================

export const PERMISSIONS = {
  // Organizations
  ORGANIZATIONS_CREATE: "organizations.create",
  ORGANIZATIONS_READ: "organizations.read",
  ORGANIZATIONS_UPDATE: "organizations.update",
  ORGANIZATIONS_DELETE: "organizations.delete",
  ORGANIZATIONS_SUSPEND: "organizations.suspend",

  // Branches
  BRANCHES_CREATE: "branches.create",
  BRANCHES_READ: "branches.read",
  BRANCHES_UPDATE: "branches.update",
  BRANCHES_DELETE: "branches.delete",

  // Users
  USERS_CREATE: "users.create",
  USERS_READ: "users.read",
  USERS_UPDATE: "users.update",
  USERS_DELETE: "users.delete",
  USERS_INVITE: "users.invite",
  USERS_RESET_PASSWORD: "users.reset_password",

  // Roles & Permissions
  ROLES_CREATE: "roles.create",
  ROLES_READ: "roles.read",
  ROLES_UPDATE: "roles.update",
  ROLES_DELETE: "roles.delete",
  ROLES_ASSIGN: "roles.assign",

  // Students
  STUDENTS_CREATE: "students.create",
  STUDENTS_READ: "students.read",
  STUDENTS_UPDATE: "students.update",
  STUDENTS_DELETE: "students.delete",
  STUDENTS_SUSPEND: "students.suspend",

  // Teachers
  TEACHERS_CREATE: "teachers.create",
  TEACHERS_READ: "teachers.read",
  TEACHERS_UPDATE: "teachers.update",
  TEACHERS_DELETE: "teachers.delete",

  // Courses
  COURSES_CREATE: "courses.create",
  COURSES_READ: "courses.read",
  COURSES_UPDATE: "courses.update",
  COURSES_DELETE: "courses.delete",

  // Class Groups
  CLASS_GROUPS_CREATE: "class_groups.create",
  CLASS_GROUPS_READ: "class_groups.read",
  CLASS_GROUPS_UPDATE: "class_groups.update",
  CLASS_GROUPS_DELETE: "class_groups.delete",

  // Enrollments
  ENROLLMENTS_CREATE: "enrollments.create",
  ENROLLMENTS_READ: "enrollments.read",
  ENROLLMENTS_UPDATE: "enrollments.update",
  ENROLLMENTS_CANCEL: "enrollments.cancel",
  ENROLLMENTS_APPROVE: "enrollments.approve",

  // Attendance
  ATTENDANCE_MARK: "attendance.mark",
  ATTENDANCE_READ: "attendance.read",
  ATTENDANCE_JUSTIFY: "attendance.justify",
  ATTENDANCE_EDIT: "attendance.edit",

  // Vehicles
  VEHICLES_CREATE: "vehicles.create",
  VEHICLES_READ: "vehicles.read",
  VEHICLES_UPDATE: "vehicles.update",
  VEHICLES_DELETE: "vehicles.delete",

  // Practical Lessons
  PRACTICAL_LESSONS_CREATE: "practical_lessons.create",
  PRACTICAL_LESSONS_READ: "practical_lessons.read",
  PRACTICAL_LESSONS_UPDATE: "practical_lessons.update",
  PRACTICAL_LESSONS_CANCEL: "practical_lessons.cancel",

  // Invoices
  INVOICES_CREATE: "invoices.create",
  INVOICES_READ: "invoices.read",
  INVOICES_UPDATE: "invoices.update",
  INVOICES_CANCEL: "invoices.cancel",

  // Payments
  PAYMENTS_CREATE: "payments.create",
  PAYMENTS_READ: "payments.read",
  PAYMENTS_CANCEL: "payments.cancel",
  PAYMENTS_REFUND: "payments.refund",

  // Receipts
  RECEIPTS_CREATE: "receipts.create",
  RECEIPTS_READ: "receipts.read",

  // Reports
  REPORTS_VIEW: "reports.view",
  REPORTS_EXPORT: "reports.export",

  // Audit Logs
  AUDIT_LOGS_VIEW: "audit_logs.view",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

// =============================================================================
// SYSTEM ROLES AND THEIR DEFAULT PERMISSIONS
// =============================================================================

export const SYSTEM_ROLES = {
  SUPER_ADMIN: "SUPER_ADMIN",
  ORG_ADMIN: "ORG_ADMIN",
  SECRETARY: "SECRETARY",
  TEACHER: "TEACHER",
  STUDENT: "STUDENT",
} as const;

export type SystemRole = (typeof SYSTEM_ROLES)[keyof typeof SYSTEM_ROLES];

export const ROLE_PERMISSIONS: Record<SystemRole, Permission[]> = {
  SUPER_ADMIN: Object.values(PERMISSIONS) as Permission[],

  ORG_ADMIN: Object.values(PERMISSIONS).filter(
    (p) => !p.startsWith("organizations.delete")
  ) as Permission[],

  SECRETARY: [
    PERMISSIONS.STUDENTS_CREATE,
    PERMISSIONS.STUDENTS_READ,
    PERMISSIONS.STUDENTS_UPDATE,
    PERMISSIONS.STUDENTS_SUSPEND,
    PERMISSIONS.TEACHERS_READ,
    PERMISSIONS.COURSES_READ,
    PERMISSIONS.CLASS_GROUPS_READ,
    PERMISSIONS.ENROLLMENTS_CREATE,
    PERMISSIONS.ENROLLMENTS_READ,
    PERMISSIONS.ENROLLMENTS_UPDATE,
    PERMISSIONS.ENROLLMENTS_CANCEL,
    PERMISSIONS.ENROLLMENTS_APPROVE,
    PERMISSIONS.ATTENDANCE_READ,
    PERMISSIONS.ATTENDANCE_JUSTIFY,
    PERMISSIONS.INVOICES_CREATE,
    PERMISSIONS.INVOICES_READ,
    PERMISSIONS.INVOICES_UPDATE,
    PERMISSIONS.INVOICES_CANCEL,
    PERMISSIONS.PAYMENTS_CREATE,
    PERMISSIONS.PAYMENTS_READ,
    PERMISSIONS.PAYMENTS_CANCEL,
    PERMISSIONS.RECEIPTS_CREATE,
    PERMISSIONS.RECEIPTS_READ,
    PERMISSIONS.REPORTS_VIEW,
    PERMISSIONS.VEHICLES_READ,
    PERMISSIONS.PRACTICAL_LESSONS_CREATE,
    PERMISSIONS.PRACTICAL_LESSONS_READ,
    PERMISSIONS.PRACTICAL_LESSONS_UPDATE,
    PERMISSIONS.PRACTICAL_LESSONS_CANCEL,
  ],

  TEACHER: [
    PERMISSIONS.STUDENTS_READ,
    PERMISSIONS.COURSES_READ,
    PERMISSIONS.CLASS_GROUPS_READ,
    PERMISSIONS.ENROLLMENTS_READ,
    PERMISSIONS.ATTENDANCE_MARK,
    PERMISSIONS.ATTENDANCE_READ,
    PERMISSIONS.ATTENDANCE_JUSTIFY,
    PERMISSIONS.PRACTICAL_LESSONS_CREATE,
    PERMISSIONS.PRACTICAL_LESSONS_READ,
    PERMISSIONS.PRACTICAL_LESSONS_UPDATE,
    PERMISSIONS.VEHICLES_READ,
  ],

  STUDENT: [
    PERMISSIONS.ENROLLMENTS_READ,
    PERMISSIONS.ATTENDANCE_READ,
    PERMISSIONS.INVOICES_READ,
    PERMISSIONS.PAYMENTS_READ,
    PERMISSIONS.RECEIPTS_READ,
    PERMISSIONS.PRACTICAL_LESSONS_READ,
  ],
};
