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

export async function generateWithOllama(input: GenerateInput): Promise<string> {
  try {
    const response = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: input.config.model,
        system: input.config.systemPrompt,
        prompt: input.prompt,
        stream: false,
        options: {
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
