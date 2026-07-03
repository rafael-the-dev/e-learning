-- =============================================================================
-- Attendance Engine — Phase 2b (PLANNED, NOT YET APPLIED): enrollmentId NOT NULL
--
-- ⚠️  This file lives under prisma/planned-migrations/ ON PURPOSE. It is NOT a
--     live Prisma migration and `prisma migrate deploy` will NOT run it. Promote
--     it to a real, dated folder under prisma/migrations/ ONLY after the backfill
--     data-quality report shows ZERO nullable rows for every organization:
--
--         pnpm db:backfill-attendance-enrollment-id            # dry-run report
--         pnpm db:backfill-attendance-enrollment-id -- --apply # fill unambiguous
--         # repeat until: needing backfill = 0, ambiguous = 0, unresolved = 0
--
-- Behaviour-neutral: this only tightens a constraint + adds the FK relation.
-- It does NOT write attendancePercentage, touch summaries, or activate INCOMPLETE.
--
-- Prisma schema change to ship WITH this migration (so the client matches the DB):
--   model AttendanceRecord {
--     enrollmentId String            // was String?  (drop the `?`)
--     enrollment   Enrollment @relation(fields: [enrollmentId], references: [id], onDelete: NoAction, onUpdate: NoAction)
--   }
--   model Enrollment { attendanceRecords AttendanceRecord[] }   // back-relation
--
-- The Phase-1 index attendance_records_organizationId_enrollmentId_idx already
-- exists and is kept.
-- =============================================================================

BEGIN TRY

BEGIN TRAN;

-- ── Safety guard ─────────────────────────────────────────────────────────────
-- Abort the whole migration if ANY attendance_records row (INCLUDING soft-deleted
-- ones — the NOT NULL constraint applies to every physical row) still has a NULL
-- enrollmentId. This makes an accidental early run fail loudly instead of erroring
-- half-way through the ALTER.
IF EXISTS (SELECT 1 FROM [dbo].[attendance_records] WHERE [enrollmentId] IS NULL)
BEGIN
    THROW 50000,
      'Aborting: attendance_records still has NULL enrollmentId rows. Run the Phase 2 backfill (including any soft-deleted rows) until zero remain before enforcing NOT NULL.',
      1;
END

-- ── Enforce NOT NULL ─────────────────────────────────────────────────────────
-- Column type matches Prisma's String mapping for SQL Server (NVARCHAR(1000)).
ALTER TABLE [dbo].[attendance_records] ALTER COLUMN [enrollmentId] NVARCHAR(1000) NOT NULL;

-- ── Add the foreign key to enrollments ───────────────────────────────────────
-- NO ACTION on both sides: SQL Server forbids multiple cascade paths, and every
-- other FK in this schema follows the same rule.
ALTER TABLE [dbo].[attendance_records]
    ADD CONSTRAINT [attendance_records_enrollmentId_fkey]
    FOREIGN KEY ([enrollmentId]) REFERENCES [dbo].[enrollments]([id])
    ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0 ROLLBACK TRAN;
THROW

END CATCH

-- =============================================================================
-- ROLLBACK (if ever needed, before dependent code relies on non-null):
--   ALTER TABLE [dbo].[attendance_records] DROP CONSTRAINT [attendance_records_enrollmentId_fkey];
--   ALTER TABLE [dbo].[attendance_records] ALTER COLUMN [enrollmentId] NVARCHAR(1000) NULL;
--   -- and revert the Prisma schema (enrollmentId String? , drop the relation).
-- =============================================================================
