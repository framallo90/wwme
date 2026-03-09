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
  language?: string | null;
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

type ContinuityLanguageCode = 'es' | 'en';

interface ContinuityLanguagePatterns {
  limbActionPattern: RegExp;
  limbWordPattern: RegExp;
  sideWordPattern: RegExp;
  injuryWordPattern: RegExp;
  knowledgeRestrictionPattern: RegExp;
  knowledgeAssertionPattern: RegExp;
  knowledgeImplicitAssertionPattern: RegExp;
  unreliableNarrationPattern: RegExp;
  revealRestrictionPattern: RegExp;
  revealMentionPattern: RegExp;
  revealNegationPattern: RegExp;
  inabilityPattern: RegExp;
  untilChapterPattern: RegExp;
  beforeChapterPattern: RegExp;
  rightSidePrefixes: string[];
  leftSidePrefixes: string[];
  rightSidePattern: string;
  leftSidePattern: string;
  armLimbPrefixes: string[];
  legLimbPrefixes: string[];
  armFamilyPattern: string;
  legPattern: string;
}

const ENTITY_WORD_CHARS = 'A-Za-z0-9A-Za-z\\u00C0-\\u024F';
const LANGUAGE_PATTERNS: Record<ContinuityLanguageCode, ContinuityLanguagePatterns> = {
  es: {
    limbActionPattern:
      /\b(abre|agarra|sujeta|empuja|golpea|dispara|escribe|levanta|carga|empuna|blande|maneja)\b/u,
    limbWordPattern: /\b(brazo|mano|pierna)\b/u,
    sideWordPattern: /\b(derech[oa]?|izquierd[oa]?)\b/u,
    injuryWordPattern: /\b(herid[oa]?|inmovilizad[oa]?|fracturad[oa]?|quebrad[oa]?|amputad[oa]?|vendad[oa]?)\b/u,
    knowledgeRestrictionPattern: /\b(no sabe|desconoce|ignora|no conoce|cree que|descree de)\b/u,
    knowledgeAssertionPattern: /\b(sabe|conoce|descubre|entiende|recuerda|sospecha|se entera|adivina)\b/u,
    knowledgeImplicitAssertionPattern: /\b(admite|confiesa|explica|describe|detalla|narra|cuenta|reconoce|menciona)\b/u,
    unreliableNarrationPattern:
      /\b(ironia|ironico|sarcasmo|sarcastic[oa]?|miente|mintio|finge|fingio|simula|simulo|aparenta|aparento|engana|engano|narrador no fiable|unreliable)\b/u,
    revealRestrictionPattern: /\bno\s+revel\w*\b/u,
    revealMentionPattern: /\brevel\w*\b/u,
    revealNegationPattern: /\bno\s+revel\w*\b/u,
    inabilityPattern: /\b(no puede|incapaz)\b/u,
    untilChapterPattern: /hasta\s+(?:el\s+)?capitulo\s+(\d+)/i,
    beforeChapterPattern: /antes\s+de(?:l)?\s+capitulo\s+(\d+)/i,
    rightSidePrefixes: ['derech'],
    leftSidePrefixes: ['izquierd'],
    rightSidePattern: 'derech[oa]?',
    leftSidePattern: 'izquierd[oa]?',
    armLimbPrefixes: ['brazo', 'mano'],
    legLimbPrefixes: ['pierna'],
    armFamilyPattern: '(?:brazo|mano)',
    legPattern: '(?:pierna)',
  },
  en: {
    limbActionPattern:
      /\b(open|opens|grab|grabs|hold|holds|push|pushes|hit|hits|shoot|shoots|write|writes|lift|lifts|carry|carries|wield|wields|handle|handles)\b/u,
    limbWordPattern: /\b(arm|hand|leg)\b/u,
    sideWordPattern: /\b(right|left)\b/u,
    injuryWordPattern: /\b(injur(?:ed|y)?|immobiliz(?:ed|e)|fractur(?:ed|e)|broken|amputat(?:ed|e)|bandag(?:ed|e)|wound(?:ed)?)\b/u,
    knowledgeRestrictionPattern:
      /\b(does not know|doesn't know|is unaware|ignores|does not understand|doesn't understand|believes that)\b/u,
    knowledgeAssertionPattern: /\b(know|knows|learn|learns|discover|discovers|understand|understands|remember|remembers|suspect|suspects|realize|realizes)\b/u,
    knowledgeImplicitAssertionPattern:
      /\b(admit|admits|confess|confesses|explain|explains|describe|describes|detail|details|narrate|narrates|mention|mentions|acknowledge|acknowledges)\b/u,
    unreliableNarrationPattern:
      /\b(irony|ironic|sarcasm|sarcastic|lies?|lied|pretend|pretends|pretended|feign|feigns|feigned|simulate|simulates|simulated|deceive|deceives|deceived|unreliable narrator)\b/u,
    revealRestrictionPattern: /\b(does not reveal|doesn't reveal|will not reveal|won't reveal)\b/u,
    revealMentionPattern: /\breveal(?:s|ed|ing)?\b/u,
    revealNegationPattern: /\b(does not reveal|doesn't reveal|will not reveal|won't reveal)\b/u,
    inabilityPattern: /\b(cannot|can't|unable)\b/u,
    untilChapterPattern: /until\s+chapter\s+(\d+)/i,
    beforeChapterPattern: /before\s+chapter\s+(\d+)/i,
    rightSidePrefixes: ['right'],
    leftSidePrefixes: ['left'],
    rightSidePattern: 'right',
    leftSidePattern: 'left',
    armLimbPrefixes: ['arm', 'hand'],
    legLimbPrefixes: ['leg'],
    armFamilyPattern: '(?:arm|hand)',
    legPattern: '(?:leg)',
  },
};

function resolveLanguagePatterns(language?: string | null): ContinuityLanguagePatterns {
  const normalized = normalizeToken(language ?? '');
  if (normalized.startsWith('en')) {
    return LANGUAGE_PATTERNS.en;
  }
  return LANGUAGE_PATTERNS.es;
}

const COMMON_SINGLE_TERM_STOPWORDS_ES = [
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
];
const COMMON_SINGLE_TERM_STOPWORDS_EN = [
  'a',
  'an',
  'and',
  'as',
  'at',
  'for',
  'he',
  'her',
  'hers',
  'him',
  'his',
  'i',
  'in',
  'it',
  'its',
  'me',
  'my',
  'of',
  'on',
  'or',
  'our',
  'ours',
  'she',
  'the',
  'their',
  'theirs',
  'them',
  'they',
  'to',
  'us',
  'we',
  'you',
  'your',
  'yours',
];
const COMMON_SINGLE_TERM_STOPWORDS = new Set([
  ...COMMON_SINGLE_TERM_STOPWORDS_ES,
  ...COMMON_SINGLE_TERM_STOPWORDS_EN,
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
  'about',
  'after',
  'against',
  'all',
  'also',
  'are',
  'because',
  'before',
  'between',
  'but',
  'by',
  'from',
  'had',
  'has',
  'have',
  'if',
  'into',
  'is',
  'more',
  'most',
  'not',
  'now',
  'so',
  'than',
  'that',
  'then',
  'there',
  'these',
  'this',
  'those',
  'through',
  'under',
  'very',
  'was',
  'were',
  'what',
  'when',
  'where',
  'who',
  'with',
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
const OBJECT_IDENTITY_TOKENS = new Set([
  'anillo',
  'espada',
  'corona',
  'llave',
  'amuleto',
  'veneno',
  'reliquia',
  'talisman',
]);
const MATERIAL_CANONICAL_GROUPS = [
  ['plata', 'argentea', 'argenteo', 'argenteas', 'argenteos', 'silver'],
  ['oro', 'dorado', 'dorada', 'dorados', 'doradas', 'gold'],
  ['hierro', 'ferreo', 'ferrea', 'iron'],
  ['bronce', 'bronze'],
  ['obsidiana', 'obsidian'],
  ['marfil', 'ivory'],
  ['hueso', 'bone'],
];
const MATERIAL_CANONICAL_TOKEN_MAP = new Map<string, string>(
  MATERIAL_CANONICAL_GROUPS.flatMap((group) =>
    group.map((token) => [token, group[0]] as const),
  ),
);
const MATERIAL_CANONICAL_SET = new Set(MATERIAL_CANONICAL_GROUPS.map((group) => group[0]));
const RULE_CONCEPT_NOISE = new Set([
  'capitulo',
  'capitulos',
  'chapter',
  'chapters',
  'antes',
  'before',
  'despues',
  'hasta',
  'until',
  'revela',
  'reveal',
  'revelar',
  'reveals',
  'real',
  'no',
  'not',
  'sabe',
  'know',
  'knows',
  'conoce',
  'understands',
  'aware',
  'desconoce',
  'ignora',
  'cree',
  'believes',
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

function canonicalizeMaterialToken(value: string): string {
  const normalized = normalizeToken(value).replace(/[^a-z0-9]+/g, ' ').trim();
  if (!normalized) {
    return '';
  }
  return MATERIAL_CANONICAL_TOKEN_MAP.get(normalized) ?? normalized;
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

interface ObjectMaterialRule {
  id: string;
  objectToken: string;
  materialToken: string;
  sourceLine: string;
  characterLabel: string;
  normalizedCharacterTerms: string[];
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

function extractLimbConstraints(storyBible: StoryBible, patterns: ContinuityLanguagePatterns): LimbConstraint[] {
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
        if (!patterns.injuryWordPattern.test(chunk.normalized)) {
          continue;
        }

        const limbMatch = chunk.normalized.match(patterns.limbWordPattern);
        const sideMatch = chunk.normalized.match(patterns.sideWordPattern);
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

function detectLimbInconsistencies(
  chapterText: string,
  storyBible: StoryBible,
  patterns: ContinuityLanguagePatterns,
): ContinuityIssue[] {
  const issues: ContinuityIssue[] = [];
  const constraints = extractLimbConstraints(storyBible, patterns);
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

    const normalizedLimb = normalizeToken(constraint.limb);
    const normalizedSide = normalizeToken(constraint.side);
    const isArmFamily = patterns.armLimbPrefixes.some((prefix) => normalizedLimb.startsWith(prefix));
    const isLegFamily = patterns.legLimbPrefixes.some((prefix) => normalizedLimb.startsWith(prefix));
    const isRightSide = patterns.rightSidePrefixes.some((prefix) => normalizedSide.startsWith(prefix));
    const isLeftSide = patterns.leftSidePrefixes.some((prefix) => normalizedSide.startsWith(prefix));

    const limbPattern = isArmFamily
      ? patterns.armFamilyPattern
      : isLegFamily
        ? patterns.legPattern
        : escapeRegExp(normalizedLimb);
    const sidePattern = isRightSide
      ? patterns.rightSidePattern
      : isLeftSide
        ? patterns.leftSidePattern
        : escapeRegExp(normalizedSide);
    const limbSidePattern = new RegExp(
      `\\b(?:${limbPattern}\\s+${sidePattern}|${sidePattern}\\s+${limbPattern})\\b`,
      'u',
    );

    for (const chunk of chapterChunks) {
      const referencesCharacter = normalizedCharacterTerms.some((term) => containsNormalizedTerm(chunk.normalized, term));
      if (!referencesCharacter) {
        continue;
      }

      if (!limbSidePattern.test(chunk.normalized)) {
        continue;
      }

      if (!patterns.limbActionPattern.test(chunk.normalized)) {
        continue;
      }

      if (patterns.inabilityPattern.test(chunk.normalized)) {
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

function parseRevealRuleChapterLimit(normalizedLine: string, patterns: ContinuityLanguagePatterns): number | null {
  const untilMatch = normalizedLine.match(patterns.untilChapterPattern);
  if (untilMatch) {
    const parsed = Number.parseInt(untilMatch[1] ?? '', 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  const beforeMatch = normalizedLine.match(patterns.beforeChapterPattern);
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
  patterns: ContinuityLanguagePatterns,
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
        if (!referencesCharacter || !patterns.revealRestrictionPattern.test(normalizedLine)) {
          return null;
        }

        return {
          line,
          limitChapter: parseRevealRuleChapterLimit(normalizedLine, patterns),
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
      if (!patterns.revealMentionPattern.test(chunk.normalized)) {
        continue;
      }

      if (patterns.revealNegationPattern.test(chunk.normalized)) {
        continue;
      }

      if (patterns.unreliableNarrationPattern.test(chunk.normalized)) {
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
  patterns: ContinuityLanguagePatterns,
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
        if (!referencesCharacter || !patterns.knowledgeRestrictionPattern.test(normalizedLine)) {
          return null;
        }

        return {
          line,
          limitChapter: parseRevealRuleChapterLimit(normalizedLine, patterns),
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
          !patterns.knowledgeAssertionPattern.test(chunk.normalized) &&
          !patterns.knowledgeImplicitAssertionPattern.test(chunk.normalized)
        ) {
          continue;
        }

        const referencesCharacter = normalizedCharacterTerms.some((term) => containsNormalizedTerm(chunk.normalized, term));
        if (!referencesCharacter) {
          continue;
        }

        if (patterns.unreliableNarrationPattern.test(chunk.normalized)) {
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

function buildKnowledgeRules(storyBible: StoryBible, patterns: ContinuityLanguagePatterns): KnowledgeRule[] {
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
      if (!referencesCharacter || !patterns.knowledgeRestrictionPattern.test(normalizedLine)) {
        continue;
      }

      rules.push({
        character,
        normalizedCharacterTerms,
        limitChapter: parseRevealRuleChapterLimit(normalizedLine, patterns),
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
  patterns: ContinuityLanguagePatterns,
  chapterNumber?: number | null,
  priorChapterTexts?: string[] | null,
): ContinuityIssue[] {
  const rules = buildKnowledgeRules(storyBible, patterns);
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
        !patterns.knowledgeAssertionPattern.test(chunk.normalized) &&
        !patterns.knowledgeImplicitAssertionPattern.test(chunk.normalized)
      ) {
        continue;
      }

      if (patterns.unreliableNarrationPattern.test(chunk.normalized)) {
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

      if (!patterns.knowledgeRestrictionPattern.test(chunk.normalized)) {
        continue;
      }

      if (patterns.unreliableNarrationPattern.test(chunk.normalized)) {
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

function buildObjectMaterialRules(storyBible: StoryBible): ObjectMaterialRule[] {
  const continuityLines = storyBible.continuityRules
    .split(/\n+/g)
    .map((line) => line.trim())
    .filter(Boolean);
  if (continuityLines.length === 0) {
    return [];
  }

  const rules: ObjectMaterialRule[] = [];

  for (const line of continuityLines) {
    const normalizedLine = normalizeToken(line);
    const lineTokens = tokenizeSemanticText(line);
    const objectToken = lineTokens.find((token) => OBJECT_IDENTITY_TOKENS.has(token));
    const materialToken = lineTokens
      .map((token) => canonicalizeMaterialToken(token))
      .find((token) => MATERIAL_CANONICAL_SET.has(token));
    if (!objectToken || !materialToken) {
      continue;
    }

    const referencedCharacters = storyBible.characters
      .filter((character) => normalizeCanonStatus(character.canonStatus) === 'canonical')
      .map((character) => ({
        character,
        normalizedTerms: buildEntityTerms(character.name, character.aliases)
          .map((term) => normalizeToken(term))
          .filter(Boolean),
      }))
      .filter(({ normalizedTerms }) =>
        normalizedTerms.some((term) => term && containsNormalizedTerm(normalizedLine, term)),
      );

    if (referencedCharacters.length === 0) {
      rules.push({
        id: `object-material-${normalizeToken(line).slice(0, 36)}`,
        objectToken,
        materialToken,
        sourceLine: line,
        characterLabel: '',
        normalizedCharacterTerms: [],
      });
      continue;
    }

    for (const entry of referencedCharacters) {
      rules.push({
        id: `object-material-${entry.character.id}-${normalizeToken(line).slice(0, 28)}`,
        objectToken,
        materialToken,
        sourceLine: line,
        characterLabel: entry.character.name || entry.character.id,
        normalizedCharacterTerms: entry.normalizedTerms,
      });
    }
  }

  return rules;
}

function detectObjectMaterialInconsistencies(
  chapterText: string,
  storyBible: StoryBible,
  patterns: ContinuityLanguagePatterns,
): ContinuityIssue[] {
  const rules = buildObjectMaterialRules(storyBible);
  if (rules.length === 0) {
    return [];
  }

  const chapterChunks = splitSentenceChunks(chapterText);
  const issues: ContinuityIssue[] = [];

  for (const rule of rules) {
    for (const chunk of chapterChunks) {
      if (patterns.unreliableNarrationPattern.test(chunk.normalized)) {
        continue;
      }

      if (rule.normalizedCharacterTerms.length > 0) {
        const referencesCharacter = rule.normalizedCharacterTerms.some(
          (term) => term && containsNormalizedTerm(chunk.normalized, term),
        );
        if (!referencesCharacter) {
          continue;
        }
      }

      const chunkTokens = tokenizeSemanticText(chunk.normalized);
      if (!chunkTokens.includes(rule.objectToken)) {
        continue;
      }

      const materialMentions = Array.from(
        new Set(
          chunkTokens
            .map((token) => canonicalizeMaterialToken(token))
            .filter((token) => MATERIAL_CANONICAL_SET.has(token)),
        ),
      );
      if (materialMentions.length === 0 || materialMentions.includes(rule.materialToken)) {
        continue;
      }

      const detectedMaterial = materialMentions[0];
      issues.push({
        id: `${rule.id}-${rule.objectToken}-${detectedMaterial}`,
        severity: 'warning',
        message: rule.characterLabel
          ? `${rule.characterLabel}: posible inconsistencia material en ${rule.objectToken}; biblia sugiere ${rule.materialToken} y aparece ${detectedMaterial}.`
          : `Posible inconsistencia material en ${rule.objectToken}; biblia sugiere ${rule.materialToken} y aparece ${detectedMaterial}.`,
        evidence: `${chunk.raw} | Regla: ${rule.sourceLine}`,
      });
      break;
    }
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

  const patterns = resolveLanguagePatterns(input.language);
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
    ...detectRevealInconsistencies(chapterText, input.storyBible, patterns, input.chapterNumber),
    ...detectKnowledgeInconsistencies(chapterText, input.storyBible, patterns, input.chapterNumber),
    ...detectKnowledgeRegressionInconsistencies(
      chapterText,
      input.storyBible,
      patterns,
      input.chapterNumber,
      input.priorChapterTexts,
    ),
    ...detectObjectMaterialInconsistencies(chapterText, input.storyBible, patterns),
    ...detectLimbInconsistencies(chapterText, input.storyBible, patterns),
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
