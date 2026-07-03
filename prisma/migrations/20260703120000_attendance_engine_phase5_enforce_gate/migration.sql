-- Attendance Engine — Phase 5: Gated Academic Wiring
--
-- Adds the OPT-IN enforcement flag to AttendancePolicy. Behaviour-neutral by
-- default: the column defaults to 0 (false), so no existing policy enables
-- attendance gating and no academic outcome changes on deploy.
--
-- When set true (per policy, deliberately), the policy's subjects feed
-- StudentSubjectAttendanceSummary.attendancePercentage into the grade cascade and
-- low attendance can produce the (already-existing, dormant) INCOMPLETE status.
-- The THRESHOLD stays on LevelSubject.minimumAttendancePercentage — this flag only
-- enables enforcement.

BEGIN TRY

BEGIN TRAN;

ALTER TABLE [dbo].[attendance_policies]
    ADD [enforceAttendanceForProgress] BIT NOT NULL
    CONSTRAINT [attendance_policies_enforceAttendanceForProgress_df] DEFAULT 0;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0 ROLLBACK TRAN;
THROW

END CATCH
