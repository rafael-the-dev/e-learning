import type { OrganizationStatus, SubscriptionPlan, BranchStatus } from "@/shared/types/common";

export interface OrganizationDto {
  id: string;
  name: string;
  slug: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  logoUrl: string | null;
  status: OrganizationStatus;
  plan: SubscriptionPlan;
  timezone: string;
  locale: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateOrganizationInput {
  name: string;
  slug: string;
  email?: string;
  phone?: string;
  address?: string;
  timezone?: string;
  locale?: string;
  ownerUserId: string;
}

export interface UpdateOrganizationInput {
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
  logoUrl?: string;
  timezone?: string;
  locale?: string;
}

export interface BranchDto {
  id: string;
  organizationId: string;
  name: string;
  code: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  isDefault: boolean;
  status: BranchStatus;
  createdAt: Date;
}

export interface CreateBranchInput {
  organizationId: string;
  name: string;
  code?: string;
  address?: string;
  phone?: string;
  email?: string;
  isDefault?: boolean;
}
