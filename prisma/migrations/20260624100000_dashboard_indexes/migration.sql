BEGIN TRY

BEGIN TRAN;

-- =============================================================================
-- EXECUTIVE DASHBOARD INDEXES
-- Composite indexes matching the WHERE / GROUP BY / ORDER BY patterns used by
-- the Executive Dashboard's health score, KPI grid, and academic watchlist.
-- IF NOT EXISTS guards keep this migration safe to re-run.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- STUDENT LEVEL PROGRESS
-- BLOCKED / RECOVERY_REQUIRED / ELIGIBLE_TO_PROGRESS counts and watchlist rows
-- filter by status alone (no studentId/courseLevelId), which the existing
-- (organizationId, studentId) and (organizationId, courseLevelId) indexes
-- don't serve well.
-- -----------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'student_level_progress_org_status_idx' AND object_id = OBJECT_ID('student_level_progress'))
  CREATE NONCLUSTERED INDEX [student_level_progress_org_status_idx]
    ON [dbo].[student_level_progress] ([organizationId], [status]);

-- -----------------------------------------------------------------------------
-- STUDENT COURSE PROGRESS
-- RECOVERY_REQUIRED count/watchlist — same status-only filter gap.
-- -----------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'student_course_progress_org_status_idx' AND object_id = OBJECT_ID('student_course_progress'))
  CREATE NONCLUSTERED INDEX [student_course_progress_org_status_idx]
    ON [dbo].[student_course_progress] ([organizationId], [status]);

-- -----------------------------------------------------------------------------
-- STUDENT SUBJECT PROGRESS
-- Low-attendance counts/watchlist filter by attendancePercentage threshold;
-- approval-rate quick stat groups by status. Both org-scoped, neither served
-- by the existing (organizationId, studentId) / (organizationId, levelSubjectId)
-- indexes.
-- -----------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'student_subject_progress_org_attendance_idx' AND object_id = OBJECT_ID('student_subject_progress'))
  CREATE NONCLUSTERED INDEX [student_subject_progress_org_attendance_idx]
    ON [dbo].[student_subject_progress] ([organizationId], [attendancePercentage]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'student_subject_progress_org_status_idx' AND object_id = OBJECT_ID('student_subject_progress'))
  CREATE NONCLUSTERED INDEX [student_subject_progress_org_status_idx]
    ON [dbo].[student_subject_progress] ([organizationId], [status]);

-- -----------------------------------------------------------------------------
-- STUDENT TIMELINE EVENTS
-- Activity Feed reads org-wide (no studentId filter), ordered by occurredAt —
-- the existing indexes all lead with (organizationId, studentId).
-- -----------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'student_timeline_events_org_occurredat_idx' AND object_id = OBJECT_ID('student_timeline_events'))
  CREATE NONCLUSTERED INDEX [student_timeline_events_org_occurredat_idx]
    ON [dbo].[student_timeline_events] ([organizationId], [occurredAt]);

-- -----------------------------------------------------------------------------
-- ATTENDANCE SESSIONS
-- Attendance trend tab groups COMPLETED sessions by sessionDate, org-wide —
-- the existing (organizationId, classGroupId, sessionDate) index doesn't
-- help without a classGroupId filter.
-- -----------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'attendance_sessions_org_status_sessiondate_idx' AND object_id = OBJECT_ID('attendance_sessions'))
  CREATE NONCLUSTERED INDEX [attendance_sessions_org_status_sessiondate_idx]
    ON [dbo].[attendance_sessions] ([organizationId], [status], [sessionDate]);

-- -----------------------------------------------------------------------------
-- ASSESSMENT RESULTS
-- Assessments trend tab groups GRADED results by gradedAt, org-wide.
-- -----------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'assessment_results_org_status_gradedat_idx' AND object_id = OBJECT_ID('assessment_results'))
  CREATE NONCLUSTERED INDEX [assessment_results_org_status_gradedat_idx]
    ON [dbo].[assessment_results] ([organizationId], [status], [gradedAt]);

-- -----------------------------------------------------------------------------
-- ENROLLMENTS
-- Enrollments trend tab groups by enrollmentDate, org-wide.
-- -----------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'enrollments_org_enrollmentdate_idx' AND object_id = OBJECT_ID('enrollments'))
  CREATE NONCLUSTERED INDEX [enrollments_org_enrollmentdate_idx]
    ON [dbo].[enrollments] ([organizationId], [enrollmentDate]);

-- -----------------------------------------------------------------------------
-- REFUND / INVOICE / COURSE
-- Covered by existing indexes (refunds_org_status_createdat_idx,
-- refunds_org_status_completedat_idx, invoices status indexes).
-- -----------------------------------------------------------------------------

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
