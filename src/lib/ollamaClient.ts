import type { AppConfig } from '../types/book';

const OLLAMA_URL = 'http://localhost:11434/api/generate';

interface OllamaGenerateResult {
  response: string;
  done: boolean;
  model: string;
}

interface GenerateInput {
  config: AppConfig;
  prompt: string;
}

function compressPrompt(prompt: string, mode: AppConfig['aiResponseMode']): string {
  const normalized = prompt.trim();
  const maxChars = mode === 'rapido' ? 12000 : mode === 'calidad' ? 32000 : 22000;
  if (normalized.length <= maxChars) {
    return normalized;
  }

  const headSize = Math.min(5000, Math.floor(maxChars * 0.45));
  const tailSize = Math.max(2000, maxChars - headSize - 180);
  const head = normalized.slice(0, headSize);
  const tail = normalized.slice(-tailSize);
  return `${head}\n\n[... contexto intermedio resumido para reducir latencia ...]\n\n${tail}`;
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

export async function generateWithOllama(input: GenerateInput): Promise<string> {
  try {
    const mode = input.config.aiResponseMode ?? 'equilibrado';
    const prompt = compressPrompt(input.prompt, mode);
    const response = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
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
    if (error instanceof TypeError) {
      throw new Error('No se pudo conectar con Ollama en localhost:11434. Inicia Ollama.');
    }

    throw error;
  }
}
