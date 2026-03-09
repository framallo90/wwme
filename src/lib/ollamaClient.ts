import type { AppConfig } from '../types/book';

const OLLAMA_BASE_URL = 'http://localhost:11434';
const OLLAMA_URL = `${OLLAMA_BASE_URL}/api/generate`;
const OLLAMA_TAGS_URL = `${OLLAMA_BASE_URL}/api/tags`;
const OLLAMA_STATUS_TIMEOUT_MS = 4000;
const OLLAMA_TIMEOUT_MS_BY_MODE: Record<AppConfig['aiResponseMode'], number> = {
  rapido: 45_000,
  equilibrado: 90_000,
  calidad: 120_000,
};

interface OllamaGenerateResult {
  response: string;
  done: boolean;
  model: string;
}

interface GenerateInput {
  config: AppConfig;
  prompt: string;
}

interface OllamaTagEntry {
  name?: unknown;
  model?: unknown;
}

interface OllamaTagsPayload {
  models?: OllamaTagEntry[];
}

export interface OllamaServiceStatus {
  state: 'idle' | 'checking' | 'ready' | 'missing-model' | 'offline' | 'error';
  configuredModel: string;
  availableModels: string[];
  message: string;
}

function scorePromptSegment(segment: string): number {
  const normalized = segment.toLowerCase();
  let score = Math.min(10, Math.floor(segment.length / 180));

  if (
    /\b(capitulo|chapter|escena|scene|conflicto|conflict|giro|twist|promesa|promise|traicion|betrayal|secreto|secret|climax|reveal|arc|pov|tono|tone)\b/u.test(
      normalized,
    )
  ) {
    score += 6;
  }

  if (/[?!]/.test(segment)) {
    score += 1;
  }

  if (/["“”'’]/.test(segment)) {
    score += 1;
  }

  return score;
}

export function compressPromptForModel(prompt: string, mode: AppConfig['aiResponseMode']): string {
  const normalized = prompt.trim();
  const maxChars = mode === 'rapido' ? 12000 : mode === 'calidad' ? 32000 : 22000;
  if (normalized.length <= maxChars) {
    return normalized;
  }

  const segments = normalized
    .split(/\n{2,}/g)
    .map((segment) => segment.trim())
    .filter(Boolean);

  // Fallback defensivo para prompts sin separadores por bloque.
  if (segments.length < 4) {
    const headSize = Math.floor(maxChars * 0.32);
    const middleSize = Math.floor(maxChars * 0.36);
    const tailSize = Math.max(1800, maxChars - headSize - middleSize - 220);
    const middleStart = Math.floor((normalized.length - middleSize) / 2);
    const head = normalized.slice(0, headSize);
    const middle = normalized.slice(middleStart, middleStart + middleSize);
    const tail = normalized.slice(-tailSize);
    return `${head}\n\n[... seccion intermedia resumida ...]\n\n${middle}\n\n[... seccion final resumida ...]\n\n${tail}`;
  }

  const headBudget = Math.floor(maxChars * 0.28);
  const middleBudget = Math.floor(maxChars * 0.44);
  const tailBudget = Math.max(1800, maxChars - headBudget - middleBudget - 240);
  const centerIndex = Math.floor(segments.length / 2);

  const selectedIndices = new Set<number>();
  let headUsed = 0;
  let tailUsed = 0;
  let headEnd = -1;
  let tailStart = segments.length;

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (headUsed >= headBudget && index > 0) {
      break;
    }
    selectedIndices.add(index);
    headEnd = index;
    headUsed += segment.length + 2;
  }

  for (let index = segments.length - 1; index >= 0; index -= 1) {
    if (index <= headEnd) {
      break;
    }
    const segment = segments[index];
    if (tailUsed >= tailBudget && index < segments.length - 1) {
      break;
    }
    selectedIndices.add(index);
    tailStart = index;
    tailUsed += segment.length + 2;
  }

  const middleCandidates: Array<{ index: number; score: number; distanceToCenter: number }> = [];
  for (let index = headEnd + 1; index < tailStart; index += 1) {
    const segment = segments[index];
    middleCandidates.push({
      index,
      score: scorePromptSegment(segment),
      distanceToCenter: Math.abs(index - centerIndex),
    });
  }

  middleCandidates.sort((left, right) => {
    if (left.score !== right.score) {
      return right.score - left.score;
    }
    return left.distanceToCenter - right.distanceToCenter;
  });

  let middleUsed = 0;
  for (const candidate of middleCandidates) {
    if (middleUsed >= middleBudget) {
      break;
    }
    const segment = segments[candidate.index];
    selectedIndices.add(candidate.index);
    middleUsed += segment.length + 2;
  }

  const orderedSelected = Array.from(selectedIndices).sort((left, right) => left - right);
  const outputParts: string[] = [];
  for (let index = 0; index < orderedSelected.length; index += 1) {
    const currentIndex = orderedSelected[index];
    const previousIndex = index > 0 ? orderedSelected[index - 1] : -1;
    if (index > 0 && currentIndex - previousIndex > 1) {
      outputParts.push('[... bloque intermedio resumido ...]');
    }
    outputParts.push(segments[currentIndex]);
  }

  const compressed = outputParts.join('\n\n').trim();
  return compressed.length <= maxChars ? compressed : compressed.slice(0, maxChars);
}

