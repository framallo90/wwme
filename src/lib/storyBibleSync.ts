import type { ChapterDocument, StoryBible, StoryCharacter, StoryLocation } from '../types/book';
import { stripHtml } from './text';

const ENTITY_PATTERN =
  /\b([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+(?:de|del|la|las|los|y|e)\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+|\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){0,2})\b/g;
const WORD_PATTERN = /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+/g;

const CONNECTOR_WORDS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e']);
const COMMON_NON_ENTITY_WORDS = new Set([
  'abril',
  'agosto',
  'ahi',
  'aqui',
  'ayer',
  'capitulo',
  'diciembre',
  'el',
  'ella',
  'ellos',
  'enero',
  'esta',
  'este',
  'febrero',
  'hoy',
  'julio',
  'junio',
  'la',
  'las',
  'lunes',
  'martes',
  'marzo',
  'mayo',
  'miercoles',
  'jueves',
  'viernes',
  'noviembre',
  'octubre',
  'para',
  'pero',
  'por',
  'sabado',
  'domingo',
  'septiembre',
  'si',
  'sin',
  'texto',
  'tu',
  'un',
  'una',
  'yo',
]);

const LOCATION_CONTEXT_WORDS = new Set([
  'en',
  'desde',
  'hasta',
  'hacia',
  'sobre',
  'bajo',
  'junto',
  'frente',
  'dentro',
  'fuera',
  'ciudad',
  'pueblo',
  'barrio',
  'calle',
  'avenida',
  'plaza',
  'puerto',
  'isla',
  'bosque',
  'montana',
  'monte',
  'palacio',
  'castillo',
  'faro',
  'costa',
  'bahia',
  'mar',
  'rio',
  'bar',
  'cafe',
  'hotel',
  'hospital',
  'escuela',
  'universidad',
  'estacion',
]);

const LOCATION_NAME_WORDS = new Set([
  'avenida',
  'bahia',
  'bar',
  'barrio',
  'bosque',
  'cafe',
  'calle',
  'campamento',
  'castillo',
  'costa',
  'estacion',
  'faro',
  'hospital',
  'hotel',
  'isla',
  'mar',
  'mercado',
  'monte',
  'montana',
  'palacio',
  'parque',
  'plaza',
  'puente',
  'puerto',
  'rio',
  'teatro',
  'torre',
  'universidad',
]);

const CHARACTER_CONTEXT_WORDS = new Set([
  'don',
  'dona',
  'senor',
  'senora',
  'sr',
  'sra',
  'doctor',
  'doctora',
  'capitan',
  'comisario',
  'reina',
  'rey',
  'princesa',
  'principe',
  'agente',
  'teniente',
  'hermano',
  'hermana',
  'madre',
  'padre',
  'hija',
  'hijo',
]);

let autoEntryCounter = 0;

interface CandidateInfo {
  name: string;
  normalized: string;
  significantWords: string[];
  occurrences: number;
  locationHints: number;
  characterHints: number;
  hasLocationKeyword: boolean;
}

export interface StoryBibleAutoSyncResult {
  nextStoryBible: StoryBible;
  addedCharacters: StoryCharacter[];
  addedLocations: StoryLocation[];
}

interface StoryBibleAutoSyncOptions {
  maxCharactersToAdd?: number;
  maxLocationsToAdd?: number;
}

function normalizeToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normalizeEntityName(value: string): string {
  return normalizeToken(value).replace(/\s+/g, ' ').trim();
}

