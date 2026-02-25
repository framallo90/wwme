import { getChapterLengthInstruction } from './chapterLength';
import { getLanguageInstruction } from './language';
import type { AiAction, AiActionId, BookFoundation, ChapterLengthPreset, StoryBible } from '../types/book';

export const DEFAULT_SYSTEM_PROMPT = `Sos un editor literario experto. Tu tono debe ser intimo, sobrio y reflexivo. No uses estilo de autoayuda ni new age.
No pidas confirmaciones ni hagas preguntas: aplica los cambios directamente.
No agregues relleno ni explicaciones innecesarias.
Si el cambio es grande, igual hacelo y al final agrega exactamente 5 bullets con resumen de cambios.
Devolve solo el texto final (y el resumen cuando corresponda).`;

export const AI_ACTIONS: AiAction[] = [
  {
    id: 'draft-from-idea',
    label: 'Escribir desde idea',
    description: 'Crea o rehace un borrador guiado por la base del libro.',
    modifiesText: true,
  },
  {
    id: 'polish-style',
    label: 'Pulir estilo',
    description: 'Mejora claridad, ritmo y elimina repeticion.',
    modifiesText: true,
  },
  {
    id: 'rewrite-tone',
    label: 'Reescribir tono',
    description: 'Reescribe manteniendo voz y enfoque.',
    modifiesText: true,
  },
  {
    id: 'expand-examples',
    label: 'Expandir ejemplos',
    description: 'Amplia con ejemplos concretos y utiles.',
    modifiesText: true,
  },
  {
    id: 'shorten-20',
    label: 'Acortar 20%',
    description: 'Reduce longitud sin perder contenido clave.',
    modifiesText: true,
  },
  {
    id: 'consistency',
    label: 'Consistencia',
    description: 'Unifica terminologia, metaforas y voz narrativa.',
    modifiesText: true,
  },
  {
    id: 'improve-transitions',
    label: 'Mejorar transiciones',
    description: 'Ajusta continuidad y enlaces entre parrafos.',
    modifiesText: true,
  },
  {
    id: 'deepen-argument',
    label: 'Profundizar argumento',
    description: 'Aumenta densidad conceptual sin perder claridad.',
    modifiesText: true,
  },
  {
    id: 'align-with-foundation',
    label: 'Alinear con base',
    description: 'Ajusta el texto para respetar la base fija del libro.',
    modifiesText: true,
  },
  {
    id: 'feedback-chapter',
    label: 'Devolucion capitulo',
    description: 'Feedback editorial detallado del capitulo.',
    modifiesText: false,
  },
  {
    id: 'feedback-book',
    label: 'Devolucion libro',
    description: 'Analisis global de coherencia y mejoras.',
    modifiesText: false,
  },
];

const ACTION_INSTRUCTIONS: Record<AiActionId, string> = {
  'draft-from-idea':
    'Escribir o reescribir el capitulo desde la idea base del libro, manteniendo tono y direccion narrativa.',
  'polish-style':
    'Pulir estilo manteniendo significado. Mejora claridad, ritmo y elimina repeticiones.',
  'rewrite-tone':
    'Reescribir manteniendo tono y voz del autor. Evita tecnicismos innecesarios.',
  'expand-examples':
    'Expandir el contenido con ejemplos concretos y naturales, sin desviarte del tema.',
  'shorten-20':
    'Acortar aproximadamente un 20% manteniendo ideas principales y fluidez.',
  consistency:
    'Corregir inconsistencias de terminologia, metaforas y voz narrativa de forma uniforme.',
  'improve-transitions':
    'Mejorar transiciones entre ideas y parrafos para lograr lectura fluida y cohesion.',
  'deepen-argument':
    'Profundizar el argumento con matices y mayor precision conceptual sin extender innecesariamente.',
  'align-with-foundation':
    'Reescribir para alinear estrictamente con la base del libro: idea central, promesa, voz y reglas de estilo.',
  'feedback-chapter':
    'Dar devolucion editorial del capitulo: fortalezas, debilidades, coherencia y mejoras accionables.',
  'feedback-book':
    'Dar devolucion editorial del libro completo: estructura, arco narrativo, coherencia, ritmo y mejoras accionables.',
};

