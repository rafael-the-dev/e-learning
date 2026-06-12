BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[level_progression_policies] DROP CONSTRAINT [level_progression_policies_maxFailed_df],
[level_progression_policies_maxPending_df],
[level_progression_policies_requireFinancial_df],
[level_progression_policies_requireManual_df];
ALTER TABLE [dbo].[level_progression_policies] ADD CONSTRAINT [level_progression_policies_maxFailedRequiredSubjects_df] DEFAULT 0 FOR [maxFailedRequiredSubjects], CONSTRAINT [level_progression_policies_maxPendingSubjects_df] DEFAULT 0 FOR [maxPendingSubjects], CONSTRAINT [level_progression_policies_requireFinancialClearance_df] DEFAULT 0 FOR [requireFinancialClearance], CONSTRAINT [level_progression_policies_requireManualApproval_df] DEFAULT 0 FOR [requireManualApproval];

-- RenameIndex
EXEC SP_RENAME N'dbo.level_subject_prerequisite_groups.level_subject_prerequisite_groups_orgId_levelSubjectId_status_idx', N'level_subject_prerequisite_groups_organizationId_levelSubjectId_status_idx', N'INDEX';

-- RenameIndex
EXEC SP_RENAME N'dbo.level_subject_prerequisite_items.level_subject_prerequisite_items_organizationId_groupId_idx', N'level_subject_prerequisite_items_organizationId_prerequisiteGroupId_idx', N'INDEX';

-- RenameIndex
EXEC SP_RENAME N'dbo.level_subject_prerequisite_items.level_subject_prerequisite_items_organizationId_prereqId_idx', N'level_subject_prerequisite_items_organizationId_prerequisiteLevelSubjectId_idx', N'INDEX';

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
