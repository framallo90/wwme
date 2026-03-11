import type { AppConfig } from '../types/book';
import { DEFAULT_SYSTEM_PROMPT } from './prompts';

export const DEFAULT_APP_CONFIG: AppConfig = {
  model: 'llama3.2:3b',
  language: 'es',
  theme: 'system',
  editorBackgroundTone: 'default',
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  temperature: 0.6,
  audioVoiceName: '',
  audioRate: 1,
  audioVolume: 1,
  aiResponseMode: 'equilibrado',
  autoVersioning: true,
  aiSafeMode: true,
  autoApplyChatChanges: false,
  bookAutoApplyEnabled: false,
  chatApplyIterations: 1,
  continuousAgentEnabled: true,
  continuousAgentMaxRounds: 3,
  continuityGuardEnabled: false,
  autosaveIntervalMs: 5000,
  backupEnabled: true,
  backupDirectory: '',
  backupIntervalMs: 120000,
  expertWriterMode: false,
  accessibilityHighContrast: false,
  accessibilityLargeText: false,
  ollamaOptions: {
    top_p: 0.9,
  },
};
