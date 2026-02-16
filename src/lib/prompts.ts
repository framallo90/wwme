import type { AiAction, AiActionId, BookFoundation } from '../types/book';

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

interface BuildActionPromptInput {
  actionId: AiActionId;
  selectedText: string;
  chapterTitle: string;
  bookTitle: string;
  foundation: BookFoundation;
  chapterContext?: string;
  fullBookContext?: string;
}

export function buildActionPrompt(input: BuildActionPromptInput): string {
  const instruction = ACTION_INSTRUCTIONS[input.actionId];
  const target = input.selectedText.trim();
  const foundationBlock = buildFoundationBlock(input.foundation);

  if (input.actionId === 'feedback-book') {
    return [
      `Libro: ${input.bookTitle}`,
      foundationBlock,
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
      `Accion: ${instruction}`,
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
  foundation: BookFoundation;
  chapterTitle?: string;
  chapterText: string;
  fullBookText: string;
  compactHistory: string;
}

interface BuildAutoRewritePromptInput {
  userInstruction: string;
  bookTitle: string;
  foundation: BookFoundation;
  chapterTitle: string;
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
  foundation: BookFoundation;
  chapterTitle: string;
  chapterText: string;
  fullBookText: string;
  round: number;
  maxRounds: number;
  previousSummary?: string;
}

export function buildChatPrompt(input: BuildChatPromptInput): string {
  return [
    `Libro: ${input.bookTitle}`,
    buildFoundationBlock(input.foundation),
    input.chapterTitle ? `Capitulo activo: ${input.chapterTitle}` : 'Sin capitulo activo',
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
    buildFoundationBlock(input.foundation),
    `Capitulo: ${input.chapterTitle} (${input.chapterIndex}/${input.chapterTotal})`,
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
    buildFoundationBlock(input.foundation),
    `Capitulo: ${input.chapterTitle}`,
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
