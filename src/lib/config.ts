import type { AppConfig } from '../types/book';
import { DEFAULT_SYSTEM_PROMPT } from './prompts';

export const DEFAULT_APP_CONFIG: AppConfig = {
  model: 'llama3.2:3b',
  language: 'es',
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  temperature: 0.6,
  aiResponseMode: 'equilibrado',
  autoVersioning: true,
  aiSafeMode: true,
  autoApplyChatChanges: true,
  chatApplyIterations: 1,
  continuousAgentEnabled: true,
  continuousAgentMaxRounds: 3,
  continuityGuardEnabled: false,
  autosaveIntervalMs: 5000,
  backupEnabled: false,
  backupDirectory: '',
  backupIntervalMs: 120000,
  accessibilityHighContrast: false,
  accessibilityLargeText: false,
  ollamaOptions: {
    top_p: 0.9,
  },
};
