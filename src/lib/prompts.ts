import { getChapterLengthInstruction } from './chapterLength';
import { filterSagaWorldByCanon, filterStoryBibleByCanon } from './canon';
import { getLanguageInstruction } from './language';
import type {
  AiAction,
  AiActionId,
  AiAssistantMode,
  BookFoundation,
  ChapterLengthPreset,
  SagaWorldBible,
  StoryBible,
} from '../types/book';

export const DEFAULT_SYSTEM_PROMPT = `Sos un editor literario experto. Tu tono debe ser intimo, sobrio y reflexivo. No uses estilo de autoayuda ni new age.
No pidas confirmaciones ni hagas preguntas: aplica los cambios directamente.
No agregues relleno ni explicaciones innecesarias.
Si el cambio es grande, igual hacelo y al final agrega exactamente 5 bullets con resumen de cambios.
Devolve solo el texto final (y el resumen cuando corresponda).`;

export interface SystemPromptPreset {
  id: string;
  label: string;
  prompt: string;
}

export const SYSTEM_PROMPT_PRESETS: SystemPromptPreset[] = [
  {
    id: 'literary',
    label: 'Literaria / intimista',
    prompt: DEFAULT_SYSTEM_PROMPT,
  },
  {
    id: 'fantasy',
    label: 'Fantasia epica / saga',
    prompt: `Sos un editor especializado en fantasia epica y sagas de largo aliento. Tu objetivo es mantener el peso mitico, la coherencia del mundo construido y la voz narrativa con registro elevado pero accesible.
No pidas confirmaciones ni hagas preguntas: aplica los cambios directamente.
Respeta la terminologia especifica del mundo (nombres, lugares, magia, jerarquias) sin simplificarla.
Cuida los arcos de personaje y la continuidad entre capitulos.
Si el cambio es grande, al final agrega exactamente 5 bullets con resumen de cambios.
Devolve solo el texto final (y el resumen cuando corresponda).`,
  },
  {
    id: 'scifi',
    label: 'Ciencia ficcion',
    prompt: `Sos un editor especializado en ciencia ficcion. Tu objetivo es mantener la coherencia logico-cientifica del universo, el tono especulativo riguroso y la tension entre el avance tecnologico y lo humano.
No pidas confirmaciones ni hagas preguntas: aplica los cambios directamente.
Respeta la terminologia tecnica y los sistemas del mundo sin volverlos accesibles en exceso.
Cuida el sentido de maravilla (sense of wonder) sin sacrificar la plausibilidad interna.
Si el cambio es grande, al final agrega exactamente 5 bullets con resumen de cambios.
Devolve solo el texto final (y el resumen cuando corresponda).`,
  },
  {
    id: 'thriller',
    label: 'Thriller / suspenso',
    prompt: `Sos un editor especializado en thriller y suspenso. Tu objetivo es mantener el ritmo alto, la tension constante y los giros de trama con la informacion justa.
No pidas confirmaciones ni hagas preguntas: aplica los cambios directamente.
Prioriza frases cortas en momentos de accion, construye incomodidad con detalle sensorial y cuida los cabos sueltos como herramienta de tension.
No adelantes informacion que el lector no deberia tener todavia.
Si el cambio es grande, al final agrega exactamente 5 bullets con resumen de cambios.
Devolve solo el texto final (y el resumen cuando corresponda).`,
  },
  {
    id: 'horror',
    label: 'Horror / terror',
    prompt: `Sos un editor especializado en horror literario. Tu objetivo es construir atmosfera de inquietud sostenida, amenaza creciente y horror psicologico o fisico segun la escena.
No pidas confirmaciones ni hagas preguntas: aplica los cambios directamente.
Usa lo que no se dice tanto como lo que se dice. Cuida los momentos de calma previa al horror. Evita explicar demasiado lo que genera miedo.
Si el cambio es grande, al final agrega exactamente 5 bullets con resumen de cambios.
Devolve solo el texto final (y el resumen cuando corresponda).`,
  },
  {
    id: 'romance',
    label: 'Romance / drama emocional',
    prompt: `Sos un editor especializado en romance y drama emocional. Tu objetivo es mantener la tension romantica o emocional, la voz intima de los personajes y la autenticidad de sus vinculos.
No pidas confirmaciones ni hagas preguntas: aplica los cambios directamente.
Prioriza el subtexto en los dialogos y la emocion mostrada a traves de acciones, no explicada directamente.
Si el cambio es grande, al final agrega exactamente 5 bullets con resumen de cambios.
Devolve solo el texto final (y el resumen cuando corresponda).`,
  },
];

