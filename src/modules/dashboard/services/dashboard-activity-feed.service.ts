import { findOrgActivityFeed } from "@/modules/dashboard/repositories/dashboard-activity-feed.repository";
import type { ActivityFeedItem } from "@/modules/dashboard/types";

export async function getActivityFeed(organizationId: string): Promise<ActivityFeedItem[]> {
  return findOrgActivityFeed(organizationId);
}
