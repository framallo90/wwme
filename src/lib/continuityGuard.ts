import type { StoryBible, StoryCharacter, StoryLocation } from '../types/book';
import { normalizeCanonStatus } from './canon';

type ContinuityEntityKind = 'character' | 'location';

export interface ContinuityHighlightTerm {
  id: string;
  kind: ContinuityEntityKind;
  label: string;
  term: string;
  tooltip: string;
}

export interface ContinuityEntityMention {
  id: string;
  kind: ContinuityEntityKind;
  label: string;
  tooltip: string;
  occurrences: number;
  matchedTerms: string[];
  matchMode?: 'literal' | 'semantic';
  evidence?: string;
}

export interface ContinuityIssue {
  id: string;
  severity: 'warning';
  message: string;
  evidence: string;
}

export interface ContinuityGuardReport {
  mentions: ContinuityEntityMention[];
  issues: ContinuityIssue[];
}

interface BuildContinuityGuardReportInput {
  chapterText: string;
  storyBible: StoryBible;
  chapterNumber?: number | null;
  priorChapterTexts?: string[] | null;
}

interface EntityDescriptor {
  id: string;
  kind: ContinuityEntityKind;
  label: string;
  terms: string[];
  tooltip: string;
  semanticTokens: string[];
}

interface LimbConstraint {
  character: StoryCharacter;
  limb: string;
  side: string;
  source: string;
}

const ENTITY_WORD_CHARS = 'A-Za-z0-9A-Za-z\\u00C0-\\u024F';
const LIMB_ACTION_PATTERN =
  /\b(abre|agarra|sujeta|empuja|golpea|dispara|escribe|levanta|carga|empuna|blande|maneja)\b/u;
const LIMB_WORD_PATTERN = /\b(brazo|mano|pierna)\b/u;
const SIDE_WORD_PATTERN = /\b(derech[oa]?|izquierd[oa]?)\b/u;
const INJURY_WORD_PATTERN =
  /\b(herid[oa]?|inmovilizad[oa]?|fracturad[oa]?|quebrad[oa]?|amputad[oa]?|vendad[oa]?)\b/u;
const COMMON_SINGLE_TERM_STOPWORDS = new Set([
  'a',
  'al',
  'de',
  'del',
  'el',
  'ella',
  'ellas',
  'ellos',
  'en',
  'la',
  'las',
  'le',
  'les',
  'lo',
  'los',
  'mi',
  'mis',
  'se',
  'su',
  'sus',
  'tu',
  'tus',
  'un',
  'una',
  'uno',
  'unos',
  'unas',
  'y',
  'e',
]);
const SEMANTIC_STOPWORDS = new Set([
  ...COMMON_SINGLE_TERM_STOPWORDS,
  'ante',
  'aun',
  'aunque',
  'bajo',
  'como',
  'con',
  'contra',
  'cual',
  'cuando',
  'desde',
  'donde',
  'era',
  'ese',
  'esa',
  'eso',
  'esta',
  'este',
  'esto',
  'fue',
  'fueron',
  'ha',
  'han',
  'hasta',
  'hay',
  'lo',
  'mas',
  'menos',
  'muy',
  'para',
  'pero',
  'por',
  'porque',
  'que',
  'quien',
  'sin',
  'sobre',
  'todo',
  'tras',
  'ya',
]);
const SEMANTIC_CANONICAL_GROUPS = [
  ['anillo', 'sortija', 'aro', 'ring'],
  ['plata', 'argentea', 'argenteo', 'argenteas', 'argenteos', 'silver'],
  ['oro', 'dorado', 'dorada', 'gold'],
  ['espada', 'hoja', 'sable', 'blade'],
  ['corona', 'tiara', 'diadema', 'crown'],
  ['llave', 'clave', 'key'],
  ['veneno', 'toxina', 'poison'],
  ['amuleto', 'talisman', 'taliman', 'reliquia', 'relic'],
  ['plan', 'objetivo', 'proposito', 'intencion'],
  ['traicion', 'betrayal', 'conspiracion', 'complot'],
  ['secreto', 'truth', 'verdad', 'ocultamiento'],
  ['herida', 'lesion', 'cicatriz', 'wound'],
  ['saber', 'conocer', 'entender', 'recordar', 'descubrir'],
];
const SEMANTIC_CANONICAL_TOKEN_MAP = new Map<string, string>(
  SEMANTIC_CANONICAL_GROUPS.flatMap((group) =>
    group.map((token) => [token, group[0]] as const),
  ),
);
const KNOWLEDGE_RESTRICTION_PATTERN =
  /\b(no sabe|desconoce|ignora|no conoce|cree que|descree de)\b/u;