export const AI_ACTIONS: AiAction[] = [
  {
    id: 'draft-from-idea',
    label: 'Abrir desde idea',
    description: 'Crea o rehace un borrador guiado por la promesa, la biblia y el canon.',
    modifiesText: true,
  },
  {
    id: 'polish-style',
    label: 'Pulir prosa',
    description: 'Mejora claridad, ritmo y repeticion sin desarmar la escena.',
    modifiesText: true,
  },
  {
    id: 'rewrite-tone',
    label: 'Reenfocar tono',
    description: 'Reescribe manteniendo la escena, pero ajustando registro y clima.',
    modifiesText: true,
  },
  {
    id: 'expand-examples',
    label: 'Expandir beats',
    description: 'Amplia acciones, reacciones y detalle sensorial de la escena.',
    modifiesText: true,
  },
  {
    id: 'shorten-20',
    label: 'Condensar escena',
    description: 'Reduce longitud sin perder conflicto, tono ni informacion clave.',
    modifiesText: true,
  },
  {
    id: 'consistency',
    label: 'Unificar voz y canon',
    description: 'Unifica terminologia, metaforas, tono y reglas del manuscrito.',
    modifiesText: true,
  },
  {
    id: 'improve-transitions',
    label: 'Suavizar transiciones',
    description: 'Ajusta continuidad y enlaces entre beats, parrafos y escenas.',
    modifiesText: true,
  },
  {
    id: 'deepen-argument',
    label: 'Profundizar conflicto',
    description: 'Aumenta tension, subtexto y capas internas sin perder claridad.',
    modifiesText: true,
  },
  {
    id: 'align-with-foundation',
    label: 'Alinear con promesa',
    description: 'Ajusta el texto para volver a la base fija y al canon del libro.',
    modifiesText: true,
  },
  {
    id: 'feedback-chapter',
    label: 'Diagnostico capitulo',
    description: 'Lectura editorial detallada del capitulo con hallazgos accionables.',
    modifiesText: false,
  },
  {
    id: 'feedback-book',
    label: 'Diagnostico libro',
    description: 'Analisis global de coherencia, estructura y mejoras del libro.',
    modifiesText: false,
  },
  {
    id: 'verify-pov-voice',
    label: 'Auditar POV',
    description: 'Detecta si la voz del narrador rompe el punto de vista declarado.',
    modifiesText: false,
  },
  {
    id: 'suggest-next-chapter',
    label: 'Plan siguiente capitulo',
    description: 'Propone un plan de capitulo siguiente coherente con el arco actual.',
    modifiesText: false,
  },
  {
    id: 'detect-broken-promises',
    label: 'Detectar promesas incumplidas',
    description: 'Lista elementos que se plantaron pero nunca se resolvieron.',
    modifiesText: false,
  },
  {
    id: 'compare-arc-rhythm',
    label: 'Ritmo del arco',
    description: 'Analiza si el ritmo narrativo del capitulo encaja con el arco general.',
    modifiesText: false,
  },
  {
    id: 'loose-ends-check',
    label: 'Cabos sueltos',
    description: 'Escanea todo el libro y lista preguntas narrativas sin respuesta.',
    modifiesText: false,
  },
  {
    id: 'consult-world',
    label: 'Consultar mundo',
    description: 'Analiza coherencia del mundo, geografia, reglas y evidencia interna.',
    modifiesText: false,
  },
  {
    id: 'consult-economy',
    label: 'Consultar economia',
    description: 'Proyecta impacto economico y logistico a partir de las reglas del mundo.',
    modifiesText: false,
  },
  {
    id: 'consult-politics',
    label: 'Consultar politica',
    description: 'Evalua equilibrio de poder, alianzas y consecuencias politicas.',
    modifiesText: false,
  },
  {
    id: 'consult-tone-drift',
    label: 'Auditar tono',
    description: 'Detecta deriva tonal y la sustenta con evidencia del manuscrito.',
    modifiesText: false,
  },
  {
    id: 'consult-rule-audit',
    label: 'Auditar reglas',
    description: 'Cruza manuscrito, magia, conlangs y reglas fijadas para encontrar desajustes.',
    modifiesText: false,
  },
];