export function buildFoundationBlock(foundation: BookFoundation): string {
  return [
    'Base fija del libro:',
    `- Idea central: ${foundation.centralIdea || '(sin definir)'}`,
    `- Promesa: ${foundation.promise || '(sin definir)'}`,
    `- Audiencia: ${foundation.audience || '(sin definir)'}`,
    `- Voz narrativa: ${foundation.narrativeVoice || '(sin definir)'}`,
    `- Reglas de estilo: ${foundation.styleRules || '(sin definir)'}`,
    `- Notas de estructura: ${foundation.structureNotes || '(sin definir)'}`,
    `- Glosario preferido: ${foundation.glossaryPreferred || '(sin definir)'}`,
    `- Glosario a evitar: ${foundation.glossaryAvoid || '(sin definir)'}`,
  ].join('\n');
}

function compactStoryValue(value: string): string {
  const trimmed = value.trim();
  return trimmed || '(sin definir)';
}

const STORY_TOKEN_PATTERN = /[\p{L}\p{N}']+/gu;
const STORY_STOPWORDS = new Set<string>([
  'a',
  'al',
  'algo',
  'and',
  'con',
  'como',
  'de',
  'del',
  'el',
  'en',
  'es',
  'for',
  'la',
  'las',
  'lo',
  'los',
  'of',
  'para',
  'por',
  'que',
  'se',
  'sin',
  'the',
  'to',
  'un',
  'una',
  'y',
]);

function normalizeToken(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function extractStoryTokens(value: string): string[] {
  const raw = value.match(STORY_TOKEN_PATTERN);
  if (!raw) {
    return [];
  }

  return raw
    .map(normalizeToken)
    .filter((token) => token.length >= 3 && !STORY_STOPWORDS.has(token));
}

function parseAliasList(value: string): string[] {
  return value
    .split(/[,\n;|]+/g)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function scoreStoryEntry(
  name: string,
  aliases: string,
  allText: string,
  queryText: string,
  queryTokens: Set<string>,
  recentText: string,
  recentTokens: Set<string>,
  recencyWeight: number,
): number {
  let score = 0;
  const normalizedName = normalizeToken(name);
  if (normalizedName && queryText.includes(normalizedName)) {
    score += 60;
  }
  if (normalizedName && recentText.includes(normalizedName)) {
    score += Math.round(42 * recencyWeight);
  }

  for (const alias of parseAliasList(aliases)) {
    const normalizedAlias = normalizeToken(alias);
    if (normalizedAlias && queryText.includes(normalizedAlias)) {
      score += 40;
    }
    if (normalizedAlias && recentText.includes(normalizedAlias)) {
      score += Math.round(30 * recencyWeight);
    }
  }

  for (const token of new Set(extractStoryTokens(allText))) {
    if (queryTokens.has(token)) {
      score += 4;
    }
    if (recentTokens.has(token)) {
      score += Math.round(6 * recencyWeight);
    }
  }

  return score;
}

function pickRelevantEntries<T>(
  entries: T[],
  queryText: string,
  maxItems: number,
  getName: (entry: T) => string,
  getAliases: (entry: T) => string,
  getAllText: (entry: T) => string,
  recentText: string,
  recencyWeight: number,
): T[] {
  if (entries.length <= maxItems) {
    return entries;
  }

  const normalizedQuery = normalizeToken(queryText);
  const queryTokens = new Set(extractStoryTokens(queryText));
  const normalizedRecent = normalizeToken(recentText);
  const recentTokens = new Set(extractStoryTokens(recentText));
  const scored = entries.map((entry, index) => ({
    entry,
    index,
    score: scoreStoryEntry(
      getName(entry),
      getAliases(entry),
      getAllText(entry),
      normalizedQuery,
      queryTokens,
      normalizedRecent,
      recentTokens,
      recencyWeight,
    ),
  }));

  const withMatches = scored
    .filter((item) => item.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.index - right.index;
    })
    .slice(0, maxItems)
    .map((item) => item.entry);

  if (withMatches.length > 0) {
    return withMatches;
  }

  return entries.slice(0, maxItems);
}

interface StoryBibleSelectionOptions {
  maxCharacters?: number;
  maxLocations?: number;
  recentText?: string;
  recencyWeight?: number;
}

export function selectStoryBibleForPrompt(
  storyBible: StoryBible,
  queryText: string,
  options?: StoryBibleSelectionOptions,
): StoryBible {
  const maxCharacters = Math.max(1, options?.maxCharacters ?? 6);
  const maxLocations = Math.max(1, options?.maxLocations ?? 6);
  const recentText = options?.recentText ?? '';
  const recencyWeight = Math.min(2, Math.max(0, options?.recencyWeight ?? 1));

  return {
    continuityRules: storyBible.continuityRules,
    characters: pickRelevantEntries(
      storyBible.characters,
      queryText,
      maxCharacters,
      (entry) => entry.name,
      (entry) => entry.aliases,
      (entry) => `${entry.name} ${entry.aliases} ${entry.role} ${entry.traits} ${entry.goal} ${entry.notes}`,
      recentText,
      recencyWeight,
    ),
    locations: pickRelevantEntries(
      storyBible.locations,
      queryText,
      maxLocations,
      (entry) => entry.name,
      (entry) => entry.aliases,
      (entry) => `${entry.name} ${entry.aliases} ${entry.description} ${entry.atmosphere} ${entry.notes}`,
      recentText,
      recencyWeight,
    ),
  };
}

export function buildStoryBibleBlock(storyBible: StoryBible): string {
  const hasCharacters = storyBible.characters.length > 0;
  const hasLocations = storyBible.locations.length > 0;
  const hasContinuity = storyBible.continuityRules.trim().length > 0;

  if (!hasCharacters && !hasLocations && !hasContinuity) {
    return 'Biblia de la historia:\n- (sin definir)';
  }

  const lines: string[] = ['Biblia de la historia:'];
  if (hasContinuity) {
    lines.push(`- Reglas de continuidad: ${compactStoryValue(storyBible.continuityRules)}`);
  }

  if (hasCharacters) {
    lines.push('- Personajes clave:');
    for (const entry of storyBible.characters.slice(0, 12)) {
      lines.push(
        `  - ${compactStoryValue(entry.name)} | alias: ${compactStoryValue(entry.aliases)} | rol: ${compactStoryValue(entry.role)} | rasgos: ${compactStoryValue(entry.traits)} | objetivo: ${compactStoryValue(entry.goal)} | notas: ${compactStoryValue(entry.notes)}`,
      );
    }
  }

  if (hasLocations) {
    lines.push('- Lugares clave:');
    for (const entry of storyBible.locations.slice(0, 12)) {
      lines.push(
        `  - ${compactStoryValue(entry.name)} | alias: ${compactStoryValue(entry.aliases)} | descripcion: ${compactStoryValue(entry.description)} | atmosfera: ${compactStoryValue(entry.atmosphere)} | notas: ${compactStoryValue(entry.notes)}`,
      );
    }
  }

  return lines.join('\n');
}

interface BuildActionPromptInput {
  actionId: AiActionId;
  selectedText: string;
  ideaText?: string;
  chapterTitle: string;
  bookTitle: string;
  language: string;
  foundation: BookFoundation;
  storyBible: StoryBible;
  chapterLengthPreset?: ChapterLengthPreset;
  chapterContext?: string;
  fullBookContext?: string;
}

export function buildActionPrompt(input: BuildActionPromptInput): string {
  const instruction = ACTION_INSTRUCTIONS[input.actionId];
  const target = input.selectedText.trim();
  const ideaText = input.ideaText?.trim() ?? '';
  const foundationBlock = buildFoundationBlock(input.foundation);
  const storyBibleBlock = buildStoryBibleBlock(input.storyBible);
  const chapterLengthInstruction = getChapterLengthInstruction(input.chapterLengthPreset);
  const languageInstruction = getLanguageInstruction(input.language);

  if (input.actionId === 'feedback-book') {
    return [
      `Libro: ${input.bookTitle}`,
      foundationBlock,
      storyBibleBlock,
      languageInstruction,
      `Accion: ${instruction}`,
      '',
      'Contenido del libro:',
      input.fullBookContext ?? '',
    ].join('\n');
  }

  if (input.actionId === 'feedback-chapter') {
    return [
      `Libro: ${input.bookTitle}`,
      `Capitulo: ${input.chapterTitle}`,
      foundationBlock,
      storyBibleBlock,
      languageInstruction,
      chapterLengthInstruction,
      `Accion: ${instruction}`,
      '',
      'Contenido del capitulo:',
      input.chapterContext ?? target,
    ].join('\n');
  }

  if (input.actionId === 'draft-from-idea') {
    return [
      `Libro: ${input.bookTitle}`,
      `Capitulo: ${input.chapterTitle}`,
      foundationBlock,
      storyBibleBlock,
      languageInstruction,
      chapterLengthInstruction,
      `Accion: ${instruction}`,
      '',
      'Idea del usuario para este capitulo:',
      ideaText || '(sin idea explicita)',
      '',
      'Texto actual del capitulo (si existe):',
      input.chapterContext ?? '(vacio)',
      '',
      'Si el texto actual esta vacio, generar un borrador completo. Si no esta vacio, rehacerlo y mejorarlo.',
    ].join('\n');
  }

  return [
    `Libro: ${input.bookTitle}`,
    `Capitulo: ${input.chapterTitle}`,
    foundationBlock,
    storyBibleBlock,
    languageInstruction,
    chapterLengthInstruction,
    `Accion: ${instruction}`,
    '',
    'Texto objetivo:',
    target,
  ].join('\n');
}

interface BuildChatPromptInput {
  scope: 'chapter' | 'book';
  message: string;
  bookTitle: string;
  language: string;
  foundation: BookFoundation;
  storyBible: StoryBible;
  bookLengthInstruction?: string;
  chapterTitle?: string;
  chapterLengthPreset?: ChapterLengthPreset;
  chapterText: string;
  fullBookText: string;
  compactHistory: string;
}

interface BuildAutoRewritePromptInput {
  userInstruction: string;
  bookTitle: string;
  language: string;
  foundation: BookFoundation;
  storyBible: StoryBible;
  chapterTitle: string;
  chapterLengthPreset?: ChapterLengthPreset;
  chapterText: string;
  fullBookText: string;
  chapterIndex: number;
  chapterTotal: number;
  iteration: number;
  totalIterations: number;
}

interface BuildContinuousChapterPromptInput {
  userInstruction: string;
  bookTitle: string;
  language: string;
  foundation: BookFoundation;
  storyBible: StoryBible;
  chapterTitle: string;
  chapterLengthPreset?: ChapterLengthPreset;
  chapterText: string;
  fullBookText: string;
  round: number;
  maxRounds: number;
  previousSummary?: string;
}

interface BuildContinuityGuardPromptInput {
  userInstruction: string;
  bookTitle: string;
  language: string;
  foundation: BookFoundation;
  storyBible: StoryBible;
  chapterTitle: string;
  originalText: string;
  candidateText: string;
}

export function buildChatPrompt(input: BuildChatPromptInput): string {
  const chapterLengthInstruction =
    input.scope === 'chapter' ? getChapterLengthInstruction(input.chapterLengthPreset) : null;
  const bookLengthInstruction = input.scope === 'book' ? input.bookLengthInstruction?.trim() : '';
  const languageInstruction = getLanguageInstruction(input.language);

  return [
    `Libro: ${input.bookTitle}`,
    buildFoundationBlock(input.foundation),
    buildStoryBibleBlock(input.storyBible),
    languageInstruction,
    ...(bookLengthInstruction ? [`Longitud objetivo del libro: ${bookLengthInstruction}`] : []),
    input.chapterTitle ? `Capitulo activo: ${input.chapterTitle}` : 'Sin capitulo activo',
    ...(chapterLengthInstruction ? [chapterLengthInstruction] : []),
    '',
    input.scope === 'book' ? 'Contexto global del libro:' : 'Contexto del capitulo:',
    input.scope === 'book' ? input.fullBookText : input.chapterText,
    '',
    'Historial reciente:',
    input.compactHistory || '(vacio)',
    '',
    'Mensaje actual del usuario:',
    input.message,
  ].join('\n');
}

export function buildAutoRewritePrompt(input: BuildAutoRewritePromptInput): string {
  return [
    'MODO: reescritura automatica sin pedir confirmaciones.',
    `Libro: ${input.bookTitle}`,
    getLanguageInstruction(input.language),
    buildFoundationBlock(input.foundation),
    buildStoryBibleBlock(input.storyBible),
    `Capitulo: ${input.chapterTitle} (${input.chapterIndex}/${input.chapterTotal})`,
    getChapterLengthInstruction(input.chapterLengthPreset),
    `Iteracion: ${input.iteration}/${input.totalIterations}`,
    '',
    'Instruccion del usuario:',
    input.userInstruction,
    '',
    'Contexto del libro completo:',
    input.fullBookText,
    '',
    'Texto actual del capitulo a modificar:',
    input.chapterText,
    '',
    'Reglas de salida:',
    '- Aplica los cambios directamente.',
    '- No pidas confirmacion.',
    '- Devuelve solo el texto final del capitulo.',
  ].join('\n');
}

export function buildContinuousChapterPrompt(input: BuildContinuousChapterPromptInput): string {
  return [
    'MODO: agente continuo para capitulo, sin pedir confirmaciones.',
    `Libro: ${input.bookTitle}`,
    getLanguageInstruction(input.language),
    buildFoundationBlock(input.foundation),
    buildStoryBibleBlock(input.storyBible),
    `Capitulo: ${input.chapterTitle}`,
    getChapterLengthInstruction(input.chapterLengthPreset),
    `Ronda: ${input.round}/${input.maxRounds}`,
    '',
    'Instruccion del usuario:',
    input.userInstruction,
    '',
    'Contexto del libro completo:',
    input.fullBookText,
    '',
    'Texto actual del capitulo:',
    input.chapterText,
    '',
    'Resumen previo (si existe):',
    input.previousSummary ?? '(sin resumen previo)',
    '',
    'Salida obligatoria con este formato exacto:',
    'ESTADO: DONE o CONTINUE',
    'RESUMEN: breve',
    'TEXTO:',
    '<texto final del capitulo>',
  ].join('\n');
}

export function buildContinuityGuardPrompt(input: BuildContinuityGuardPromptInput): string {
  return [
    'MODO: bloqueo de continuidad narrativa previo a guardado.',
    `Libro: ${input.bookTitle}`,
    `Capitulo: ${input.chapterTitle}`,
    getLanguageInstruction(input.language),
    buildFoundationBlock(input.foundation),
    buildStoryBibleBlock(input.storyBible),
    '',
    'Instruccion original del usuario:',
    input.userInstruction.trim() || '(sin instruccion explicita)',
    '',
    'Texto previo del capitulo (referencia):',
    input.originalText.trim() || '(vacio)',
    '',
    'Texto candidato para guardar:',
    input.candidateText.trim() || '(vacio)',
    '',
    'Tarea:',
    '- Detecta contradicciones con continuidad, personajes y lugares.',
    '- Si NO hay contradicciones, conserva EXACTAMENTE el texto candidato.',
    '- Si SI hay contradicciones, corrige con cambios minimos y conserva intencion.',
    '',
    'Salida obligatoria exacta:',
    'ESTADO: PASS o FAIL',
    'RAZON: breve',
    'TEXTO:',
    '<texto final listo para guardar>',
  ].join('\n');
}

export interface ContinuityGuardOutput {
  status: 'PASS' | 'FAIL';
  reason: string;
  text: string;
}

export function parseContinuityGuardOutput(raw: string): ContinuityGuardOutput {
  const normalized = raw.trim();
  const statusMatch = normalized.match(/ESTADO:\s*(PASS|FAIL)/i);
  const reasonMatch = normalized.match(/RAZON:\s*(.*)/i);
  const textMatch = normalized.match(/TEXTO:\s*([\s\S]*)$/i);

  return {
    status: (statusMatch?.[1]?.toUpperCase() as ContinuityGuardOutput['status'] | undefined) ?? 'PASS',
    reason: reasonMatch?.[1]?.trim() ?? '',
    text: textMatch?.[1]?.trim() || normalized,
  };
}
