import type { AiAction, AiActionId } from '../types/book';

export const DEFAULT_SYSTEM_PROMPT = `Sos un editor literario experto. Tu tono debe ser intimo, sobrio y reflexivo. No uses estilo de autoayuda ni new age.
No pidas confirmaciones ni hagas preguntas: aplica los cambios directamente.
No agregues relleno ni explicaciones innecesarias.
Si el cambio es grande, igual hacelo y al final agrega exactamente 5 bullets con resumen de cambios.
Devolve solo el texto final (y el resumen cuando corresponda).`;

export const AI_ACTIONS: AiAction[] = [
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
  'feedback-chapter':
    'Dar devolucion editorial del capitulo: fortalezas, debilidades, coherencia y mejoras accionables.',
  'feedback-book':
    'Dar devolucion editorial del libro completo: estructura, arco narrativo, coherencia, ritmo y mejoras accionables.',
};

interface BuildActionPromptInput {
  actionId: AiActionId;
  selectedText: string;
  chapterTitle: string;
  bookTitle: string;
  chapterContext?: string;
  fullBookContext?: string;
}

export function buildActionPrompt(input: BuildActionPromptInput): string {
  const instruction = ACTION_INSTRUCTIONS[input.actionId];
  const target = input.selectedText.trim();

  if (input.actionId === 'feedback-book') {
    return [
      `Libro: ${input.bookTitle}`,
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
      `Accion: ${instruction}`,
      '',
      'Contenido del capitulo:',
      input.chapterContext ?? target,
    ].join('\n');
  }

  return [
    `Libro: ${input.bookTitle}`,
    `Capitulo: ${input.chapterTitle}`,
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
  chapterTitle?: string;
  chapterText: string;
  fullBookText: string;
  compactHistory: string;
}

interface BuildAutoRewritePromptInput {
  userInstruction: string;
  bookTitle: string;
  chapterTitle: string;
  chapterText: string;
  fullBookText: string;
  chapterIndex: number;
  chapterTotal: number;
  iteration: number;
  totalIterations: number;
}

export function buildChatPrompt(input: BuildChatPromptInput): string {
  return [
    `Libro: ${input.bookTitle}`,
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
