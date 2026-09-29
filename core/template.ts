export const TEMPLATE_VARIABLES = ['nome'] as const;

const NAME_VARIABLE = /\{\s*nome\s*\}/gi;
const NAME_WITH_SEPARATOR = /[ \t]*,?[ \t]*\{\s*nome\s*\}/gi;
const LEADING_PUNCTUATION = /^[ \t]*[,;:][ \t]*/gm;
const ANY_VARIABLE = /\{\s*([^{}]*?)\s*\}/g;

export function cleanName(name: string | null | undefined): string | null {
  const cleaned = (name ?? '').replace(/\s+/g, ' ').trim();
  return cleaned || null;
}

/**
 * Replaces {nome} with the contact name. When there is no name, the variable is
 * removed together with its separator, so "Olá, {nome}! 👋" becomes "Olá! 👋".
 */
export function renderMessage(template: string, name: string | null | undefined): string {
  const contactName = cleanName(name);
  const rendered = contactName
    ? template.replace(NAME_VARIABLE, contactName)
    : template.replace(NAME_WITH_SEPARATOR, '').replace(LEADING_PUNCTUATION, '');
  return rendered.trim();
}

export function findUnknownVariables(template: string): string[] {
  const known = new Set<string>(TEMPLATE_VARIABLES);
  const unknown = new Set<string>();
  for (const match of template.matchAll(ANY_VARIABLE)) {
    const variable = (match[1] ?? '').toLowerCase();
    if (!known.has(variable)) unknown.add(match[0]);
  }
  return [...unknown];
}