function parseAliasList(value: string): string[] {
  return value
    .split(/[,\n;|]+/g)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function extractWords(value: string): string[] {
  return value.match(WORD_PATTERN) ?? [];
}

function getSignificantWords(entityName: string): string[] {
  return extractWords(entityName).filter((word) => !CONNECTOR_WORDS.has(normalizeToken(word)));
}

function shouldIgnoreEntity(entityName: string): boolean {
  const significant = getSignificantWords(entityName);
  if (significant.length === 0 || significant.length > 4) {
    return true;
  }

  const normalizedWords = significant.map((word) => normalizeToken(word));
  if (normalizedWords.some((word) => word.length < 2)) {
    return true;
  }

  if (normalizedWords.length === 1 && COMMON_NON_ENTITY_WORDS.has(normalizedWords[0])) {
    return true;
  }

  if (normalizedWords.every((word) => COMMON_NON_ENTITY_WORDS.has(word))) {
    return true;
  }

  return false;
}

function collectKnownNames(storyBible: StoryBible): string[] {
  const names: string[] = [];
  const pushValue = (value: string) => {
    const normalized = normalizeEntityName(value);
    if (!normalized) {
      return;
    }
    names.push(normalized);
  };

  for (const entry of storyBible.characters) {
    pushValue(entry.name);
    for (const alias of parseAliasList(entry.aliases)) {
      pushValue(alias);
    }
  }

  for (const entry of storyBible.locations) {
    pushValue(entry.name);
    for (const alias of parseAliasList(entry.aliases)) {
      pushValue(alias);
    }
  }

  return names;
}

function isAlreadyKnown(entityName: string, knownNames: string[]): boolean {
  const normalized = normalizeEntityName(entityName);
  if (!normalized) {
    return true;
  }

  for (const known of knownNames) {
    if (!known) {
      continue;
    }
    if (known === normalized) {
      return true;
    }
    if (known.length >= 3 && (known.includes(normalized) || normalized.includes(known))) {
      return true;
    }
  }

  return false;
}

function extractContextWords(sourceText: string, start: number, end: number): string[] {
  const before = sourceText.slice(Math.max(0, start - 50), start);
  const after = sourceText.slice(end, Math.min(sourceText.length, end + 50));
  const rawWords = `${before} ${after}`.match(WORD_PATTERN) ?? [];
  return rawWords.map((word) => normalizeToken(word));
}

function scoreCandidate(candidate: CandidateInfo): number {
  let score = candidate.occurrences * 10;
  score += candidate.locationHints * 6;
  score += candidate.characterHints * 6;
  if (candidate.significantWords.length >= 2) {
    score += 4;
  }
  if (candidate.hasLocationKeyword) {
    score += 5;
  }
  return score;
}

function createAutoEntryId(prefix: 'char' | 'loc'): string {
  autoEntryCounter += 1;
  return `${prefix}-auto-${Date.now().toString(36)}-${autoEntryCounter.toString(36)}`;
}

function classifyCandidate(candidate: CandidateInfo): 'character' | 'location' | null {
  const hasLocationSignal = candidate.hasLocationKeyword || candidate.locationHints > 0;
  const hasCharacterSignal = candidate.characterHints > 0;
  const isMultiWord = candidate.significantWords.length >= 2;
  const hasFrequency = candidate.occurrences >= 2;

  if (!hasFrequency && !hasLocationSignal && !hasCharacterSignal && !isMultiWord) {
    return null;
  }

  if (hasLocationSignal && !hasCharacterSignal) {
    return 'location';
  }

  if (hasCharacterSignal && !hasLocationSignal) {
    return 'character';
  }

  if (hasLocationSignal && hasCharacterSignal) {
    return candidate.hasLocationKeyword ? 'location' : 'character';
  }

  return candidate.hasLocationKeyword ? 'location' : 'character';
}

function buildCandidateMap(sourceText: string): CandidateInfo[] {
  const candidates = new Map<string, CandidateInfo>();

  for (const match of sourceText.matchAll(ENTITY_PATTERN)) {
    const rawEntity = match[1]?.replace(/\s+/g, ' ').trim();
    const start = match.index ?? -1;
    if (!rawEntity || start < 0) {
      continue;
    }
    if (shouldIgnoreEntity(rawEntity)) {
      continue;
    }

    const normalized = normalizeEntityName(rawEntity);
    const significantWords = getSignificantWords(rawEntity);
    if (!normalized || significantWords.length === 0) {
      continue;
    }

    const contextWords = extractContextWords(sourceText, start, start + rawEntity.length);
    const locationHints = contextWords.filter((word) => LOCATION_CONTEXT_WORDS.has(word)).length;
    const characterHints = contextWords.filter((word) => CHARACTER_CONTEXT_WORDS.has(word)).length;
    const hasLocationKeyword = significantWords.some((word) => LOCATION_NAME_WORDS.has(normalizeToken(word)));

    const existing = candidates.get(normalized);
    if (existing) {
      existing.occurrences += 1;
      existing.locationHints += locationHints;
      existing.characterHints += characterHints;
      existing.hasLocationKeyword = existing.hasLocationKeyword || hasLocationKeyword;
      continue;
    }

    candidates.set(normalized, {
      name: rawEntity,
      normalized,
      significantWords,
      occurrences: 1,
      locationHints,
      characterHints,
      hasLocationKeyword,
    });
  }

  return Array.from(candidates.values());
}

export function buildStoryBibleAutoSyncFromChapter(
  storyBible: StoryBible,
  chapter: Pick<ChapterDocument, 'id' | 'title' | 'content'>,
  options?: StoryBibleAutoSyncOptions,
): StoryBibleAutoSyncResult {
  const chapterText = stripHtml(chapter.content).replace(/\s+/g, ' ').trim();
  if (!chapterText) {
    return {
      nextStoryBible: storyBible,
      addedCharacters: [],
      addedLocations: [],
    };
  }

  const maxCharactersToAdd = Math.max(0, options?.maxCharactersToAdd ?? 3);
  const maxLocationsToAdd = Math.max(0, options?.maxLocationsToAdd ?? 3);
  const knownNames = collectKnownNames(storyBible);
  const addedCharacters: StoryCharacter[] = [];
  const addedLocations: StoryLocation[] = [];
  const candidates = buildCandidateMap(chapterText).sort((left, right) => scoreCandidate(right) - scoreCandidate(left));

  for (const candidate of candidates) {
    if (isAlreadyKnown(candidate.normalized, knownNames)) {
      continue;
    }

    const target = classifyCandidate(candidate);
    if (target === 'location') {
      if (addedLocations.length >= maxLocationsToAdd) {
        continue;
      }
      const location: StoryLocation = {
        id: createAutoEntryId('loc'),
        name: candidate.name,
        aliases: '',
        description: '',
        atmosphere: '',
        notes: `Detectado automaticamente en ${chapter.title}. Revisar detalles del lugar.`,
      };
      addedLocations.push(location);
      knownNames.push(candidate.normalized);
      continue;
    }

    if (target === 'character') {
      if (addedCharacters.length >= maxCharactersToAdd) {
        continue;
      }
      const character: StoryCharacter = {
        id: createAutoEntryId('char'),
        name: candidate.name,
        aliases: '',
        role: '',
        traits: '',
        goal: '',
        notes: `Detectado automaticamente en ${chapter.title}. Completar rol y continuidad.`,
      };
      addedCharacters.push(character);
      knownNames.push(candidate.normalized);
    }
  }

  if (addedCharacters.length === 0 && addedLocations.length === 0) {
    return {
      nextStoryBible: storyBible,
      addedCharacters,
      addedLocations,
    };
  }

  return {
    nextStoryBible: {
      ...storyBible,
      characters: [...storyBible.characters, ...addedCharacters],
      locations: [...storyBible.locations, ...addedLocations],
    },
    addedCharacters,
    addedLocations,
  };
}