function resolveProfileOptions(mode: AppConfig['aiResponseMode']): Record<string, number> {
  if (mode === 'rapido') {
    return {
      num_predict: 280,
      num_ctx: 3072,
      top_k: 35,
    };
  }

  if (mode === 'calidad') {
    return {
      num_predict: 900,
      num_ctx: 8192,
      top_k: 45,
    };
  }

  return {
    num_predict: 520,
    num_ctx: 6144,
    top_k: 40,
  };
}

function resolveRequestTimeoutMs(mode: AppConfig['aiResponseMode']): number {
  return OLLAMA_TIMEOUT_MS_BY_MODE[mode] ?? OLLAMA_TIMEOUT_MS_BY_MODE.equilibrado;
}

export function extractOllamaModelNames(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const source = Array.isArray((payload as OllamaTagsPayload).models)
    ? (payload as OllamaTagsPayload).models ?? []
    : [];
  const names = source
    .map((entry) => {
      const rawName = typeof entry?.name === 'string' ? entry.name : entry?.model;
      return typeof rawName === 'string' ? rawName.trim() : '';
    })
    .filter(Boolean);

  return Array.from(new Set(names)).sort((left, right) => left.localeCompare(right));
}

export function buildOllamaServiceStatus(configuredModel: string, availableModels: string[]): OllamaServiceStatus {
  const normalizedModel = configuredModel.trim();
  const normalizedAvailableModels = Array.from(
    new Set(availableModels.map((entry) => entry.trim()).filter(Boolean)),
  ).sort((left, right) => left.localeCompare(right));

  if (normalizedAvailableModels.length === 0) {
    return {
      state: 'missing-model',
      configuredModel: normalizedModel,
      availableModels: normalizedAvailableModels,
      message: 'Ollama responde, pero no hay modelos descargados todavia.',
    };
  }

  if (!normalizedModel) {
    return {
      state: 'missing-model',
      configuredModel: normalizedModel,
      availableModels: normalizedAvailableModels,
      message: 'Ollama responde, pero falta definir un modelo en Settings.',
    };
  }

  if (!normalizedAvailableModels.includes(normalizedModel)) {
    return {
      state: 'missing-model',
      configuredModel: normalizedModel,
      availableModels: normalizedAvailableModels,
      message: `Ollama esta activo, pero el modelo "${normalizedModel}" no esta descargado.`,
    };
  }

  return {
    state: 'ready',
    configuredModel: normalizedModel,
    availableModels: normalizedAvailableModels,
    message: `Ollama listo. Modelo detectado: ${normalizedModel}.`,
  };
}

export async function inspectOllamaService(configuredModel: string): Promise<OllamaServiceStatus> {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => {
    controller.abort();
  }, OLLAMA_STATUS_TIMEOUT_MS);

  try {
    const response = await fetch(OLLAMA_TAGS_URL, {
      method: 'GET',
      signal: controller.signal,
    });

    if (!response.ok) {
      const details = await response.text();
      return {
        state: 'error',
        configuredModel: configuredModel.trim(),
        availableModels: [],
        message: details || `Ollama respondio con HTTP ${response.status}.`,
      };
    }

    const payload = (await response.json()) as OllamaTagsPayload;
    return buildOllamaServiceStatus(configuredModel, extractOllamaModelNames(payload));
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        state: 'offline',
        configuredModel: configuredModel.trim(),
        availableModels: [],
        message: 'Ollama no respondio a tiempo en localhost:11434.',
      };
    }

    if (error instanceof TypeError) {
      return {
        state: 'offline',
        configuredModel: configuredModel.trim(),
        availableModels: [],
        message: 'No se pudo conectar con Ollama en localhost:11434.',
      };
    }

    return {
      state: 'error',
      configuredModel: configuredModel.trim(),
      availableModels: [],
      message: error instanceof Error ? error.message : 'Error desconocido consultando Ollama.',
    };
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

export async function generateWithOllama(input: GenerateInput): Promise<string> {
  const mode = input.config.aiResponseMode ?? 'equilibrado';
  const timeoutMs = resolveRequestTimeoutMs(mode);
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const prompt = compressPromptForModel(input.prompt, mode);
    const response = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: input.config.model,
        system: input.config.systemPrompt,
        prompt,
        stream: false,
        options: {
          ...resolveProfileOptions(mode),
          temperature: input.config.temperature,
          ...input.config.ollamaOptions,
        },
      }),
    });

    if (!response.ok) {
      const details = await response.text();
      throw new Error(details || `Error HTTP ${response.status}`);
    }

    const payload = (await response.json()) as OllamaGenerateResult;
    return payload.response ?? '';
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Ollama no respondio en ${Math.round(timeoutMs / 1000)}s. Reintenta o reduce el alcance del pedido.`);
    }

    if (error instanceof TypeError) {
      throw new Error('No se pudo conectar con Ollama en localhost:11434. Inicia Ollama.');
    }

    throw error;
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}
