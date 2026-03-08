import type { StoryBible } from '../types/book';
import type { ContinuityGuardReport } from './continuityGuard';

export type SemanticReferenceKind = 'character' | 'location';
export type SemanticReferenceTargetView = 'bible' | 'saga';

export interface SemanticReferenceCatalogEntry {
  id: string;
  kind: SemanticReferenceKind;
  label: string;
  aliases: string[];
  tooltip: string;
  targetView: SemanticReferenceTargetView;
  warning?: string;
}

export interface SemanticReferenceInsertPayload {
  id: string;
  kind: SemanticReferenceKind;
  label: string;
  tooltip: string;
  targetView: SemanticReferenceTargetView;
  warning?: string;
}

const SHORTCODE_PATTERN = /([@#])\[(personaje|lugar)\s*:\s*([^\]]+)\]/giu;

function normalizeLookupValue(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function extractAliases(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function detectReferenceWarning(
  label: string,
  aliases: string[],
  continuityReport?: ContinuityGuardReport | null,
): string {
  if (!continuityReport) {
    return '';
  }

  const lookupTerms = [label, ...aliases].map((entry) => normalizeLookupValue(entry)).filter(Boolean);
  if (lookupTerms.length === 0) {
    return '';
  }

  const issue = continuityReport.issues.find((entry) => {
    const haystack = normalizeLookupValue(`${entry.message} ${entry.evidence}`);
    return lookupTerms.some((term) => haystack.includes(term));
  });

  return issue?.message ?? '';
}

export function buildSemanticReferenceCatalog(input: {
  storyBible: StoryBible | null;
  targetView: SemanticReferenceTargetView;
  continuityReport?: ContinuityGuardReport | null;
}): SemanticReferenceCatalogEntry[] {
  if (!input.storyBible) {
    return [];
  }

  const characters: SemanticReferenceCatalogEntry[] = input.storyBible.characters.flatMap((entry) => {
    const label = entry.name.trim();
    if (!label) {
      return [];
    }

    const aliases = extractAliases(entry.aliases);
    const tooltipParts = [
      entry.role.trim() ? `Rol: ${entry.role.trim()}` : '',
      entry.traits.trim() ? `Rasgos: ${entry.traits.trim()}` : '',
      entry.goal.trim() ? `Objetivo: ${entry.goal.trim()}` : '',
      entry.notes.trim() ? `Notas: ${entry.notes.trim()}` : '',
    ].filter(Boolean);

    return [
      {
        id: entry.id,
        kind: 'character',
        label,
        aliases,
        tooltip: tooltipParts.join(' | ') || 'Personaje del canon.',
        targetView: input.targetView,
        warning: detectReferenceWarning(label, aliases, input.continuityReport) || undefined,
      },
    ];
  });

  const locations: SemanticReferenceCatalogEntry[] = input.storyBible.locations.flatMap((entry) => {
    const label = entry.name.trim();
    if (!label) {
      return [];
    }

    const aliases = extractAliases(entry.aliases);
    const tooltipParts = [
      entry.description.trim() ? `Descripcion: ${entry.description.trim()}` : '',
      entry.atmosphere.trim() ? `Atmosfera: ${entry.atmosphere.trim()}` : '',
      entry.notes.trim() ? `Notas: ${entry.notes.trim()}` : '',
    ].filter(Boolean);

    return [
      {
        id: entry.id,
        kind: 'location',
        label,
        aliases,
        tooltip: tooltipParts.join(' | ') || 'Lugar del canon.',
        targetView: input.targetView,
        warning: detectReferenceWarning(label, aliases, input.continuityReport) || undefined,
      },
    ];
  });

  return [...characters, ...locations];
}

export function findSemanticReferenceMatch(
  catalog: SemanticReferenceCatalogEntry[],
  kind: SemanticReferenceKind,
  value: string,
): SemanticReferenceCatalogEntry | null {
  const normalized = normalizeLookupValue(value);
  if (!normalized) {
    return null;
  }

  return (
    catalog.find((entry) => {
      if (entry.kind !== kind) {
        return false;
      }

      if (normalizeLookupValue(entry.label) === normalized) {
        return true;
      }

      return entry.aliases.some((alias) => normalizeLookupValue(alias) === normalized);
    }) ?? null
  );
}

export function buildSemanticReferenceShortcode(kind: SemanticReferenceKind, label: string): string {
  const prefix = kind === 'character' ? '@' : '#';
  const kindLabel = kind === 'character' ? 'Personaje' : 'Lugar';
  return `${prefix}[${kindLabel}:${label.trim()}]`;
}

export function buildSemanticReferenceHtml(reference: SemanticReferenceInsertPayload): string {
  const kindLabel = reference.kind === 'character' ? 'character' : 'location';
  const status = reference.warning ? 'warning' : 'valid';
  const title = [reference.tooltip.trim(), reference.warning?.trim()].filter(Boolean).join(' | ');
  const prefix = reference.kind === 'character' ? '@' : '#';

  return `<span data-semantic-ref-kind="${kindLabel}" data-semantic-ref-id="${escapeHtml(reference.id)}" data-semantic-ref-label="${escapeHtml(reference.label)}" data-semantic-ref-tooltip="${escapeHtml(reference.tooltip)}" data-semantic-ref-target-view="${escapeHtml(reference.targetView)}" data-semantic-ref-status="${status}" data-semantic-ref-warning="${escapeHtml(reference.warning ?? '')}" title="${escapeHtml(title)}">${escapeHtml(`${prefix}${reference.label}`)}</span>`;
}

export function convertSemanticReferenceShortcodesToHtml(
  html: string,
  catalog: SemanticReferenceCatalogEntry[],
): string {
  if (!html.trim() || catalog.length === 0) {
    return html;
  }

  return html.replace(SHORTCODE_PATTERN, (fullMatch, prefix: string, rawKind: string, rawLabel: string) => {
    const kind: SemanticReferenceKind = rawKind.toLowerCase() === 'personaje' ? 'character' : 'location';
    if ((kind === 'character' && prefix !== '@') || (kind === 'location' && prefix !== '#')) {
      return fullMatch;
    }

    const resolved = findSemanticReferenceMatch(catalog, kind, rawLabel);
    if (!resolved) {
      return fullMatch;
    }

    return buildSemanticReferenceHtml({
      id: resolved.id,
      kind: resolved.kind,
      label: resolved.label,
      tooltip: resolved.tooltip,
      targetView: resolved.targetView,
      warning: resolved.warning,
    });
  });
}