const KNOWLEDGE_ASSERTION_PATTERN =
  /\b(sabe|conoce|descubre|entiende|recuerda|sospecha|se entera|adivina)\b/u;
const KNOWLEDGE_IMPLICIT_ASSERTION_PATTERN =
  /\b(admite|confiesa|explica|describe|detalla|narra|cuenta|reconoce|menciona)\b/u;
const UNRELIABLE_NARRATION_PATTERN =
  /\b(ironia|ironico|sarcasmo|sarcastic[oa]?|miente|mintio|finge|fingio|simula|simulo|aparenta|aparento|engana|engano|narrador no fiable|unreliable)\b/u;
const RULE_CONCEPT_NOISE = new Set([
  'capitulo',
  'capitulos',
  'antes',
  'despues',
  'hasta',
  'revela',
  'revela',
  'revelar',
  'revela',
  'real',
  'no',
  'sabe',
  'conoce',
  'desconoce',
  'ignora',
  'cree',
  'que',
]);

function normalizeToken(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeSemanticToken(value: string): string {
  const normalized = normalizeToken(value).replace(/[^a-z0-9\s]+/g, ' ').trim();
  return normalized ? SEMANTIC_CANONICAL_TOKEN_MAP.get(normalized) ?? normalized : '';
}

function tokenizeSemanticText(value: string): string[] {
  return normalizeToken(value)
    .split(/[^a-z0-9]+/g)
    .map((token) => normalizeSemanticToken(token))
    .filter((token) => token.length > 2 && !SEMANTIC_STOPWORDS.has(token));
}

function buildSemanticTokenSet(...values: string[]): string[] {
  const seen = new Set<string>();
  const tokens: string[] = [];

  for (const value of values) {
    for (const token of tokenizeSemanticText(value)) {
      if (seen.has(token)) {
        continue;
      }
      seen.add(token);
      tokens.push(token);
    }
  }

  return tokens;
}

function semanticOverlap(left: Iterable<string>, right: Iterable<string>): string[] {
  const rightSet = right instanceof Set ? right : new Set(right);
  const overlap: string[] = [];
  const seen = new Set<string>();

  for (const token of left) {
    if (rightSet.has(token) && !seen.has(token)) {
      seen.add(token);
      overlap.push(token);
    }
  }

  return overlap;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface SentenceChunk {
  raw: string;
  normalized: string;
}

interface HistoryChunk extends SentenceChunk {
  chapterOffset: number;
}

interface KnowledgeRule {
  character: StoryCharacter;
  normalizedCharacterTerms: string[];
  limitChapter: number | null;
  conceptTokens: string[];
  sourceLine: string;
}

function splitSentenceChunks(text: string, maxLength = 260): SentenceChunk[] {
  return text
    .split(/[.!?\n]+/g)
    .map((entry) => entry.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map((entry) => {
      const clipped = entry.slice(0, maxLength);
      return {
        raw: clipped,
        normalized: normalizeToken(clipped),
      };
    });
}

function buildHistoryChunks(priorChapterTexts?: string[] | null, maxChapters = 8): HistoryChunk[] {
  const normalizedHistory = (priorChapterTexts ?? [])
    .map((entry) => entry.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(-maxChapters);
  if (normalizedHistory.length === 0) {
    return [];
  }

  const chunks: HistoryChunk[] = [];
  for (let index = normalizedHistory.length - 1; index >= 0; index -= 1) {
    const chapterOffset = normalizedHistory.length - index;
    for (const chunk of splitSentenceChunks(normalizedHistory[index], 220)) {
      chunks.push({
        ...chunk,
        chapterOffset,
      });
    }
  }

  return chunks;
}

function containsNormalizedTerm(text: string, term: string): boolean {
  if (!text || !term) {
    return false;
  }

  const regex = new RegExp(`(^|[^${ENTITY_WORD_CHARS}])(${escapeRegExp(term)})(?=$|[^${ENTITY_WORD_CHARS}])`, 'iu');
  return regex.test(text);
}

function splitAliases(value: string): string[] {
  return value
    .split(/[,\n;|]+/g)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function buildEntityTerms(label: string, aliases: string): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];
  const push = (value: string) => {
    const compact = value.replace(/\s+/g, ' ').trim();
    const normalized = normalizeToken(compact);
    if (!compact || normalized.length < 2 || seen.has(normalized)) {
      return;
    }

    const words = compact.split(/\s+/g).filter(Boolean);
    if (words.length === 1) {
      if (normalized.length <= 2) {
        return;
      }

      if (COMMON_SINGLE_TERM_STOPWORDS.has(normalized)) {
        return;
      }
    }

    seen.add(normalized);
    terms.push(compact);
  };

  push(label);
  for (const alias of splitAliases(aliases)) {
    push(alias);
  }

  return terms;
}

function buildTermRegex(term: string): RegExp {
  return new RegExp(`(^|[^${ENTITY_WORD_CHARS}])(${escapeRegExp(term)})(?=$|[^${ENTITY_WORD_CHARS}])`, 'giu');
}

function countTermMatches(text: string, term: string): number {
  const regex = buildTermRegex(term);
  let total = 0;
  let match = regex.exec(text);

  while (match) {
    total += 1;
    if (regex.lastIndex === match.index) {
      regex.lastIndex += 1;
    }
    match = regex.exec(text);
  }

  return total;
}

function findFirstTermEvidence(text: string, term: string): string {
  const regex = buildTermRegex(term);
  const match = regex.exec(text);
  if (!match) {
    return '';
  }

  const rawIndex = match.index + (match[1]?.length ?? 0);
  const from = Math.max(0, rawIndex - 48);
  const to = Math.min(text.length, rawIndex + term.length + 72);
  return text.slice(from, to).replace(/\s+/g, ' ').trim();
}

function buildCharacterTooltip(character: StoryCharacter): string {
  const parts: string[] = [];
  if (character.role.trim()) {
    parts.push(`Rol: ${character.role.trim()}`);
  }
  if (character.goal.trim()) {
    parts.push(`Objetivo: ${character.goal.trim()}`);
  }
  if (character.traits.trim()) {
    parts.push(`Rasgos: ${character.traits.trim()}`);
  }
  if (character.notes.trim()) {
    parts.push(`Notas: ${character.notes.trim()}`);
  }
  return parts.length > 0 ? parts.join(' | ') : 'Sin datos adicionales en la biblia.';
}

function buildLocationTooltip(location: StoryLocation): string {
  const parts: string[] = [];
  if (location.description.trim()) {
    parts.push(`Descripcion: ${location.description.trim()}`);
  }
  if (location.atmosphere.trim()) {
    parts.push(`Atmosfera: ${location.atmosphere.trim()}`);
  }
  if (location.notes.trim()) {
    parts.push(`Notas: ${location.notes.trim()}`);
  }
  return parts.length > 0 ? parts.join(' | ') : 'Sin datos adicionales en la biblia.';
}

function buildEntityDescriptors(storyBible: StoryBible): EntityDescriptor[] {
  const descriptors: EntityDescriptor[] = [];

  for (const character of storyBible.characters) {
    if (normalizeCanonStatus(character.canonStatus) !== 'canonical') {
      continue;
    }
    const terms = buildEntityTerms(character.name, character.aliases);
    if (terms.length === 0) {
      continue;
    }

    descriptors.push({
      id: character.id,
      kind: 'character',
      label: character.name.trim() || 'Personaje',
      terms,
      tooltip: buildCharacterTooltip(character),
      semanticTokens: buildSemanticTokenSet(
        character.name,
        character.aliases,
        character.role,
        character.goal,
        character.traits,
        character.notes,
      ),
    });
  }

  for (const location of storyBible.locations) {
    if (normalizeCanonStatus(location.canonStatus) !== 'canonical') {
      continue;
    }
    const terms = buildEntityTerms(location.name, location.aliases);
    if (terms.length === 0) {
      continue;
    }

    descriptors.push({
      id: location.id,
      kind: 'location',
      label: location.name.trim() || 'Lugar',
      terms,
      tooltip: buildLocationTooltip(location),
      semanticTokens: buildSemanticTokenSet(
        location.name,
        location.aliases,
        location.description,
        location.atmosphere,
        location.notes,
      ),
    });
  }

  return descriptors;
}

function extractRuleConceptTokens(line: string, characterTerms: string[]): string[] {
  const characterTokenSet = new Set(
    characterTerms.flatMap((term) => tokenizeSemanticText(term)),
  );
  const tokens = tokenizeSemanticText(line).filter(
    (token) => !characterTokenSet.has(token) && !RULE_CONCEPT_NOISE.has(token),
  );
  return Array.from(new Set(tokens));
}

function detectSemanticMention(
  chunks: SentenceChunk[],
  descriptor: EntityDescriptor,
): { matchedTokens: string[]; evidence: string } | null {
  if (descriptor.semanticTokens.length < 2) {
    return null;
  }

  let bestOverlap: string[] = [];
  let bestEvidence = '';
  for (const chunk of chunks) {
    const chunkTokens = tokenizeSemanticText(chunk.normalized);
    if (chunkTokens.length === 0) {
      continue;
    }
    const overlap = semanticOverlap(descriptor.semanticTokens, chunkTokens);
    if (overlap.length > bestOverlap.length) {
      bestOverlap = overlap;
      bestEvidence = chunk.raw;
    }
  }

  if (bestOverlap.length === 0 || !bestEvidence) {
    return null;
  }

  const requiredOverlap = descriptor.semanticTokens.length >= 8 ? 3 : 2;
  if (bestOverlap.length < requiredOverlap) {
    return null;
  }

  return {
    matchedTokens: bestOverlap.slice(0, 4),
    evidence: bestEvidence,
  };
}

function extractRelevantRuleLines(storyBible: StoryBible, character: StoryCharacter): string[] {
  const rules = storyBible.continuityRules
    .split(/\n+/g)
    .map((line) => line.trim())
    .filter(Boolean);
  if (rules.length === 0) {
    return [];
  }

  const normalizedTerms = new Set(buildEntityTerms(character.name, character.aliases).map((term) => normalizeToken(term)));
  if (normalizedTerms.size === 0) {
    return [];
  }

  return rules.filter((line) => {
    const normalizedLine = normalizeToken(line);
    for (const term of normalizedTerms) {
      if (term && normalizedLine.includes(term)) {
        return true;
      }
    }
    return false;
  });
}

function extractLimbConstraints(storyBible: StoryBible): LimbConstraint[] {
  const constraints: LimbConstraint[] = [];

  for (const character of storyBible.characters) {
    if (normalizeCanonStatus(character.canonStatus) !== 'canonical') {
      continue;
    }
    const candidateSources = [character.notes, character.traits, ...extractRelevantRuleLines(storyBible, character)]
      .map((value) => value.trim())
      .filter(Boolean);

    if (candidateSources.length === 0) {
      continue;
    }

    for (const source of candidateSources) {
      const chunks = splitSentenceChunks(source, 220);
      for (const chunk of chunks) {
        if (!INJURY_WORD_PATTERN.test(chunk.normalized)) {
          continue;
        }

        const limbMatch = chunk.normalized.match(LIMB_WORD_PATTERN);
        const sideMatch = chunk.normalized.match(SIDE_WORD_PATTERN);
        if (!limbMatch || !sideMatch) {
          continue;
        }

        constraints.push({
          character,
          limb: (limbMatch[1] ?? '').toLowerCase(),
          side: (sideMatch[1] ?? '').toLowerCase(),
          source: chunk.raw,
        });
      }
    }
  }

  return constraints;
}

function detectLimbInconsistencies(chapterText: string, storyBible: StoryBible): ContinuityIssue[] {
  const issues: ContinuityIssue[] = [];
  const constraints = extractLimbConstraints(storyBible);
  if (constraints.length === 0) {
    return issues;
  }

  const chapterChunks = splitSentenceChunks(chapterText);

  for (const constraint of constraints) {
    const normalizedCharacterTerms = buildEntityTerms(constraint.character.name, constraint.character.aliases)
      .map((term) => normalizeToken(term))
      .filter(Boolean);
    if (normalizedCharacterTerms.length === 0) {
      continue;
    }

    const limbPattern =
      constraint.limb === 'brazo' || constraint.limb === 'mano' ? '(?:brazo|mano)' : escapeRegExp(constraint.limb);
    const sidePattern = constraint.side.startsWith('derech')
      ? 'derech[oa]?'
      : constraint.side.startsWith('izquierd')
        ? 'izquierd[oa]?'
        : escapeRegExp(constraint.side);
    const limbSidePattern = new RegExp(`\\b${limbPattern}\\s+${sidePattern}\\b`, 'u');

    for (const chunk of chapterChunks) {
      const referencesCharacter = normalizedCharacterTerms.some((term) => containsNormalizedTerm(chunk.normalized, term));
      if (!referencesCharacter) {
        continue;
      }

      if (!limbSidePattern.test(chunk.normalized)) {
        continue;
      }

      if (!LIMB_ACTION_PATTERN.test(chunk.normalized)) {
        continue;
      }

      if (chunk.normalized.includes('no puede') || chunk.normalized.includes('incapaz')) {
        continue;
      }

      issues.push({
        id: `limb-${constraint.character.id}-${constraint.limb}-${constraint.side}`,
        severity: 'warning',
        message: `${constraint.character.name}: posible inconsistencia (${constraint.limb} ${constraint.side} lesionado/inmovilizado en biblia).`,
        evidence: chunk.raw,
      });
      break;
    }
  }

  return issues;
}

function parseRevealRuleChapterLimit(normalizedLine: string): number | null {
  const untilMatch = normalizedLine.match(/hasta\s+(?:el\s+)?capitulo\s+(\d+)/i);
  if (untilMatch) {
    const parsed = Number.parseInt(untilMatch[1] ?? '', 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  const beforeMatch = normalizedLine.match(/antes\s+de[l]?\s+capitulo\s+(\d+)/i);
  if (beforeMatch) {
    const parsed = Number.parseInt(beforeMatch[1] ?? '', 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function isRevealRuleActiveForChapter(limitChapter: number | null, chapterNumber: number | null | undefined): boolean {
  if (limitChapter === null || chapterNumber === null || chapterNumber === undefined) {
    return true;
  }

  return chapterNumber < limitChapter;
}

function detectRevealInconsistencies(
  chapterText: string,
  storyBible: StoryBible,
  chapterNumber?: number | null,
): ContinuityIssue[] {
  const issues: ContinuityIssue[] = [];
  const continuityLines = storyBible.continuityRules
    .split(/\n+/g)
    .map((line) => line.trim())
    .filter(Boolean);

  if (continuityLines.length === 0) {
    return issues;
  }

  for (const character of storyBible.characters) {
    if (normalizeCanonStatus(character.canonStatus) !== 'canonical') {
      continue;
    }
    const characterTerms = buildEntityTerms(character.name, character.aliases);
    if (characterTerms.length === 0) {
      continue;
    }

    const revealRules = continuityLines
      .map((line) => {
        const normalizedLine = normalizeToken(line);
        const referencesCharacter = characterTerms.some((term) => normalizedLine.includes(normalizeToken(term)));
        if (!referencesCharacter || !normalizedLine.includes('no revela')) {
          return null;
        }

        return {
          line,
          limitChapter: parseRevealRuleChapterLimit(normalizedLine),
          conceptTokens: extractRuleConceptTokens(line, characterTerms),
        };
      })
      .filter((entry): entry is { line: string; limitChapter: number | null; conceptTokens: string[] } => Boolean(entry));

    if (revealRules.length === 0) {
      continue;
    }

    const activeRule = revealRules.find((entry) => isRevealRuleActiveForChapter(entry.limitChapter, chapterNumber));
    if (!activeRule) {
      continue;
    }

    const normalizedCharacterTerms = characterTerms.map((term) => normalizeToken(term)).filter(Boolean);
    let evidence = '';
    for (const chunk of splitSentenceChunks(chapterText)) {
      if (!chunk.normalized.includes('revela')) {
        continue;
      }

      if (chunk.normalized.includes('no revela')) {
        continue;
      }

      if (UNRELIABLE_NARRATION_PATTERN.test(chunk.normalized)) {
        continue;
      }

      const referencesCharacter = normalizedCharacterTerms.some((term) => containsNormalizedTerm(chunk.normalized, term));
      if (!referencesCharacter) {
        continue;
      }

      if (activeRule.conceptTokens.length > 0) {
        const overlap = semanticOverlap(tokenizeSemanticText(chunk.normalized), activeRule.conceptTokens);
        const requiredOverlap = activeRule.conceptTokens.length >= 3 ? 2 : 1;
        if (overlap.length < requiredOverlap) {
          continue;
        }
      }

      evidence = chunk.raw;
      break;
    }

    if (!evidence) {
      continue;
    }

    issues.push({
      id: `reveal-${character.id}`,
      severity: 'warning',
      message:
        activeRule.limitChapter !== null
          ? `${character.name}: posible contradiccion con regla "no revela" activa hasta capitulo ${activeRule.limitChapter}.`
          : `${character.name}: posible contradiccion con regla "no revela" en la biblia.`,
      evidence,
    });
  }

  return issues;
}

function detectKnowledgeInconsistencies(
  chapterText: string,
  storyBible: StoryBible,
  chapterNumber?: number | null,
): ContinuityIssue[] {
  const issues: ContinuityIssue[] = [];
  const continuityLines = storyBible.continuityRules
    .split(/\n+/g)
    .map((line) => line.trim())
    .filter(Boolean);

  if (continuityLines.length === 0) {
    return issues;
  }

  const chapterChunks = splitSentenceChunks(chapterText);

  for (const character of storyBible.characters) {
    if (normalizeCanonStatus(character.canonStatus) !== 'canonical') {
      continue;
    }

    const characterTerms = buildEntityTerms(character.name, character.aliases);
    if (characterTerms.length === 0) {
      continue;
    }

    const normalizedCharacterTerms = characterTerms.map((term) => normalizeToken(term)).filter(Boolean);
    const knowledgeRules = continuityLines
      .map((line) => {
        const normalizedLine = normalizeToken(line);
        const referencesCharacter = characterTerms.some((term) => normalizedLine.includes(normalizeToken(term)));
        if (!referencesCharacter || !KNOWLEDGE_RESTRICTION_PATTERN.test(normalizedLine)) {
          return null;
        }

        return {
          line,
          limitChapter: parseRevealRuleChapterLimit(normalizedLine),
          conceptTokens: extractRuleConceptTokens(line, characterTerms),
        };
      })
      .filter((entry): entry is { line: string; limitChapter: number | null; conceptTokens: string[] } => Boolean(entry));

    if (knowledgeRules.length === 0) {
      continue;
    }

    for (const rule of knowledgeRules) {
      if (!isRevealRuleActiveForChapter(rule.limitChapter, chapterNumber)) {
        continue;
      }

      for (const chunk of chapterChunks) {
        if (
          !KNOWLEDGE_ASSERTION_PATTERN.test(chunk.normalized) &&
          !KNOWLEDGE_IMPLICIT_ASSERTION_PATTERN.test(chunk.normalized)
        ) {
          continue;
        }

        const referencesCharacter = normalizedCharacterTerms.some((term) => containsNormalizedTerm(chunk.normalized, term));
        if (!referencesCharacter) {
          continue;
        }

        if (UNRELIABLE_NARRATION_PATTERN.test(chunk.normalized)) {
          continue;
        }

        if (rule.conceptTokens.length > 0) {
          const overlap = semanticOverlap(tokenizeSemanticText(chunk.normalized), rule.conceptTokens);
          const requiredOverlap = rule.conceptTokens.length >= 3 ? 2 : 1;
          if (overlap.length < requiredOverlap) {
            continue;
          }
        }

        issues.push({
          id: `knowledge-${character.id}-${normalizeToken(rule.line).slice(0, 32)}`,
          severity: 'warning',
          message:
            rule.limitChapter !== null
              ? `${character.name}: posible conocimiento adelantado antes del capitulo ${rule.limitChapter}.`
              : `${character.name}: posible conocimiento adelantado respecto a la biblia.`,
          evidence: chunk.raw,
        });
        break;
      }
    }
  }

  return issues;
}

function buildKnowledgeRules(storyBible: StoryBible): KnowledgeRule[] {
  const continuityLines = storyBible.continuityRules
    .split(/\n+/g)
    .map((line) => line.trim())
    .filter(Boolean);
  if (continuityLines.length === 0) {
    return [];
  }

  const rules: KnowledgeRule[] = [];

  for (const character of storyBible.characters) {
    if (normalizeCanonStatus(character.canonStatus) !== 'canonical') {
      continue;
    }

    const characterTerms = buildEntityTerms(character.name, character.aliases);
    if (characterTerms.length === 0) {
      continue;
    }

    const normalizedCharacterTerms = characterTerms.map((term) => normalizeToken(term)).filter(Boolean);

    for (const line of continuityLines) {
      const normalizedLine = normalizeToken(line);
      const referencesCharacter = normalizedCharacterTerms.some(
        (term) => term && containsNormalizedTerm(normalizedLine, term),
      );
      if (!referencesCharacter || !KNOWLEDGE_RESTRICTION_PATTERN.test(normalizedLine)) {
        continue;
      }

      rules.push({
        character,
        normalizedCharacterTerms,
        limitChapter: parseRevealRuleChapterLimit(normalizedLine),
        conceptTokens: extractRuleConceptTokens(line, characterTerms),
        sourceLine: line,
      });
    }
  }

  return rules;
}

function detectKnowledgeRegressionInconsistencies(
  chapterText: string,
  storyBible: StoryBible,
  chapterNumber?: number | null,
  priorChapterTexts?: string[] | null,
): ContinuityIssue[] {
  const rules = buildKnowledgeRules(storyBible);
  if (rules.length === 0) {
    return [];
  }

  const chapterChunks = splitSentenceChunks(chapterText);
  const historyChunks = buildHistoryChunks(priorChapterTexts);
  if (historyChunks.length === 0) {
    return [];
  }

  const issues: ContinuityIssue[] = [];

  for (const rule of rules) {
    if (!isRevealRuleActiveForChapter(rule.limitChapter, chapterNumber)) {
      continue;
    }

    let priorKnowledgeEvidence: HistoryChunk | null = null;
    for (const chunk of historyChunks) {
      const referencesCharacter = rule.normalizedCharacterTerms.some(
        (term) => term && containsNormalizedTerm(chunk.normalized, term),
      );
      if (!referencesCharacter) {
        continue;
      }

      if (
        !KNOWLEDGE_ASSERTION_PATTERN.test(chunk.normalized) &&
        !KNOWLEDGE_IMPLICIT_ASSERTION_PATTERN.test(chunk.normalized)
      ) {
        continue;
      }

      if (UNRELIABLE_NARRATION_PATTERN.test(chunk.normalized)) {
        continue;
      }

      if (rule.conceptTokens.length > 0) {
        const overlap = semanticOverlap(tokenizeSemanticText(chunk.normalized), rule.conceptTokens);
        const requiredOverlap = rule.conceptTokens.length >= 3 ? 2 : 1;
        if (overlap.length < requiredOverlap) {
          continue;
        }
      }

      priorKnowledgeEvidence = chunk;
      break;
    }

    if (!priorKnowledgeEvidence) {
      continue;
    }

    let currentRestrictionEvidence = '';
    for (const chunk of chapterChunks) {
      const referencesCharacter = rule.normalizedCharacterTerms.some(
        (term) => term && containsNormalizedTerm(chunk.normalized, term),
      );
      if (!referencesCharacter) {
        continue;
      }

      if (!KNOWLEDGE_RESTRICTION_PATTERN.test(chunk.normalized)) {
        continue;
      }

      if (UNRELIABLE_NARRATION_PATTERN.test(chunk.normalized)) {
        continue;
      }

      if (rule.conceptTokens.length > 0) {
        const overlap = semanticOverlap(tokenizeSemanticText(chunk.normalized), rule.conceptTokens);
        const requiredOverlap = rule.conceptTokens.length >= 3 ? 2 : 1;
        if (overlap.length < requiredOverlap) {
          continue;
        }
      }

      currentRestrictionEvidence = chunk.raw;
      break;
    }

    if (!currentRestrictionEvidence) {
      continue;
    }

    issues.push({
      id: `knowledge-regression-${rule.character.id}-${normalizeToken(rule.sourceLine).slice(0, 28)}`,
      severity: 'warning',
      message: `${rule.character.name}: posible regresion de conocimiento; ya habia evidencia previa de que conocia este dato.`,
      evidence: `Actual: ${currentRestrictionEvidence} | Prev (${priorKnowledgeEvidence.chapterOffset} cap. atras): ${priorKnowledgeEvidence.raw}`,
    });
  }

  return issues;
}

export function buildContinuityHighlights(storyBible: StoryBible): ContinuityHighlightTerm[] {
  const descriptors = buildEntityDescriptors(storyBible);
  const highlights: ContinuityHighlightTerm[] = [];

  for (const descriptor of descriptors) {
    for (const term of descriptor.terms) {
      highlights.push({
        id: descriptor.id,
        kind: descriptor.kind,
        label: descriptor.label,
        term,
        tooltip: descriptor.tooltip,
      });
    }
  }

  return highlights.sort((left, right) => right.term.length - left.term.length);
}

export function buildContinuityGuardReport(input: BuildContinuityGuardReportInput): ContinuityGuardReport {
  const chapterText = input.chapterText.replace(/\s+/g, ' ').trim();
  if (!chapterText) {
    return { mentions: [], issues: [] };
  }

  const descriptors = buildEntityDescriptors(input.storyBible);
  const mentions: ContinuityEntityMention[] = [];
  const chapterChunks = splitSentenceChunks(chapterText);

  for (const descriptor of descriptors) {
    let occurrences = 0;
    const matchedTerms: string[] = [];
    let firstEvidence = '';

    for (const term of descriptor.terms) {
      const matchCount = countTermMatches(chapterText, term);
      if (matchCount <= 0) {
        continue;
      }

      occurrences += matchCount;
      matchedTerms.push(term);
      if (!firstEvidence) {
        firstEvidence = findFirstTermEvidence(chapterText, term);
      }
    }

    if (occurrences > 0) {
      mentions.push({
        id: descriptor.id,
        kind: descriptor.kind,
        label: descriptor.label,
        tooltip: descriptor.tooltip,
        occurrences,
        matchedTerms,
        matchMode: 'literal',
        evidence: firstEvidence,
      });
      continue;
    }

    const semanticMention = detectSemanticMention(chapterChunks, descriptor);
    if (!semanticMention) {
      continue;
    }

    mentions.push({
      id: descriptor.id,
      kind: descriptor.kind,
      label: descriptor.label,
      tooltip: descriptor.tooltip,
      occurrences: 1,
      matchedTerms: semanticMention.matchedTokens,
      matchMode: 'semantic',
      evidence: semanticMention.evidence,
    });
  }

  const issues = [
    ...detectRevealInconsistencies(chapterText, input.storyBible, input.chapterNumber),
    ...detectKnowledgeInconsistencies(chapterText, input.storyBible, input.chapterNumber),
    ...detectKnowledgeRegressionInconsistencies(
      chapterText,
      input.storyBible,
      input.chapterNumber,
      input.priorChapterTexts,
    ),
    ...detectLimbInconsistencies(chapterText, input.storyBible),
  ];
  const dedupedIssues: ContinuityIssue[] = [];
  const seenIssueIds = new Set<string>();

  for (const issue of issues) {
    if (seenIssueIds.has(issue.id)) {
      continue;
    }
    seenIssueIds.add(issue.id);
    dedupedIssues.push(issue);
  }

  mentions.sort((left, right) => {
    if (left.occurrences !== right.occurrences) {
      return right.occurrences - left.occurrences;
    }
    return left.label.localeCompare(right.label);
  });

  dedupedIssues.sort((left, right) => left.message.localeCompare(right.message));

  return {
    mentions,
    issues: dedupedIssues,
  };
}

export function buildContinuityHoverSummary(entry: ContinuityEntityMention): string {
  const terms = entry.matchedTerms.slice(0, 3).join(', ');
  const modePrefix = entry.matchMode === 'semantic' ? 'Coincidencia semantica' : 'Coincidencias';
  const evidence = terms ? `${modePrefix}: ${terms}.` : '';
  const snippet = entry.evidence ? `Evidencia: ${entry.evidence}` : '';
  return [entry.tooltip, evidence, snippet].filter(Boolean).join(' | ');
}

export function findContinuityEvidenceSnippet(chapterText: string, term: string): string {
  return findFirstTermEvidence(chapterText.replace(/\s+/g, ' ').trim(), term);
}
