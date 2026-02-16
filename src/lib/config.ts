import type { AppConfig } from '../types/book';
import { DEFAULT_SYSTEM_PROMPT } from './prompts';

export const DEFAULT_APP_CONFIG: AppConfig = {
  model: 'llama3.2:3b',
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  temperature: 0.6,
  autoVersioning: true,
  autoApplyChatChanges: true,
  chatApplyIterations: 1,
  autosaveIntervalMs: 5000,
  ollamaOptions: {
    top_p: 0.9,
  },
};
