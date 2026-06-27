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
  USERS_DISABLE: "users.disable",
  USERS_RESET_PASSWORD: "users.reset_password",

  // Roles & Permissions
  ROLES_CREATE: "roles.create",
  ROLES_READ: "roles.read",
  ROLES_UPDATE: "roles.update",
  ROLES_DELETE: "roles.delete",
  ROLES_ASSIGN: "roles.assign",

  // Organization Roles (custom role management UI)
  ORGANIZATION_ROLES_VIEW: "organizationRoles.view",
  ORGANIZATION_ROLES_CREATE: "organizationRoles.create",
  ORGANIZATION_ROLES_UPDATE: "organizationRoles.update",
  ORGANIZATION_ROLES_ARCHIVE: "organizationRoles.archive",
  ORGANIZATION_ROLES_ASSIGN_USERS: "organizationRoles.assignUsers",
  ORGANIZATION_ROLES_MANAGE_PERMISSIONS: "organizationRoles.managePermissions",

  // Students
  STUDENTS_CREATE: "students.create",
  STUDENTS_READ: "students.read",
  STUDENTS_UPDATE: "students.update",
  STUDENTS_DELETE: "students.delete",
  STUDENTS_SUSPEND: "students.suspend",
  STUDENTS_IMPORT: "students.import",
  // Manage a student's Portal login from Student 360 (create/link, resend invite, unlink). Admin-only.
  STUDENTS_MANAGE_PORTAL_ACCOUNT: "students.managePortalAccount",
  IMPORT_JOBS_VIEW: "imports.jobs.view",

  // Teachers
  TEACHERS_CREATE: "teachers.create",
  TEACHERS_READ: "teachers.read",
  TEACHERS_UPDATE: "teachers.update",
  TEACHERS_DELETE: "teachers.delete",
  TEACHERS_SUSPEND: "teachers.suspend",
  TEACHERS_ASSIGN_SUBJECT: "teachers.assignSubject",
  TEACHERS_IMPORT: "teachers.import",

  // Courses
  COURSES_CREATE: "courses.create",
  COURSES_READ: "courses.read",
  COURSES_UPDATE: "courses.update",
  COURSES_ARCHIVE: "courses.archive",
  COURSES_DELETE: "courses.delete",

  // Course Levels
  COURSE_LEVELS_VIEW: "course_levels.view",
  COURSE_LEVELS_CREATE: "course_levels.create",
  COURSE_LEVELS_UPDATE: "course_levels.update",
  COURSE_LEVELS_ARCHIVE: "course_levels.archive",
  COURSE_LEVELS_DELETE: "course_levels.delete",
  COURSE_LEVELS_REORDER: "course_levels.reorder",

  // Subjects
  SUBJECTS_VIEW: "subjects.view",
  SUBJECTS_CREATE: "subjects.create",
  SUBJECTS_UPDATE: "subjects.update",
  SUBJECTS_ARCHIVE: "subjects.archive",
  SUBJECTS_DELETE: "subjects.delete",

  // Level Subjects
  LEVEL_SUBJECTS_VIEW: "level_subjects.view",
  LEVEL_SUBJECTS_ASSIGN: "level_subjects.assign",
  LEVEL_SUBJECTS_UPDATE: "level_subjects.update",
  LEVEL_SUBJECTS_REMOVE: "level_subjects.remove",
  LEVEL_SUBJECTS_REORDER: "level_subjects.reorder",

  // Course Categories
  COURSE_CATEGORIES_VIEW: "course_categories.view",
  COURSE_CATEGORIES_CREATE: "course_categories.create",
  COURSE_CATEGORIES_UPDATE: "course_categories.update",
  COURSE_CATEGORIES_ARCHIVE: "course_categories.archive",
  COURSE_CATEGORIES_DELETE: "course_categories.delete",

  // Class Groups
  CLASS_GROUPS_CREATE: "class_groups.create",
  CLASS_GROUPS_READ: "class_groups.read",
  CLASS_GROUPS_UPDATE: "class_groups.update",
  CLASS_GROUPS_ARCHIVE: "class_groups.archive",
  CLASS_GROUPS_DELETE: "class_groups.delete",

  // Schedule Periods
  SCHEDULE_PERIODS_VIEW: "schedulePeriods.view",
  SCHEDULE_PERIODS_CREATE: "schedulePeriods.create",
  SCHEDULE_PERIODS_UPDATE: "schedulePeriods.update",
  SCHEDULE_PERIODS_ARCHIVE: "schedulePeriods.archive",
  SCHEDULE_PERIODS_DELETE: "schedulePeriods.delete",

  // Schedule Slots
  SCHEDULE_SLOTS_VIEW: "scheduleSlots.view",
  SCHEDULE_SLOTS_CREATE: "scheduleSlots.create",
  SCHEDULE_SLOTS_UPDATE: "scheduleSlots.update",
  SCHEDULE_SLOTS_ARCHIVE: "scheduleSlots.archive",
  SCHEDULE_SLOTS_DELETE: "scheduleSlots.delete",

  // Class Group Schedules
  CLASS_GROUP_SCHEDULES_VIEW: "classGroupSchedules.view",
  CLASS_GROUP_SCHEDULES_ASSIGN: "classGroupSchedules.assign",
  CLASS_GROUP_SCHEDULES_REMOVE: "classGroupSchedules.remove",

  // Enrollments
  ENROLLMENTS_VIEW: "enrollments.view",
  ENROLLMENTS_CREATE: "enrollments.create",
  ENROLLMENTS_UPDATE: "enrollments.update",
  ENROLLMENTS_ACTIVATE: "enrollments.activate",
  ENROLLMENTS_SUSPEND: "enrollments.suspend",
  ENROLLMENTS_CANCEL: "enrollments.cancel",
  ENROLLMENTS_COMPLETE: "enrollments.complete",
  ENROLLMENTS_DELETE: "enrollments.delete",

  // Attendance Sessions
  ATTENDANCE_SESSIONS_VIEW: "attendanceSessions.view",
  ATTENDANCE_SESSIONS_CREATE: "attendanceSessions.create",
  ATTENDANCE_SESSIONS_UPDATE: "attendanceSessions.update",
  ATTENDANCE_SESSIONS_CANCEL: "attendanceSessions.cancel",
  ATTENDANCE_SESSIONS_COMPLETE: "attendanceSessions.complete",

  // Attendance Records
  ATTENDANCE_RECORDS_VIEW: "attendanceRecords.view",
  ATTENDANCE_RECORDS_MARK: "attendanceRecords.mark",
  ATTENDANCE_RECORDS_UPDATE: "attendanceRecords.update",

  // Attendance Justifications
  ATTENDANCE_JUSTIFICATIONS_VIEW: "attendanceJustifications.view",
  ATTENDANCE_JUSTIFICATIONS_CREATE: "attendanceJustifications.create",
  ATTENDANCE_JUSTIFICATIONS_APPROVE: "attendanceJustifications.approve",
  ATTENDANCE_JUSTIFICATIONS_REJECT: "attendanceJustifications.reject",

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
  INVOICES_VIEW: "invoices.view",
  INVOICES_CREATE: "invoices.create",
  INVOICES_UPDATE: "invoices.update",
  INVOICES_CANCEL: "invoices.cancel",
  INVOICES_DELETE: "invoices.delete",

  // Payments
  PAYMENTS_VIEW: "payments.view",
  PAYMENTS_CREATE: "payments.create",
  PAYMENTS_CONFIRM: "payments.confirm",
  PAYMENTS_CANCEL: "payments.cancel",
  PAYMENTS_REFUND: "payments.refund",

  // Receipts
  RECEIPTS_VIEW: "receipts.view",
  RECEIPTS_ISSUE: "receipts.issue",
  RECEIPTS_CANCEL: "receipts.cancel",

  // Refunds
  REFUNDS_VIEW: "refunds.view",
  REFUNDS_CREATE: "refunds.create",
  REFUNDS_APPROVE: "refunds.approve",
  REFUNDS_REJECT: "refunds.reject",
  REFUNDS_COMPLETE: "refunds.complete",

  // Payment Plans
  PAYMENT_PLANS_VIEW: "paymentPlans.view",
  PAYMENT_PLANS_CREATE: "paymentPlans.create",
  PAYMENT_PLANS_UPDATE: "paymentPlans.update",
  PAYMENT_PLANS_CANCEL: "paymentPlans.cancel",

  // Student Wallets
  WALLETS_VIEW: "wallets.view",
  WALLET_TRANSACTIONS_VIEW: "walletTransactions.view",
  WALLET_TRANSACTIONS_DEPOSIT: "walletTransactions.deposit",
  WALLET_TRANSACTIONS_ADJUST: "walletTransactions.adjust",
  WALLET_TRANSACTIONS_APPLY_CREDIT: "walletTransactions.applyCredit",
  WALLET_TRANSACTIONS_REFUND: "walletTransactions.refund",

  // Fee Definitions
  FEE_DEFINITIONS_VIEW: "feeDefinitions.view",
  FEE_DEFINITIONS_CREATE: "feeDefinitions.create",
  FEE_DEFINITIONS_UPDATE: "feeDefinitions.update",
  FEE_DEFINITIONS_ARCHIVE: "feeDefinitions.archive",
  FEE_DEFINITIONS_DELETE: "feeDefinitions.delete",

  // Billing Policies
  BILLING_POLICIES_VIEW: "billingPolicies.view",
  BILLING_POLICIES_CREATE: "billingPolicies.create",
  BILLING_POLICIES_UPDATE: "billingPolicies.update",
  BILLING_POLICIES_ARCHIVE: "billingPolicies.archive",
  BILLING_POLICIES_DELETE: "billingPolicies.delete",
  BILLING_POLICIES_SET_DEFAULT: "billingPolicies.setDefault",

  // Discount Rules
  DISCOUNT_RULES_VIEW: "discountRules.view",
  DISCOUNT_RULES_CREATE: "discountRules.create",
  DISCOUNT_RULES_UPDATE: "discountRules.update",
  DISCOUNT_RULES_ARCHIVE: "discountRules.archive",
  DISCOUNT_RULES_DELETE: "discountRules.delete",

  // Tax Rules
  TAX_RULES_VIEW: "taxRules.view",
  TAX_RULES_CREATE: "taxRules.create",
  TAX_RULES_UPDATE: "taxRules.update",
  TAX_RULES_ARCHIVE: "taxRules.archive",
  TAX_RULES_DELETE: "taxRules.delete",

  // Lessons
  LESSONS_VIEW: "lessons.view",
  LESSONS_CREATE: "lessons.create",
  LESSONS_UPDATE: "lessons.update",
  LESSONS_PUBLISH: "lessons.publish",
  LESSONS_ARCHIVE: "lessons.archive",
  LESSONS_DELETE: "lessons.delete",

  // Lesson Attachments
  LESSON_ATTACHMENTS_VIEW: "lessonAttachments.view",
  LESSON_ATTACHMENTS_CREATE: "lessonAttachments.create",
  LESSON_ATTACHMENTS_DELETE: "lessonAttachments.delete",

  // Subject Lessons
  SUBJECT_LESSONS_VIEW: "subjectLessons.view",
  SUBJECT_LESSONS_ASSIGN: "subjectLessons.assign",
  SUBJECT_LESSONS_UPDATE: "subjectLessons.update",
  SUBJECT_LESSONS_REMOVE: "subjectLessons.remove",
  SUBJECT_LESSONS_REORDER: "subjectLessons.reorder",

  // Lesson Progress
  LESSON_PROGRESS_VIEW: "lessonProgress.view",
  LESSON_PROGRESS_UPDATE: "lessonProgress.update",

  // Academic Calendar
  ACADEMIC_CALENDAR_VIEW: "academicCalendar.view",

  // Academic Years
  ACADEMIC_YEARS_CREATE: "academicYears.create",
  ACADEMIC_YEARS_UPDATE: "academicYears.update",
  ACADEMIC_YEARS_ARCHIVE: "academicYears.archive",
  ACADEMIC_YEARS_DELETE: "academicYears.delete",
  ACADEMIC_YEARS_SET_DEFAULT: "academicYears.setDefault",

  // Academic Terms
  ACADEMIC_TERMS_CREATE: "academicTerms.create",
  ACADEMIC_TERMS_UPDATE: "academicTerms.update",
  ACADEMIC_TERMS_ARCHIVE: "academicTerms.archive",
  ACADEMIC_TERMS_DELETE: "academicTerms.delete",

  // Academic Holidays
  ACADEMIC_HOLIDAYS_CREATE: "academicHolidays.create",
  ACADEMIC_HOLIDAYS_UPDATE: "academicHolidays.update",
  ACADEMIC_HOLIDAYS_ARCHIVE: "academicHolidays.archive",
  ACADEMIC_HOLIDAYS_DELETE: "academicHolidays.delete",

  // Academic Events
  ACADEMIC_EVENTS_CREATE: "academicEvents.create",
  ACADEMIC_EVENTS_UPDATE: "academicEvents.update",
  ACADEMIC_EVENTS_ARCHIVE: "academicEvents.archive",
  ACADEMIC_EVENTS_DELETE: "academicEvents.delete",

  // Classrooms
  CLASSROOMS_VIEW: "classrooms.view",
  CLASSROOMS_CREATE: "classrooms.create",
  CLASSROOMS_UPDATE: "classrooms.update",
  CLASSROOMS_ARCHIVE: "classrooms.archive",
  CLASSROOMS_DELETE: "classrooms.delete",

  // Classroom Features
  CLASSROOM_FEATURES_MANAGE: "classroomFeatures.manage",

  // Classroom Resources
  CLASSROOM_RESOURCES_VIEW: "classroomResources.view",
  CLASSROOM_RESOURCES_CREATE: "classroomResources.create",
  CLASSROOM_RESOURCES_UPDATE: "classroomResources.update",
  CLASSROOM_RESOURCES_DELETE: "classroomResources.delete",

  // Classroom Maintenance
  CLASSROOM_MAINTENANCE_VIEW: "classroomMaintenance.view",
  CLASSROOM_MAINTENANCE_CREATE: "classroomMaintenance.create",
  CLASSROOM_MAINTENANCE_UPDATE: "classroomMaintenance.update",
  CLASSROOM_MAINTENANCE_CANCEL: "classroomMaintenance.cancel",

  // Classroom Bookings
  CLASSROOM_BOOKINGS_VIEW: "classroomBookings.view",
  CLASSROOM_BOOKINGS_CREATE: "classroomBookings.create",
  CLASSROOM_BOOKINGS_UPDATE: "classroomBookings.update",
  CLASSROOM_BOOKINGS_CANCEL: "classroomBookings.cancel",

  // Reports
  REPORTS_VIEW: "reports.view",
  REPORTS_EXPORT: "reports.export",

  // Audit Logs
  AUDIT_LOGS_VIEW: "audit_logs.view",

  // Domain Events
  DOMAIN_EVENTS_VIEW: "domainEvents.view",

  // Student Timeline
  STUDENT_TIMELINE_VIEW: "studentTimeline.view",
  STUDENT_TIMELINE_CREATE_NOTE: "studentTimeline.createNote",
  STUDENT_TIMELINE_DELETE_NOTE: "studentTimeline.deleteNote",

  // Student Documents
  STUDENT_DOCUMENTS_VIEW: "studentDocuments.view",
  STUDENT_DOCUMENTS_UPLOAD: "studentDocuments.upload",
  STUDENT_DOCUMENTS_DELETE: "studentDocuments.delete",
  STUDENT_DOCUMENTS_VERIFY: "studentDocuments.verify",

  // Teacher 360
  TEACHERS_VIEW_360: "teachers.view360",
  TEACHERS_VIEW_OWN_360: "teachers.viewOwn360",
  TEACHERS_VIEW_SCHEDULE: "teachers.viewSchedule",
  TEACHERS_VIEW_PERFORMANCE: "teachers.viewPerformance",

  // Teacher Documents
  TEACHER_DOCUMENTS_VIEW: "teacherDocuments.view",
  TEACHER_DOCUMENTS_UPLOAD: "teacherDocuments.upload",
  TEACHER_DOCUMENTS_DELETE: "teacherDocuments.delete",

  // Teacher Portal — operational workspace for the logged-in teacher (distinct from Teacher 360, the profile)
  TEACHER_PORTAL_VIEW: "teacherPortal.view",

  // Student Portal — self-service workspace for the logged-in student (distinct from Student 360, the administrative view)
  STUDENT_PORTAL_VIEW: "studentPortal.view",

  // Assessment Policies
  ASSESSMENT_POLICIES_VIEW: "assessmentPolicies.view",
  ASSESSMENT_POLICIES_CREATE: "assessmentPolicies.create",
  ASSESSMENT_POLICIES_UPDATE: "assessmentPolicies.update",
  ASSESSMENT_POLICIES_ARCHIVE: "assessmentPolicies.archive",

  // Assessment Components
  ASSESSMENT_COMPONENTS_MANAGE: "assessmentComponents.manage",

  // Assessment Periods
  ASSESSMENT_PERIODS_VIEW: "assessmentPeriods.view",
  ASSESSMENT_PERIODS_CREATE: "assessmentPeriods.create",
  ASSESSMENT_PERIODS_UPDATE: "assessmentPeriods.update",
  ASSESSMENT_PERIODS_ARCHIVE: "assessmentPeriods.archive",

  // Assessments
  ASSESSMENTS_VIEW: "assessments.view",
  ASSESSMENTS_CREATE: "assessments.create",
  ASSESSMENTS_UPDATE: "assessments.update",
  ASSESSMENTS_CANCEL: "assessments.cancel",
  ASSESSMENTS_LOCK: "assessments.lock",
  ASSESSMENTS_REOPEN: "assessments.reopen",

  // Assessment Results
  ASSESSMENT_RESULTS_VIEW: "assessmentResults.view",
  ASSESSMENT_RESULTS_GRADE: "assessmentResults.grade",
  ASSESSMENT_RESULTS_UPDATE: "assessmentResults.update",
  ASSESSMENT_RESULTS_INVALIDATE: "assessmentResults.invalidate",

  // Assessment Publications
  ASSESSMENT_PUBLICATIONS_PUBLISH: "assessmentPublications.publish",

  // Student Subject Progress
  STUDENT_SUBJECT_PROGRESS_VIEW: "studentSubjectProgress.view",

  // Grade Engine — Assessment Policies (subject-level)
  GRADE_POLICIES_VIEW: "gradePolicies.view",
  GRADE_POLICIES_CREATE: "gradePolicies.create",
  GRADE_POLICIES_UPDATE: "gradePolicies.update",
  GRADE_POLICIES_ARCHIVE: "gradePolicies.archive",

  // Grade Engine — Components
  GRADE_COMPONENTS_VIEW: "gradeComponents.view",
  GRADE_COMPONENTS_CREATE: "gradeComponents.create",
  GRADE_COMPONENTS_UPDATE: "gradeComponents.update",
  GRADE_COMPONENTS_DELETE: "gradeComponents.delete",

  // Grade Engine — Student Grades
  GRADES_VIEW: "grades.view",
  GRADES_CREATE: "grades.create",
  GRADES_UPDATE: "grades.update",
  GRADES_CANCEL: "grades.cancel",
  GRADES_CALCULATE: "grades.calculate",

  // Grade Engine — Student Progress
  STUDENT_PROGRESS_CALCULATE: "studentProgress.calculate",

  // Academic Progress & Transcripts
  TRANSCRIPTS_VIEW: "transcripts.view",

  // Prerequisites & Eligibility
  PREREQUISITES_MANAGE: "prerequisites.manage",
  PREREQUISITES_VIEW: "prerequisites.view",
  PREREQUISITES_WAIVERS_MANAGE: "prerequisites.waivers.manage",

  // Level Progression
  LEVEL_PROGRESSION_MANAGE: "levelProgression.manage",
  LEVEL_PROGRESSION_VIEW: "levelProgression.view",

  // Student Progress (level & course)
  STUDENT_LEVEL_PROGRESS_VIEW: "studentLevelProgress.view",
  STUDENT_COURSE_PROGRESS_VIEW: "studentCourseProgress.view",

  // Dashboard
  DASHBOARD_VIEW: "dashboard.view",

  // Financial Integrity
  INTEGRITY_CHECKS_RUN:    "integrity.checks.run",
  INTEGRITY_ISSUES_VIEW:   "integrity.issues.view",
  INTEGRITY_ISSUES_RESOLVE: "integrity.issues.resolve",

  // Financial Reports
  FINANCIAL_REPORTS_VIEW:             "financialReports.view",
  FINANCIAL_REPORTS_EXPORT:           "financialReports.export",
  FINANCIAL_REPORTS_STUDENT_STATEMENT: "financialReports.studentStatement.view",
  FINANCIAL_REPORTS_INTEGRITY:        "financialReports.integrity.view",
  FINANCIAL_REPORTS_RECONCILIATION:   "financialReports.reconciliation.view",
  FINANCIAL_REPORTS_CLOSING_VIEW:     "financialReports.closing.view",

  // Notifications
  NOTIFICATIONS_VIEW_OWN: "notifications.viewOwn",
  NOTIFICATIONS_MARK_READ: "notifications.markRead",
  NOTIFICATIONS_ARCHIVE_OWN: "notifications.archiveOwn",
  NOTIFICATIONS_VIEW_ALL: "notifications.viewAll",
  NOTIFICATIONS_MANAGE_TEMPLATES: "notifications.manageTemplates",
  NOTIFICATIONS_MANAGE_RULES: "notifications.manageRules",

  // Notifications — Phase 3.1 Delivery Infrastructure
  NOTIFICATIONS_VIEW_DELIVERIES: "notifications.viewDeliveries",
  NOTIFICATIONS_RETRY_DELIVERY: "notifications.retryDelivery",
  NOTIFICATIONS_CANCEL_DELIVERY: "notifications.cancelDelivery",

  // Notifications — Phase 3.2B Email Settings
  NOTIFICATIONS_MANAGE_EMAIL_SETTINGS: "notifications.manageEmailSettings",

  // Notifications — Phase 3.3 Operations Dashboard
  NOTIFICATIONS_VIEW_OPERATIONS: "notifications.viewOperations",
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
    PERMISSIONS.GRADE_POLICIES_VIEW,
    PERMISSIONS.GRADE_COMPONENTS_VIEW,
    PERMISSIONS.GRADES_VIEW,
    PERMISSIONS.ASSESSMENT_POLICIES_VIEW,
    PERMISSIONS.ASSESSMENT_PERIODS_VIEW,
    PERMISSIONS.ASSESSMENTS_VIEW,
    PERMISSIONS.ASSESSMENT_RESULTS_VIEW,
    PERMISSIONS.STUDENT_SUBJECT_PROGRESS_VIEW,
    PERMISSIONS.TRANSCRIPTS_VIEW,
    PERMISSIONS.STUDENT_TIMELINE_VIEW,
    PERMISSIONS.STUDENT_TIMELINE_CREATE_NOTE,
    PERMISSIONS.CLASSROOMS_VIEW,
    PERMISSIONS.CLASSROOM_RESOURCES_VIEW,
    PERMISSIONS.CLASSROOM_MAINTENANCE_VIEW,
    PERMISSIONS.CLASSROOM_BOOKINGS_VIEW,
    PERMISSIONS.CLASSROOM_BOOKINGS_CREATE,
    PERMISSIONS.CLASSROOM_BOOKINGS_UPDATE,
    PERMISSIONS.CLASSROOM_BOOKINGS_CANCEL,
    PERMISSIONS.LESSONS_VIEW,
    PERMISSIONS.SUBJECT_LESSONS_VIEW,
    PERMISSIONS.LESSON_ATTACHMENTS_VIEW,
    PERMISSIONS.STUDENTS_CREATE,
    PERMISSIONS.STUDENTS_READ,
    PERMISSIONS.STUDENTS_UPDATE,
    PERMISSIONS.STUDENTS_SUSPEND,
    PERMISSIONS.STUDENTS_IMPORT,
    PERMISSIONS.IMPORT_JOBS_VIEW,
    PERMISSIONS.STUDENT_DOCUMENTS_VIEW,
    PERMISSIONS.STUDENT_DOCUMENTS_UPLOAD,
    PERMISSIONS.STUDENT_DOCUMENTS_VERIFY,
    PERMISSIONS.TEACHERS_CREATE,
    PERMISSIONS.TEACHERS_READ,
    PERMISSIONS.TEACHERS_UPDATE,
    PERMISSIONS.TEACHERS_SUSPEND,
    PERMISSIONS.TEACHERS_IMPORT,
    PERMISSIONS.TEACHERS_VIEW_360,
    PERMISSIONS.TEACHERS_VIEW_SCHEDULE,
    PERMISSIONS.TEACHERS_VIEW_PERFORMANCE,
    PERMISSIONS.TEACHER_DOCUMENTS_VIEW,
    PERMISSIONS.TEACHER_DOCUMENTS_UPLOAD,
    PERMISSIONS.COURSES_CREATE,
    PERMISSIONS.COURSES_READ,
    PERMISSIONS.COURSES_UPDATE,
    PERMISSIONS.COURSES_ARCHIVE,
    PERMISSIONS.COURSE_LEVELS_VIEW,
    PERMISSIONS.SUBJECTS_VIEW,
    PERMISSIONS.LEVEL_SUBJECTS_VIEW,
    PERMISSIONS.COURSE_CATEGORIES_VIEW,
    PERMISSIONS.CLASS_GROUPS_READ,
    PERMISSIONS.CLASS_GROUPS_CREATE,
    PERMISSIONS.CLASS_GROUPS_UPDATE,
    PERMISSIONS.SCHEDULE_PERIODS_VIEW,
    PERMISSIONS.SCHEDULE_SLOTS_VIEW,
    PERMISSIONS.CLASS_GROUP_SCHEDULES_VIEW,
    PERMISSIONS.CLASS_GROUP_SCHEDULES_ASSIGN,
    PERMISSIONS.CLASS_GROUP_SCHEDULES_REMOVE,
    PERMISSIONS.ENROLLMENTS_VIEW,
    PERMISSIONS.ENROLLMENTS_CREATE,
    PERMISSIONS.ENROLLMENTS_UPDATE,
    PERMISSIONS.ENROLLMENTS_ACTIVATE,
    PERMISSIONS.ATTENDANCE_SESSIONS_VIEW,
    PERMISSIONS.ATTENDANCE_SESSIONS_CREATE,
    PERMISSIONS.ATTENDANCE_SESSIONS_UPDATE,
    PERMISSIONS.ATTENDANCE_SESSIONS_CANCEL,
    PERMISSIONS.ATTENDANCE_SESSIONS_COMPLETE,
    PERMISSIONS.ATTENDANCE_RECORDS_VIEW,
    PERMISSIONS.ATTENDANCE_RECORDS_MARK,
    PERMISSIONS.ATTENDANCE_RECORDS_UPDATE,
    PERMISSIONS.ATTENDANCE_JUSTIFICATIONS_VIEW,
    PERMISSIONS.ATTENDANCE_JUSTIFICATIONS_CREATE,
    PERMISSIONS.ATTENDANCE_JUSTIFICATIONS_APPROVE,
    PERMISSIONS.ATTENDANCE_JUSTIFICATIONS_REJECT,
    PERMISSIONS.INVOICES_VIEW,
    PERMISSIONS.INVOICES_CREATE,
    PERMISSIONS.INVOICES_UPDATE,
    PERMISSIONS.INVOICES_CANCEL,
    PERMISSIONS.PAYMENTS_VIEW,
    PERMISSIONS.PAYMENTS_CREATE,
    PERMISSIONS.PAYMENTS_CANCEL,
    PERMISSIONS.RECEIPTS_VIEW,
    PERMISSIONS.RECEIPTS_ISSUE,
    PERMISSIONS.REFUNDS_VIEW,
    PERMISSIONS.REFUNDS_CREATE,
    PERMISSIONS.PAYMENT_PLANS_VIEW,
    PERMISSIONS.PAYMENT_PLANS_CREATE,
    PERMISSIONS.WALLETS_VIEW,
    PERMISSIONS.WALLET_TRANSACTIONS_VIEW,
    PERMISSIONS.WALLET_TRANSACTIONS_DEPOSIT,
    PERMISSIONS.WALLET_TRANSACTIONS_APPLY_CREDIT,
    PERMISSIONS.REPORTS_VIEW,
    PERMISSIONS.FINANCIAL_REPORTS_VIEW,
    PERMISSIONS.FINANCIAL_REPORTS_EXPORT,
    PERMISSIONS.FINANCIAL_REPORTS_STUDENT_STATEMENT,
    PERMISSIONS.VEHICLES_READ,
    PERMISSIONS.PRACTICAL_LESSONS_CREATE,
    PERMISSIONS.PRACTICAL_LESSONS_READ,
    PERMISSIONS.PRACTICAL_LESSONS_UPDATE,
    PERMISSIONS.PRACTICAL_LESSONS_CANCEL,
    PERMISSIONS.FEE_DEFINITIONS_VIEW,
    PERMISSIONS.BILLING_POLICIES_VIEW,
    PERMISSIONS.DISCOUNT_RULES_VIEW,
    PERMISSIONS.TAX_RULES_VIEW,
    PERMISSIONS.ACADEMIC_CALENDAR_VIEW,
    PERMISSIONS.ACADEMIC_YEARS_CREATE,
    PERMISSIONS.ACADEMIC_YEARS_UPDATE,
    PERMISSIONS.ACADEMIC_TERMS_CREATE,
    PERMISSIONS.ACADEMIC_TERMS_UPDATE,
    PERMISSIONS.ACADEMIC_HOLIDAYS_CREATE,
    PERMISSIONS.ACADEMIC_HOLIDAYS_UPDATE,
    PERMISSIONS.ACADEMIC_EVENTS_CREATE,
    PERMISSIONS.ACADEMIC_EVENTS_UPDATE,
    PERMISSIONS.PREREQUISITES_MANAGE,
    PERMISSIONS.PREREQUISITES_VIEW,
    PERMISSIONS.PREREQUISITES_WAIVERS_MANAGE,
    PERMISSIONS.LEVEL_PROGRESSION_MANAGE,
    PERMISSIONS.LEVEL_PROGRESSION_VIEW,
    PERMISSIONS.STUDENT_LEVEL_PROGRESS_VIEW,
    PERMISSIONS.STUDENT_COURSE_PROGRESS_VIEW,
    PERMISSIONS.NOTIFICATIONS_VIEW_OWN,
    PERMISSIONS.NOTIFICATIONS_MARK_READ,
    PERMISSIONS.NOTIFICATIONS_ARCHIVE_OWN,
    PERMISSIONS.NOTIFICATIONS_VIEW_DELIVERIES,
  ],

  TEACHER: [
    PERMISSIONS.GRADE_POLICIES_VIEW,
    PERMISSIONS.GRADE_COMPONENTS_VIEW,
    PERMISSIONS.GRADES_VIEW,
    PERMISSIONS.GRADES_CREATE,
    PERMISSIONS.GRADES_UPDATE,
    PERMISSIONS.GRADES_CALCULATE,
    PERMISSIONS.STUDENT_PROGRESS_CALCULATE,
    PERMISSIONS.ASSESSMENT_POLICIES_VIEW,
    PERMISSIONS.ASSESSMENT_PERIODS_VIEW,
    PERMISSIONS.ASSESSMENTS_VIEW,
    PERMISSIONS.ASSESSMENTS_CREATE,
    PERMISSIONS.ASSESSMENTS_UPDATE,
    PERMISSIONS.ASSESSMENT_RESULTS_VIEW,
    PERMISSIONS.ASSESSMENT_RESULTS_GRADE,
    PERMISSIONS.ASSESSMENT_PUBLICATIONS_PUBLISH,
    PERMISSIONS.STUDENT_SUBJECT_PROGRESS_VIEW,
    PERMISSIONS.STUDENT_TIMELINE_VIEW,
    PERMISSIONS.STUDENT_TIMELINE_CREATE_NOTE,
    PERMISSIONS.CLASSROOMS_VIEW,
    PERMISSIONS.CLASSROOM_BOOKINGS_VIEW,
    PERMISSIONS.LESSONS_VIEW,
    PERMISSIONS.LESSONS_CREATE,
    PERMISSIONS.LESSONS_UPDATE,
    PERMISSIONS.LESSON_ATTACHMENTS_VIEW,
    PERMISSIONS.LESSON_ATTACHMENTS_CREATE,
    PERMISSIONS.LESSON_ATTACHMENTS_DELETE,
    PERMISSIONS.SUBJECTS_VIEW,
    PERMISSIONS.SUBJECT_LESSONS_VIEW,
    PERMISSIONS.SUBJECT_LESSONS_ASSIGN,
    PERMISSIONS.SUBJECT_LESSONS_UPDATE,
    PERMISSIONS.STUDENTS_READ,
    PERMISSIONS.COURSES_READ,
    PERMISSIONS.CLASS_GROUPS_READ,
    PERMISSIONS.SCHEDULE_PERIODS_VIEW,
    PERMISSIONS.SCHEDULE_SLOTS_VIEW,
    PERMISSIONS.CLASS_GROUP_SCHEDULES_VIEW,
    PERMISSIONS.ENROLLMENTS_VIEW,
    PERMISSIONS.ATTENDANCE_SESSIONS_VIEW,
    PERMISSIONS.ATTENDANCE_SESSIONS_CREATE,
    PERMISSIONS.ATTENDANCE_SESSIONS_COMPLETE,
    PERMISSIONS.ATTENDANCE_SESSIONS_CANCEL,
    PERMISSIONS.ATTENDANCE_RECORDS_VIEW,
    PERMISSIONS.ATTENDANCE_RECORDS_MARK,
    PERMISSIONS.ATTENDANCE_JUSTIFICATIONS_VIEW,
    PERMISSIONS.ATTENDANCE_JUSTIFICATIONS_CREATE,
    PERMISSIONS.PRACTICAL_LESSONS_CREATE,
    PERMISSIONS.PRACTICAL_LESSONS_READ,
    PERMISSIONS.PRACTICAL_LESSONS_UPDATE,
    PERMISSIONS.VEHICLES_READ,
    PERMISSIONS.ACADEMIC_CALENDAR_VIEW,
    PERMISSIONS.PREREQUISITES_VIEW,
    PERMISSIONS.LEVEL_PROGRESSION_VIEW,
    PERMISSIONS.STUDENT_LEVEL_PROGRESS_VIEW,
    PERMISSIONS.STUDENT_COURSE_PROGRESS_VIEW,
    PERMISSIONS.NOTIFICATIONS_VIEW_OWN,
    PERMISSIONS.NOTIFICATIONS_MARK_READ,
    PERMISSIONS.NOTIFICATIONS_ARCHIVE_OWN,
    PERMISSIONS.TEACHERS_VIEW_OWN_360,
    PERMISSIONS.TEACHERS_VIEW_SCHEDULE,
    PERMISSIONS.TEACHERS_VIEW_PERFORMANCE,
    PERMISSIONS.TEACHER_DOCUMENTS_VIEW,
    PERMISSIONS.TEACHER_PORTAL_VIEW,
  ],

  STUDENT: [
    PERMISSIONS.STUDENT_PORTAL_VIEW,
    PERMISSIONS.GRADES_VIEW,
    PERMISSIONS.ASSESSMENT_RESULTS_VIEW,
    PERMISSIONS.STUDENT_SUBJECT_PROGRESS_VIEW,
    PERMISSIONS.TRANSCRIPTS_VIEW,
    PERMISSIONS.CLASSROOM_BOOKINGS_VIEW,
    PERMISSIONS.LESSONS_VIEW,
    PERMISSIONS.LESSON_PROGRESS_VIEW,
    PERMISSIONS.LESSON_PROGRESS_UPDATE,
    PERMISSIONS.ENROLLMENTS_VIEW,
    PERMISSIONS.ATTENDANCE_SESSIONS_VIEW,
    PERMISSIONS.ATTENDANCE_RECORDS_VIEW,
    PERMISSIONS.ATTENDANCE_JUSTIFICATIONS_VIEW,
    PERMISSIONS.ATTENDANCE_JUSTIFICATIONS_CREATE,
    PERMISSIONS.INVOICES_VIEW,
    PERMISSIONS.PAYMENTS_VIEW,
    PERMISSIONS.RECEIPTS_VIEW,
    PERMISSIONS.PRACTICAL_LESSONS_READ,
    PERMISSIONS.ACADEMIC_CALENDAR_VIEW,
    PERMISSIONS.STUDENT_LEVEL_PROGRESS_VIEW,
    PERMISSIONS.STUDENT_COURSE_PROGRESS_VIEW,
    PERMISSIONS.NOTIFICATIONS_VIEW_OWN,
    PERMISSIONS.NOTIFICATIONS_MARK_READ,
    PERMISSIONS.NOTIFICATIONS_ARCHIVE_OWN,
  ],
};
