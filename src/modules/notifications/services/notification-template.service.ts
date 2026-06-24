import {
  createTemplate as createTemplateRow,
  updateTemplate as updateTemplateRow,
  findTemplateById,
  findManyTemplates,
  setTemplateActive,
  deactivateSiblingTemplates,
} from "@/modules/notifications/repositories/notification-template.repository";
import { getEventCatalogEntry } from "@/modules/notifications/catalog/notification-event-catalog";
import { validateTemplateVariables, renderTemplate } from "@/modules/notifications/services/notification-template-renderer";
import { ValidationError, NotFoundError } from "@/shared/lib/command";
import type {
  NotificationTemplate,
  NotificationTemplateFilters,
  CreateNotificationTemplateInput,
  UpdateNotificationTemplateInput,
} from "@/modules/notifications/types";

/** Throws ValidationError when the event type is unknown or the template uses a variable the catalog doesn't allow for it. */
export function assertTemplateVariablesAllowed(
  eventType: string,
  titleTemplate: string,
  bodyTemplate: string
): void {
  const catalogEntry = getEventCatalogEntry(eventType);
  if (!catalogEntry) {
    throw new ValidationError("Dados inválidos", { eventType: ["Tipo de evento desconhecido"] });
  }

  const titleCheck = validateTemplateVariables(titleTemplate, catalogEntry.variables);
  const bodyCheck = validateTemplateVariables(bodyTemplate, catalogEntry.variables);
  const unknownVariables = [...new Set([...titleCheck.unknownVariables, ...bodyCheck.unknownVariables])];

  if (unknownVariables.length > 0) {
    throw new ValidationError("Dados inválidos", {
      bodyTemplate: [`Variáveis não permitidas para este evento: ${unknownVariables.join(", ")}`],
    });
  }
}

export async function listTemplates(
  organizationId: string,
  filters: NotificationTemplateFilters
): Promise<{ data: NotificationTemplate[]; total: number }> {
  return findManyTemplates(organizationId, filters);
}

export async function getTemplate(organizationId: string, id: string): Promise<NotificationTemplate> {
  const template = await findTemplateById(id, organizationId);
  if (!template) throw new NotFoundError("NotificationTemplate", id);
  return template;
}

export async function createTemplate(
  organizationId: string,
  input: CreateNotificationTemplateInput
): Promise<NotificationTemplate> {
  assertTemplateVariablesAllowed(input.eventType, input.titleTemplate, input.bodyTemplate);
  return createTemplateRow(organizationId, input);
}

export async function updateTemplate(
  organizationId: string,
  id: string,
  input: UpdateNotificationTemplateInput
): Promise<NotificationTemplate> {
  const existing = await getTemplate(organizationId, id);

  const titleTemplate = input.titleTemplate ?? existing.titleTemplate;
  const bodyTemplate = input.bodyTemplate ?? existing.bodyTemplate;
  assertTemplateVariablesAllowed(existing.eventType, titleTemplate, bodyTemplate);

  return updateTemplateRow(id, organizationId, input);
}

export async function activateTemplate(organizationId: string, id: string): Promise<NotificationTemplate> {
  const template = await getTemplate(organizationId, id);
  const activated = await setTemplateActive(id, organizationId, true);
  await deactivateSiblingTemplates(organizationId, template.eventType, template.channel, template.language, id);
  return activated;
}

export async function deactivateTemplate(organizationId: string, id: string): Promise<NotificationTemplate> {
  await getTemplate(organizationId, id);
  return setTemplateActive(id, organizationId, false);
}

export interface TemplatePreview {
  title: string;
  body: string;
  missingVariables: string[];
  sampleVariables: Record<string, unknown>;
}

export async function previewTemplate(
  organizationId: string,
  id: string,
  sampleVariables?: Record<string, unknown>
): Promise<TemplatePreview> {
  const template = await getTemplate(organizationId, id);
  const catalogEntry = getEventCatalogEntry(template.eventType);
  const variables = { ...(catalogEntry?.sampleVariables ?? {}), ...(sampleVariables ?? {}) };

  const titleResult = renderTemplate(template.titleTemplate, variables);
  const bodyResult = renderTemplate(template.bodyTemplate, variables);

  return {
    title: titleResult.rendered,
    body: bodyResult.rendered,
    missingVariables: [...new Set([...titleResult.missingVariables, ...bodyResult.missingVariables])],
    sampleVariables: variables,
  };
}
