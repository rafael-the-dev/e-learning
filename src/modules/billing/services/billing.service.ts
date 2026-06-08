import {
  findFeeDefinitionsByOrganization,
  countFeeDefinitionsByStatus,
  type ListFeeDefinitionsParams,
} from "@/modules/billing/repositories/fee-definition.repository";
import {
  findBillingPoliciesByOrganization,
  countBillingPoliciesByStatus,
  type ListBillingPoliciesParams,
} from "@/modules/billing/repositories/billing-policy.repository";
import {
  findDiscountRulesByOrganization,
  countDiscountRulesByStatus,
  type ListDiscountRulesParams,
} from "@/modules/billing/repositories/discount-rule.repository";
import {
  findTaxRulesByOrganization,
  countTaxRulesByStatus,
  type ListTaxRulesParams,
} from "@/modules/billing/repositories/tax-rule.repository";
import type { PaginatedResult } from "@/shared/types/common";
import type { FeeDefinition, EnrollmentBillingPolicy, DiscountRule, TaxRule } from "@/modules/billing/types";

export async function getFeeDefinitions(
  organizationId: string,
  params: ListFeeDefinitionsParams
): Promise<PaginatedResult<FeeDefinition>> {
  return findFeeDefinitionsByOrganization(organizationId, params);
}

export async function getFeeDefinitionStats(organizationId: string): Promise<Record<string, number>> {
  return countFeeDefinitionsByStatus(organizationId);
}

export async function getBillingPolicies(
  organizationId: string,
  params: ListBillingPoliciesParams
): Promise<PaginatedResult<EnrollmentBillingPolicy>> {
  return findBillingPoliciesByOrganization(organizationId, params);
}

export async function getBillingPolicyStats(organizationId: string): Promise<Record<string, number>> {
  return countBillingPoliciesByStatus(organizationId);
}

export async function getDiscountRules(
  organizationId: string,
  params: ListDiscountRulesParams
): Promise<PaginatedResult<DiscountRule>> {
  return findDiscountRulesByOrganization(organizationId, params);
}

export async function getDiscountRuleStats(organizationId: string): Promise<Record<string, number>> {
  return countDiscountRulesByStatus(organizationId);
}

export async function getTaxRules(
  organizationId: string,
  params: ListTaxRulesParams
): Promise<PaginatedResult<TaxRule>> {
  return findTaxRulesByOrganization(organizationId, params);
}

export async function getTaxRuleStats(organizationId: string): Promise<Record<string, number>> {
  return countTaxRulesByStatus(organizationId);
}
