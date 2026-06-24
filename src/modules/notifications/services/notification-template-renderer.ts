// =============================================================================
// NOTIFICATION TEMPLATE RENDERER
// Pure functions — no DB access. Variables use the {{variableName}} syntax.
// Rendered as plain text everywhere (no dangerouslySetInnerHTML downstream),
// so HTML escaping is not required for the IN_APP channel.
// =============================================================================

const VARIABLE_PATTERN = /\{\{\s*(\w+)\s*\}\}/g;

export interface RenderResult {
  rendered: string;
  missingVariables: string[];
}

export function extractTemplateVariables(template: string): string[] {
  const found = new Set<string>();
  for (const match of template.matchAll(VARIABLE_PATTERN)) {
    found.add(match[1]);
  }
  return [...found];
}

/**
 * Replaces every {{variableName}} with its value. A variable with no entry
 * in `variables` (or an entry of null/undefined) is left as literal
 * "{{variableName}}" text and reported in `missingVariables` — callers
 * decide whether that's acceptable for their context.
 */
export function renderTemplate(template: string, variables: Record<string, unknown>): RenderResult {
  const missingVariables: string[] = [];

  const rendered = template.replace(VARIABLE_PATTERN, (match, name: string) => {
    const value = variables[name];
    if (value === undefined || value === null) {
      missingVariables.push(name);
      return match;
    }
    return String(value);
  });

  return { rendered, missingVariables };
}

export interface TemplateVariableValidation {
  valid: boolean;
  unknownVariables: string[];
}

/**
 * A template may only reference variables the event catalog declares for
 * that event type. Called at template save time (create/update commands).
 */
export function validateTemplateVariables(
  content: string,
  allowedVariables: readonly string[]
): TemplateVariableValidation {
  const used = extractTemplateVariables(content);
  const allowedSet = new Set(allowedVariables);
  const unknownVariables = used.filter((name) => !allowedSet.has(name));
  return { valid: unknownVariables.length === 0, unknownVariables };
}