const ACTION_INSTRUCTIONS: Record<AiActionId, string> = {
  'draft-from-idea':
    'Escribir o rehacer el capitulo desde una idea base, respetando promesa, canon, personajes y direccion narrativa.',
  'polish-style':
    'Pulir prosa manteniendo significado. Mejora claridad, ritmo, respiracion de frases y elimina repeticiones.',
  'rewrite-tone':
    'Reescribir la escena ajustando tono y clima sin cambiar su funcion narrativa ni la voz del autor.',
  'expand-examples':
    'Expandir la escena con beats concretos, reaccion fisica, detalle sensorial y consecuencias inmediatas, sin desviarte del foco.',
  'shorten-20':
    'Condensar aproximadamente un 20% manteniendo conflicto, informacion clave, tono y fluidez.',
  consistency:
    'Corregir inconsistencias de terminologia, metaforas, tono, reglas y voz narrativa de forma uniforme.',
  'improve-transitions':
    'Mejorar transiciones entre beats, ideas y parrafos para lograr lectura fluida y cohesion.',
  'deepen-argument':
    'Profundizar el conflicto con matices, subtexto y presion dramatica sin extender innecesariamente.',
  'align-with-foundation':
    'Reescribir para alinear estrictamente con la base del libro: idea central, promesa, voz, canon y reglas de estilo.',
  'feedback-chapter':
    'Dar diagnostico editorial del capitulo: fortalezas, debilidades, coherencia, tension, ritmo y mejoras accionables.',
  'feedback-book':
    'Dar diagnostico editorial del libro completo: estructura, arco narrativo, coherencia, ritmo y mejoras accionables.',
  'verify-pov-voice':
    'Analiza el capitulo e identifica momentos donde la voz del narrador o el acceso a informacion rompe el punto de vista (POV) declarado. Lista cada infraccion con cita y sugerencia de correc.',
  'suggest-next-chapter':
    'Basandote en el estado actual del arco narrativo, personajes y tensiones abiertas, propone un plan detallado para el siguiente capitulo: objetivo narrativo, escenas clave, personajes involucrados y gancho de cierre.',
  'detect-broken-promises':
    'Examina el capitulo y el contexto del libro. Lista todos los elementos que se plantaron como importantes (misterios, objetos, promesas del personaje, pistas) pero que no tienen resolucion visible. Usa formato de lista con cita y posible resolucion sugerida.',
  'compare-arc-rhythm':
    'Analiza la posicion de este capitulo en el arco general del libro. Evalua si el ritmo (tension, accion, refleccion, revelacion) es adecuado para el momento narrativo. Compara con estructura esperada (inicio, punto de giro, climax, resolucion) y senala desbalances.',
  'loose-ends-check':
    'Escanea todo el contenido del libro proporcionado. Lista en formato numerado todas las preguntas narrativas abiertas, promesas incumplidas, personajes desaparecidos sin explicacion y misterios sin resolver. Para cada uno indica en que capitulo aparece y si existe algun indicio de resolucion.',
  'consult-world':
    'Actua como consultor de mundo. Responde con hallazgos, evidencia interna trazable y riesgos de continuidad sobre geografia, historia, reglas y logistica. No reescribas escenas.',
  'consult-economy':
    'Actua como consultor economico del mundo. Explica impacto de recursos, sequias, guerras, rutas y estructuras feudales usando solo evidencia interna trazable. No reescribas escenas.',
  'consult-politics':
    'Actua como consultor politico. Analiza alianzas, legitimidad, tensiones de facciones y consecuencias diplomaticas con evidencia interna trazable. No reescribas escenas.',
  'consult-tone-drift':
    'Actua como analista tonal. Detecta si el tono del manuscrito se desvia del pacto narrativo y sustenta cada punto con evidencia textual trazable. No reescribas escenas.',
  'consult-rule-audit':
    'Actua como auditor de reglas. Cruza biblia, magia, conlangs, glosario y manuscrito para listar incumplimientos o puntos de riesgo con evidencia trazable. No reescribas escenas.',
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
  pinnedIds?: Set<string>,
  getId?: (entry: T) => string,
): T[] {
  if (entries.length <= maxItems) {
    return entries;
  }

  const normalizedQuery = normalizeToken(queryText);
  const queryTokens = new Set(extractStoryTokens(queryText));
  const normalizedRecent = normalizeToken(recentText);
  const recentTokens = new Set(extractStoryTokens(recentText));

  const pinned: T[] = [];
  const unpinned: T[] = [];
  if (pinnedIds && pinnedIds.size > 0 && getId) {
    for (const entry of entries) {
      if (pinnedIds.has(getId(entry))) {
        pinned.push(entry);
      } else {
        unpinned.push(entry);
      }
    }
  } else {
    unpinned.push(...entries);
  }

  const remainingSlots = Math.max(0, maxItems - pinned.length);
  if (remainingSlots === 0) {
    return pinned.slice(0, maxItems);
  }

  const scored = unpinned.map((entry, index) => ({
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
    .slice(0, remainingSlots)
    .map((item) => item.entry);

  if (withMatches.length > 0) {
    return [...pinned, ...withMatches];
  }

  return [...pinned, ...unpinned.slice(0, remainingSlots)];
}

interface StoryBibleSelectionOptions {
  maxCharacters?: number;
  maxLocations?: number;
  recentText?: string;
  recencyWeight?: number;
  includeApocryphal?: boolean;
}

export function selectStoryBibleForPrompt(
  storyBible: StoryBible,
  queryText: string,
  options?: StoryBibleSelectionOptions,
): StoryBible {
  const scopedStoryBible = filterStoryBibleByCanon(storyBible, {
    includeApocryphal: options?.includeApocryphal === true,
  });
  const maxCharacters = Math.max(1, options?.maxCharacters ?? 6);
  const maxLocations = Math.max(1, options?.maxLocations ?? 6);
  const recentText = options?.recentText ?? '';
  const recencyWeight = Math.min(2, Math.max(0, options?.recencyWeight ?? 1));

  return {
    continuityRules: scopedStoryBible.continuityRules,
    characters: pickRelevantEntries(
      scopedStoryBible.characters,
      queryText,
      maxCharacters,
      (entry) => entry.name,
      (entry) => entry.aliases,
      (entry) => `${entry.name} ${entry.aliases} ${entry.role} ${entry.traits} ${entry.goal} ${entry.notes}`,
      recentText,
      recencyWeight,
    ),
    locations: pickRelevantEntries(
      scopedStoryBible.locations,
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

export function buildStoryBibleBlock(
  storyBible: StoryBible,
  options?: { includeApocryphal?: boolean },
): string {
  const scopedStoryBible = filterStoryBibleByCanon(storyBible, {
    includeApocryphal: options?.includeApocryphal === true,
  });
  const hasCharacters = scopedStoryBible.characters.length > 0;
  const hasLocations = scopedStoryBible.locations.length > 0;
  const hasContinuity = scopedStoryBible.continuityRules.trim().length > 0;

  if (!hasCharacters && !hasLocations && !hasContinuity) {
    return 'Biblia de la historia:\n- (sin definir)';
  }

  const lines: string[] = ['Biblia de la historia:'];
  if (hasContinuity) {
    lines.push(`- Reglas de continuidad: ${compactStoryValue(scopedStoryBible.continuityRules)}`);
  }

  if (hasCharacters) {
    lines.push('- Personajes clave:');
    for (const entry of scopedStoryBible.characters.slice(0, 12)) {
      const extras = [
        entry.age ? `edad: ${entry.age}` : '',
        entry.physicalDescription ? `fisico: ${entry.physicalDescription}` : '',
        entry.backstory ? `trasfondo: ${entry.backstory}` : '',
        entry.emotionalArc ? `arco emocional: ${entry.emotionalArc}` : '',
      ].filter(Boolean).join(' | ');
      lines.push(
        `  - ${compactStoryValue(entry.name)} | alias: ${compactStoryValue(entry.aliases)} | rol: ${compactStoryValue(entry.role)} | rasgos: ${compactStoryValue(entry.traits)} | objetivo: ${compactStoryValue(entry.goal)} | notas: ${compactStoryValue(entry.notes)}${extras ? ` | ${extras}` : ''}`,
      );
    }
  }

  if (hasLocations) {
    lines.push('- Lugares clave:');
    for (const entry of scopedStoryBible.locations.slice(0, 12)) {
      lines.push(
        `  - ${compactStoryValue(entry.name)} | alias: ${compactStoryValue(entry.aliases)} | descripcion: ${compactStoryValue(entry.description)} | atmosfera: ${compactStoryValue(entry.atmosphere)} | notas: ${compactStoryValue(entry.notes)}`,
      );
    }
  }

  return lines.join('\n');
}

function hasSagaWorldContent(sagaWorld: SagaWorldBible): boolean {
  return Boolean(
    sagaWorld.overview.trim() ||
      sagaWorld.pinnedAiRules.trim() ||
      sagaWorld.globalRules.trim() ||
      sagaWorld.glossary.trim() ||
      sagaWorld.characters.length > 0 ||
      sagaWorld.locations.length > 0 ||
      sagaWorld.routes.length > 0 ||
      sagaWorld.flora.length > 0 ||
      sagaWorld.fauna.length > 0 ||
      sagaWorld.factions.length > 0 ||
      sagaWorld.systems.length > 0 ||
      sagaWorld.artifacts.length > 0 ||
      (sagaWorld.secrets?.length ?? 0) > 0 ||
      sagaWorld.relationships.length > 0 ||
      sagaWorld.timeline.length > 0 ||
      sagaWorld.atlas.mapImagePath.trim() ||
      sagaWorld.atlas.pins.length > 0 ||
      sagaWorld.atlas.routeMeasurements.length > 0 ||
      sagaWorld.conlangs.length > 0 ||
      sagaWorld.magicSystems.length > 0,
  );
}

function buildSagaCharacterPromptAliases(entry: SagaWorldBible['characters'][number]): string {
  const timelineAliases = entry.aliasTimeline.map((alias) => alias.value.trim()).filter(Boolean);
  const merged = [entry.aliases.trim(), ...timelineAliases].filter(Boolean);
  return Array.from(new Set(merged)).join(', ');
}

function buildSagaCharacterPromptVersions(entry: SagaWorldBible['characters'][number]): string {
  return (entry.versions ?? [])
    .map((version) =>
      `${version.label} ${version.startOrder ?? ''}-${version.endOrder ?? ''} ${version.status} ${version.summary}`.trim(),
    )
    .filter(Boolean)
    .join(' ');
}

function buildSagaTimelinePromptBookRefs(entry: SagaWorldBible['timeline'][number]): string {
  return entry.bookRefs
    .map((ref) => `${ref.bookPath} ${ref.chapterId} ${ref.mode} ${ref.locationId ?? ''}`.trim())
    .filter(Boolean)
    .join(' ');
}

function buildSagaTimelinePromptImpacts(entry: SagaWorldBible['timeline'][number]): string {
  return entry.characterImpacts
    .map((impact) => `${impact.characterId} ${impact.impactType} ${impact.aliasUsed} ${impact.stateChange}`.trim())
    .filter(Boolean)
    .join(' ');
}

function buildSagaTimelinePromptTransfers(entry: SagaWorldBible['timeline'][number]): string {
  return (entry.artifactTransfers ?? [])
    .map((transfer) =>
      `${transfer.artifactId} ${transfer.fromCharacterId} -> ${transfer.toCharacterId} ${transfer.notes}`.trim(),
    )
    .filter(Boolean)
    .join(' ');
}

function buildSagaTimelinePromptLocations(entry: SagaWorldBible['timeline'][number]): string {
  return (entry.characterLocations ?? [])
    .map((location) => `${location.characterId} @ ${location.locationId} ${location.notes}`.trim())
    .filter(Boolean)
    .join(' ');
}

function buildSagaTimelinePromptReveals(entry: SagaWorldBible['timeline'][number]): string {
  return (entry.secretReveals ?? [])
    .map((reveal) =>
      `${reveal.secretId} ${reveal.truthMode} ${reveal.perceiverCharacterId} ${reveal.summary}`.trim(),
    )
    .filter(Boolean)
    .join(' ');
}

function buildSagaAtlasPrompt(entry: SagaWorldBible['atlas']): string {
  const visibleLayers = entry.layers.filter((layer) => layer.visible).map((layer) => layer.name);
  return [
    entry.mapImagePath ? `Mapa base: ${entry.mapImagePath}` : '',
    visibleLayers.length > 0 ? `Capas activas: ${visibleLayers.join(', ')}` : '',
    entry.pins.length > 0 ? `Pines: ${entry.pins.length}` : '',
    entry.routeMeasurements.length > 0 ? `Rutas medidas: ${entry.routeMeasurements.length}` : '',
    entry.distanceScale ? `Escala: ${entry.distanceScale} ${entry.distanceUnit} por ancho completo` : '',
  ]
    .filter(Boolean)
    .join(' | ');
}

function buildSagaConlangPrompt(entry: SagaWorldBible['conlangs'][number]): string {
  return [
    entry.name,
    entry.phonetics,
    entry.grammarNotes,
    entry.styleRules,
    entry.lexicon
      .slice(0, 8)
      .map((term) => `${term.term}=${term.translation}`)
      .join(', '),
  ]
    .filter(Boolean)
    .join(' | ');
}

function buildSagaMagicPrompt(entry: SagaWorldBible['magicSystems'][number]): string {
  return [
    entry.name,
    entry.summary,
    `Fuente: ${entry.source}`,
    `Costos: ${entry.costs}`,
    `Limites: ${entry.limits}`,
    `Prohibido: ${entry.forbiddenActs}`,
    `Pistas de validacion: ${entry.validationHints}`,
  ]
    .filter((value) => value.trim().length > 0)
    .join(' | ');
}

function resolveSagaEntityLabel(
  sagaWorld: SagaWorldBible,
  reference: SagaWorldBible['relationships'][number]['from'],
): string {
  const collections = {
    character: sagaWorld.characters,
    location: sagaWorld.locations,
    route: sagaWorld.routes,
    flora: sagaWorld.flora,
    fauna: sagaWorld.fauna,
    faction: sagaWorld.factions,
    system: sagaWorld.systems,
    artifact: sagaWorld.artifacts,
  };

  const target = collections[reference.kind].find((entry) => entry.id === reference.id);
  return target?.name?.trim() || reference.id.trim() || `${reference.kind} sin referencia`;
}

function buildSagaRelationshipLabel(
  sagaWorld: SagaWorldBible,
  relationship: SagaWorldBible['relationships'][number],
): string {
  const fromLabel = resolveSagaEntityLabel(sagaWorld, relationship.from);
  const toLabel = resolveSagaEntityLabel(sagaWorld, relationship.to);
  return `${fromLabel} ${relationship.type || 'relacion'} ${toLabel}`.trim();
}

function isSagaCharacterEntry(
  entry: SagaWorldBible['characters'][number] | SagaWorldBible['locations'][number],
): entry is SagaWorldBible['characters'][number] {
  return 'aliasTimeline' in entry && 'lifecycle' in entry;
}

interface SagaWorldSelectionOptions {
  maxEntitiesPerSection?: number;
  maxTimelineEvents?: number;
  maxRelationships?: number;
  recentText?: string;
  recencyWeight?: number;
  includeApocryphal?: boolean;
  pinnedEntityIds?: Set<string>;
}

export function selectSagaWorldForPrompt(
  sagaWorld: SagaWorldBible,
  queryText: string,
  options?: SagaWorldSelectionOptions,
): SagaWorldBible {
  const scopedSagaWorld = filterSagaWorldByCanon(sagaWorld, {
    includeApocryphal: options?.includeApocryphal === true,
  });
  const maxEntitiesPerSection = Math.max(1, options?.maxEntitiesPerSection ?? 4);
  const maxTimelineEvents = Math.max(1, options?.maxTimelineEvents ?? 5);
  const maxRelationships = Math.max(1, options?.maxRelationships ?? 6);
  const recentText = options?.recentText ?? '';
  const recencyWeight = Math.min(2, Math.max(0, options?.recencyWeight ?? 1));
  const pinned = options?.pinnedEntityIds;

  return {
    overview: scopedSagaWorld.overview,
    pinnedAiRules: scopedSagaWorld.pinnedAiRules,
    globalRules: scopedSagaWorld.globalRules,
    glossary: scopedSagaWorld.glossary,
    timelineLanes: scopedSagaWorld.timelineLanes,
    atlas: scopedSagaWorld.atlas,
    conlangs: pickRelevantEntries(
      scopedSagaWorld.conlangs,
      queryText,
      Math.max(1, Math.min(4, maxEntitiesPerSection)),
      (entry) => entry.name,
      (entry) => entry.lexicon.map((term) => term.term).join(' '),
      (entry) => buildSagaConlangPrompt(entry),
      recentText,
      recencyWeight,
      undefined,
      (entry) => entry.id,
    ),
    magicSystems: pickRelevantEntries(
      scopedSagaWorld.magicSystems,
      queryText,
      Math.max(1, Math.min(4, maxEntitiesPerSection)),
      (entry) => entry.name,
      (entry) => `${entry.source} ${entry.costs} ${entry.limits} ${entry.forbiddenActs}`,
      (entry) => buildSagaMagicPrompt(entry),
      recentText,
      recencyWeight,
      undefined,
      (entry) => entry.id,
    ),
    characters: pickRelevantEntries(
      scopedSagaWorld.characters,
      queryText,
      maxEntitiesPerSection,
      (entry) => entry.name,
      (entry) => buildSagaCharacterPromptAliases(entry),
      (entry) =>
        `${entry.name} ${buildSagaCharacterPromptAliases(entry)} ${buildSagaCharacterPromptVersions(entry)} ${entry.summary} ${entry.notes} ${entry.lifecycle.currentStatus}`,
      recentText,
      recencyWeight,
      pinned,
      (entry) => entry.id,
    ),
    locations: pickRelevantEntries(
      scopedSagaWorld.locations,
      queryText,
      maxEntitiesPerSection,
      (entry) => entry.name,
      (entry) => entry.aliases,
      (entry) => `${entry.name} ${entry.aliases} ${entry.summary} ${entry.notes}`,
      recentText,
      recencyWeight,
      pinned,
      (entry) => entry.id,
    ),
    routes: pickRelevantEntries(
      scopedSagaWorld.routes,
      queryText,
      maxEntitiesPerSection,
      (entry) => entry.name,
      (entry) => entry.aliases,
      (entry) => `${entry.name} ${entry.aliases} ${entry.summary} ${entry.notes}`,
      recentText,
      recencyWeight,
      pinned,
      (entry) => entry.id,
    ),
    flora: pickRelevantEntries(
      scopedSagaWorld.flora,
      queryText,
      maxEntitiesPerSection,
      (entry) => entry.name,
      (entry) => entry.aliases,
      (entry) => `${entry.name} ${entry.aliases} ${entry.summary} ${entry.notes}`,
      recentText,
      recencyWeight,
      pinned,
      (entry) => entry.id,
    ),
    fauna: pickRelevantEntries(
      scopedSagaWorld.fauna,
      queryText,
      maxEntitiesPerSection,
      (entry) => entry.name,
      (entry) => entry.aliases,
      (entry) => `${entry.name} ${entry.aliases} ${entry.summary} ${entry.notes}`,
      recentText,
      recencyWeight,
      pinned,
      (entry) => entry.id,
    ),
    factions: pickRelevantEntries(
      scopedSagaWorld.factions,
      queryText,
      maxEntitiesPerSection,
      (entry) => entry.name,
      (entry) => entry.aliases,
      (entry) => `${entry.name} ${entry.aliases} ${entry.summary} ${entry.notes}`,
      recentText,
      recencyWeight,
      pinned,
      (entry) => entry.id,
    ),
    systems: pickRelevantEntries(
      scopedSagaWorld.systems,
      queryText,
      maxEntitiesPerSection,
      (entry) => entry.name,
      (entry) => entry.aliases,
      (entry) => `${entry.name} ${entry.aliases} ${entry.summary} ${entry.notes}`,
      recentText,
      recencyWeight,
      pinned,
      (entry) => entry.id,
    ),
    artifacts: pickRelevantEntries(
      scopedSagaWorld.artifacts,
      queryText,
      maxEntitiesPerSection,
      (entry) => entry.name,
      (entry) => entry.aliases,
      (entry) => `${entry.name} ${entry.aliases} ${entry.summary} ${entry.notes}`,
      recentText,
      recencyWeight,
      pinned,
      (entry) => entry.id,
    ),
    secrets: pickRelevantEntries(
      scopedSagaWorld.secrets ?? [],
      queryText,
      maxEntitiesPerSection,
      (entry) => entry.title,
      (entry) => entry.relatedEntityIds.join(' '),
      (entry) => `${entry.title} ${entry.summary} ${entry.objectiveTruth} ${entry.notes} ${entry.relatedEntityIds.join(' ')}`,
      recentText,
      recencyWeight,
      pinned,
      (entry) => entry.id,
    ),
    relationships: pickRelevantEntries(
      scopedSagaWorld.relationships,
      queryText,
      maxRelationships,
      (entry) => buildSagaRelationshipLabel(scopedSagaWorld, entry),
      (entry) =>
        `${resolveSagaEntityLabel(scopedSagaWorld, entry.from)} ${resolveSagaEntityLabel(scopedSagaWorld, entry.to)}`.trim(),
      (entry) =>
        `${buildSagaRelationshipLabel(scopedSagaWorld, entry)} ${entry.from.kind} ${entry.from.id} ${entry.to.kind} ${entry.to.id} ${entry.notes}`,
      recentText,
      recencyWeight,
      pinned,
      (entry) => entry.id,
    ),
    timeline: pickRelevantEntries(
      scopedSagaWorld.timeline,
      queryText,
      maxTimelineEvents,
      (entry) => entry.title,
      (entry) => `${entry.displayLabel} ${buildSagaTimelinePromptBookRefs(entry)}`,
      (entry) =>
        `${entry.title} ${entry.category} ${entry.displayLabel} ${entry.summary} ${entry.notes} ${entry.objectiveTruth ?? ''} ${entry.perceivedTruth ?? ''} ${buildSagaTimelinePromptBookRefs(entry)} ${buildSagaTimelinePromptImpacts(entry)} ${buildSagaTimelinePromptTransfers(entry)} ${buildSagaTimelinePromptLocations(entry)} ${buildSagaTimelinePromptReveals(entry)} ${entry.entityIds.join(' ')}`,
      recentText,
      recencyWeight,
      pinned,
      (entry) => entry.id,
    ),
  };
}

export function buildSagaWorldBlock(
  sagaTitle: string | null | undefined,
  sagaWorld?: SagaWorldBible | null,
  options?: { includeApocryphal?: boolean },
): string {
  if (!sagaWorld) {
    return '';
  }

  const scopedSagaWorld = filterSagaWorldByCanon(sagaWorld, {
    includeApocryphal: options?.includeApocryphal === true,
  });
  const hasContent = hasSagaWorldContent(scopedSagaWorld);
  const header = sagaTitle?.trim() ? `Biblia de saga (${sagaTitle.trim()}):` : 'Biblia de saga:';
  if (!hasContent) {
    return `${header}\n- (sin definir)`;
  }

  const sections = [
    { label: 'Personajes de saga', entries: scopedSagaWorld.characters },
    { label: 'Lugares y regiones', entries: scopedSagaWorld.locations },
    { label: 'Rutas y caminos', entries: scopedSagaWorld.routes },
    { label: 'Flora', entries: scopedSagaWorld.flora },
    { label: 'Fauna', entries: scopedSagaWorld.fauna },
    { label: 'Facciones y culturas', entries: scopedSagaWorld.factions },
    { label: 'Sistemas', entries: scopedSagaWorld.systems },
    { label: 'Artefactos', entries: scopedSagaWorld.artifacts },
  ];
  const lines: string[] = [header];

  if (scopedSagaWorld.overview.trim()) {
    lines.push(`- Panorama general: ${compactStoryValue(scopedSagaWorld.overview)}`);
  }

  if ((scopedSagaWorld.secrets ?? []).length > 0) {
    lines.push('- Secretos:');
    for (const secret of (scopedSagaWorld.secrets ?? []).slice(0, 8)) {
      lines.push(
        `  - ${compactStoryValue(secret.title)} | resumen: ${compactStoryValue(secret.summary)} | verdad objetiva: ${compactStoryValue(secret.objectiveTruth)} | notas: ${compactStoryValue(secret.notes)}`,
      );
    }
  }
  if (scopedSagaWorld.pinnedAiRules.trim()) {
    lines.push(`- Reglas fijadas para IA: ${compactStoryValue(scopedSagaWorld.pinnedAiRules)}`);
  }
  if (scopedSagaWorld.globalRules.trim()) {
    lines.push(`- Reglas globales: ${compactStoryValue(scopedSagaWorld.globalRules)}`);
  }
  if (scopedSagaWorld.glossary.trim()) {
    lines.push(`- Glosario: ${compactStoryValue(scopedSagaWorld.glossary)}`);
  }
  const usedTimelineLanes = scopedSagaWorld.timelineLanes.filter((lane) =>
    scopedSagaWorld.timeline.some((event) => event.laneId === lane.id),
  );
  if (usedTimelineLanes.length > 0) {
    lines.push(`- Carriles temporales: ${compactStoryValue(usedTimelineLanes.map((lane) => `${lane.label} (${lane.era})`).join(', '))}`);
  }
  const atlasPrompt = buildSagaAtlasPrompt(scopedSagaWorld.atlas);
  if (atlasPrompt) {
    lines.push(`- Atlas visual: ${compactStoryValue(atlasPrompt)}`);
  }
  if (scopedSagaWorld.conlangs.length > 0) {
    lines.push('- Lenguas construidas:');
    for (const entry of scopedSagaWorld.conlangs.slice(0, 4)) {
      lines.push(`  - ${compactStoryValue(buildSagaConlangPrompt(entry))}`);
    }
  }
  if (scopedSagaWorld.magicSystems.length > 0) {
    lines.push('- Sistemas de magia/poder:');
    for (const entry of scopedSagaWorld.magicSystems.slice(0, 4)) {
      lines.push(`  - ${compactStoryValue(buildSagaMagicPrompt(entry))}`);
    }
  }

  for (const section of sections) {
    if (section.entries.length === 0) {
      continue;
    }
    lines.push(`- ${section.label}:`);
    for (const entry of section.entries.slice(0, 8)) {
      const isCharacter = isSagaCharacterEntry(entry);
      const aliasText = isCharacter ? buildSagaCharacterPromptAliases(entry) : entry.aliases;
      const statusText = isCharacter ? ` | estado: ${compactStoryValue(entry.lifecycle.currentStatus)}` : '';
      const versionsText = isCharacter
        ? ` | versiones: ${compactStoryValue((entry.versions ?? []).map((version) => version.label).join(', '))}`
        : '';
      lines.push(
        `  - ${compactStoryValue(entry.name)} | alias: ${compactStoryValue(aliasText)}${statusText}${versionsText} | resumen: ${compactStoryValue(entry.summary)} | notas: ${compactStoryValue(entry.notes)}`,
      );
    }
  }

  if (scopedSagaWorld.relationships.length > 0) {
    lines.push('- Relaciones clave:');
    for (const entry of scopedSagaWorld.relationships.slice(0, 8)) {
      lines.push(
        `  - ${compactStoryValue(buildSagaRelationshipLabel(scopedSagaWorld, entry))} | notas: ${compactStoryValue(entry.notes)}`,
      );
    }
  }

  if (scopedSagaWorld.timeline.length > 0) {
    lines.push('- Linea temporal:');
    for (const entry of scopedSagaWorld.timeline.slice(0, 8)) {
      const bookRefs = buildSagaTimelinePromptBookRefs(entry);
      const impacts = buildSagaTimelinePromptImpacts(entry);
      const transfers = buildSagaTimelinePromptTransfers(entry);
      const locations = buildSagaTimelinePromptLocations(entry);
      const reveals = buildSagaTimelinePromptReveals(entry);
      lines.push(
        `  - ${compactStoryValue(entry.displayLabel)} | evento: ${compactStoryValue(entry.title)} | tipo: ${compactStoryValue(entry.category)} | tramo: ${entry.kind === 'span' ? `${entry.startOrder}-${entry.endOrder ?? entry.startOrder}` : String(entry.startOrder)} | resumen: ${compactStoryValue(entry.summary)} | verdad objetiva: ${compactStoryValue(entry.objectiveTruth ?? '')} | verdad percibida: ${compactStoryValue(entry.perceivedTruth ?? '')} | libros: ${compactStoryValue(bookRefs)} | impactos: ${compactStoryValue(impacts)} | transferencias: ${compactStoryValue(transfers)} | ubicaciones: ${compactStoryValue(locations)} | revelaciones: ${compactStoryValue(reveals)} | notas: ${compactStoryValue(entry.notes)}`,
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
  sagaTitle?: string | null;
  sagaWorld?: SagaWorldBible | null;
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
  const sagaWorldBlock = buildSagaWorldBlock(input.sagaTitle, input.sagaWorld);
  const chapterLengthInstruction = getChapterLengthInstruction(input.chapterLengthPreset);
  const languageInstruction = getLanguageInstruction(input.language);

  if (input.actionId === 'feedback-book' || input.actionId === 'loose-ends-check') {
    return [
      `Libro: ${input.bookTitle}`,
      foundationBlock,
      storyBibleBlock,
      ...(sagaWorldBlock ? [sagaWorldBlock] : []),
      languageInstruction,
      `Accion: ${instruction}`,
      '',
      'Contenido del libro:',
      input.fullBookContext ?? '',
    ].join('\n');
  }

  if (
    input.actionId === 'feedback-chapter' ||
    input.actionId === 'verify-pov-voice' ||
    input.actionId === 'suggest-next-chapter' ||
    input.actionId === 'detect-broken-promises' ||
    input.actionId === 'compare-arc-rhythm'
  ) {
    return [
      `Libro: ${input.bookTitle}`,
      `Capitulo: ${input.chapterTitle}`,
      foundationBlock,
      storyBibleBlock,
      ...(sagaWorldBlock ? [sagaWorldBlock] : []),
      languageInstruction,
      chapterLengthInstruction,
      `Accion: ${instruction}`,
      '',
      'Contenido del capitulo:',
      input.chapterContext ?? target,
      ...(input.fullBookContext ? ['\nContexto del libro completo:', input.fullBookContext] : []),
    ].join('\n');
  }

  if (input.actionId === 'draft-from-idea') {
    return [
      `Libro: ${input.bookTitle}`,
      `Capitulo: ${input.chapterTitle}`,
      foundationBlock,
      storyBibleBlock,
      ...(sagaWorldBlock ? [sagaWorldBlock] : []),
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

  if (
    input.actionId === 'consult-world' ||
    input.actionId === 'consult-economy' ||
    input.actionId === 'consult-politics' ||
    input.actionId === 'consult-tone-drift' ||
    input.actionId === 'consult-rule-audit'
  ) {
    return [
      'MODO: consultor analitico del mundo. No reescribas texto.',
      'Salida obligatoria:',
      '- Hallazgos',
      '- Evidencia',
      '- Riesgos',
      '- Recomendacion siguiente',
      `Libro: ${input.bookTitle}`,
      `Capitulo activo: ${input.chapterTitle || '(sin capitulo activo)'}`,
      foundationBlock,
      storyBibleBlock,
      ...(sagaWorldBlock ? [sagaWorldBlock] : []),
      languageInstruction,
      `Accion: ${instruction}`,
      '',
      'Contexto del libro completo:',
      input.fullBookContext ?? '',
      ...(input.chapterContext ? ['\nContexto adicional del capitulo activo:', input.chapterContext] : []),
    ].join('\n');
  }

  return [
    `Libro: ${input.bookTitle}`,
    `Capitulo: ${input.chapterTitle}`,
    foundationBlock,
    storyBibleBlock,
    ...(sagaWorldBlock ? [sagaWorldBlock] : []),
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
  mode: AiAssistantMode;
  message: string;
  bookTitle: string;
  language: string;
  foundation: BookFoundation;
  storyBible: StoryBible;
  sagaTitle?: string | null;
  sagaWorld?: SagaWorldBible | null;
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
  sagaTitle?: string | null;
  sagaWorld?: SagaWorldBible | null;
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
  sagaTitle?: string | null;
  sagaWorld?: SagaWorldBible | null;
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
  sagaTitle?: string | null;
  sagaWorld?: SagaWorldBible | null;
  chapterTitle: string;
  originalText: string;
  candidateText: string;
}

export function buildChatPrompt(input: BuildChatPromptInput): string {
  const chapterLengthInstruction =
    input.scope === 'chapter' ? getChapterLengthInstruction(input.chapterLengthPreset) : null;
  const bookLengthInstruction = input.scope === 'book' ? input.bookLengthInstruction?.trim() : '';
  const languageInstruction = getLanguageInstruction(input.language);
  const sagaWorldBlock = buildSagaWorldBlock(input.sagaTitle, input.sagaWorld);
  const modeInstruction =
    input.mode === 'consultor'
      ? [
          'MODO: consultor analitico del mundo. No reescribas texto ni propongas reemplazos completos salvo pedido explicito.',
          'Salida obligatoria:',
          '- Hallazgos',
          '- Evidencia trazable (citas breves o referencias al contexto recibido)',
          '- Riesgos / incoherencias',
          '- Recomendacion siguiente',
        ].join('\n')
      : 'MODO: asistente de escritura. Puedes sugerir o reescribir segun lo pida el usuario.';

  return [
    `Libro: ${input.bookTitle}`,
    modeInstruction,
    buildFoundationBlock(input.foundation),
    buildStoryBibleBlock(input.storyBible),
    ...(sagaWorldBlock ? [sagaWorldBlock] : []),
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
  const sagaWorldBlock = buildSagaWorldBlock(input.sagaTitle, input.sagaWorld);
  return [
    'MODO: reescritura automatica sin pedir confirmaciones.',
    `Libro: ${input.bookTitle}`,
    getLanguageInstruction(input.language),
    buildFoundationBlock(input.foundation),
    buildStoryBibleBlock(input.storyBible),
    ...(sagaWorldBlock ? [sagaWorldBlock] : []),
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
  const sagaWorldBlock = buildSagaWorldBlock(input.sagaTitle, input.sagaWorld);
  return [
    'MODO: agente continuo para capitulo, sin pedir confirmaciones.',
    `Libro: ${input.bookTitle}`,
    getLanguageInstruction(input.language),
    buildFoundationBlock(input.foundation),
    buildStoryBibleBlock(input.storyBible),
    ...(sagaWorldBlock ? [sagaWorldBlock] : []),
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

export interface ContinuousAgentOutput {
  status: 'DONE' | 'CONTINUE';
  summary: string;
  text: string;
}

const CONTINUOUS_STATUS_PATTERN = /ESTADO:\s*(DONE|CONTINUE)/i;
const CONTINUOUS_SUMMARY_PATTERN = /RESUMEN:\s*([^\n\r]*)/i;
const CONTINUOUS_TEXT_PATTERN = /TEXTO:\s*([\s\S]*)$/i;
const CONTINUOUS_STATUS_LINE_PATTERN = /^\s*[*_#>\-\s]*ESTADO\s*:\s*(?:DONE|CONTINUE)\s*[*_]*\s*$/i;
const CONTINUOUS_SUMMARY_LINE_PATTERN = /^\s*[*_#>\-\s]*RESUMEN\s*:\s*.*$/i;
const CONTINUOUS_TEXT_LINE_PATTERN = /^\s*[*_#>\-\s]*TEXTO\s*:\s*(.*)\s*$/i;

function decodeStructuredHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function normalizeStructuredOutput(raw: string): string {
  return decodeStructuredHtmlEntities(
    raw
      .replace(/\r\n/g, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function stripLeadingContinuousControlLines(value: string): string {
  const lines = value.split('\n');
  let cursor = 0;

  while (cursor < lines.length) {
    const current = lines[cursor].trim();
    if (!current) {
      cursor += 1;
      continue;
    }

    if (CONTINUOUS_STATUS_LINE_PATTERN.test(current) || CONTINUOUS_SUMMARY_LINE_PATTERN.test(current)) {
      cursor += 1;
      continue;
    }

    const textLine = current.match(CONTINUOUS_TEXT_LINE_PATTERN);
    if (textLine) {
      const inline = textLine[1]?.trim() ?? '';
      if (inline) {
        lines[cursor] = inline;
        return lines.slice(cursor).join('\n').trim();
      }

      cursor += 1;
      continue;
    }

    break;
  }

  return lines.slice(cursor).join('\n').trim();
}

export function parseContinuousAgentOutput(raw: string): ContinuousAgentOutput {
  const normalized = normalizeStructuredOutput(raw);
  if (!normalized) {
    return { status: 'CONTINUE', summary: '', text: '' };
  }

  const statusMatch = normalized.match(CONTINUOUS_STATUS_PATTERN);
  const summaryMatch = normalized.match(CONTINUOUS_SUMMARY_PATTERN);
  const textMatch = normalized.match(CONTINUOUS_TEXT_PATTERN);

  const status = (statusMatch?.[1]?.toUpperCase() as ContinuousAgentOutput['status'] | undefined) ?? 'CONTINUE';
  const summary = summaryMatch?.[1]?.trim() ?? '';
  const textCandidate = textMatch?.[1]?.trim() || stripLeadingContinuousControlLines(normalized);

  return {
    status,
    summary,
    text: textCandidate || normalized,
  };
}

export function buildContinuityGuardPrompt(input: BuildContinuityGuardPromptInput): string {
  const sagaWorldBlock = buildSagaWorldBlock(input.sagaTitle, input.sagaWorld);
  return [
    'MODO: bloqueo de continuidad narrativa previo a guardado.',
    `Libro: ${input.bookTitle}`,
    `Capitulo: ${input.chapterTitle}`,
    getLanguageInstruction(input.language),
    buildFoundationBlock(input.foundation),
    buildStoryBibleBlock(input.storyBible),
    ...(sagaWorldBlock ? [sagaWorldBlock] : []),
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
    '- Detecta contradicciones con continuidad, personajes, lugares, objetos, lesiones, conocimiento implicito y reglas del mundo.',
    '- Trata equivalencias y parafrasis como posible misma entidad si la evidencia interna lo sostiene.',
    '- Distingue contradiccion objetiva vs percepcion subjetiva, narrador no fiable o mentira deliberada.',
    '- Si el texto solo cambia la percepcion de un personaje pero no rompe la verdad canonica, no lo corrijas.',
    '- Si NO hay contradicciones, conserva EXACTAMENTE el texto candidato.',
    '- Si SI hay contradicciones, corrige con cambios minimos y conserva intencion.',
    '',
    'Salida obligatoria exacta:',
    'ESTADO: PASS o FAIL',
    'RAZON: breve',
    'EVIDENCIA: breve lista con reglas o hechos usados',
    'TEXTO:',
    '<texto final listo para guardar>',
  ].join('\n');
}

export interface ContinuityGuardOutput {
  status: 'PASS' | 'FAIL';
  reason: string;
  evidence: string;
  text: string;
}

export function parseContinuityGuardOutput(raw: string): ContinuityGuardOutput {
  const normalized = raw.trim();
  const statusMatch = normalized.match(/ESTADO:\s*(PASS|FAIL)/i);
  const reasonMatch = normalized.match(/RAZON:\s*(.*)/i);
  const evidenceMatch = normalized.match(/EVIDENCIA:\s*([\s\S]*?)\nTEXTO:/i);
  const textMatch = normalized.match(/TEXTO:\s*([\s\S]*)$/i);

  return {
    status: (statusMatch?.[1]?.toUpperCase() as ContinuityGuardOutput['status'] | undefined) ?? 'PASS',
    reason: reasonMatch?.[1]?.trim() ?? '',
    evidence: evidenceMatch?.[1]?.trim() ?? '',
    text: textMatch?.[1]?.trim() || normalized,
  };
}
