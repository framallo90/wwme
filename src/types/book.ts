export type MainView = 'editor' | 'outline' | 'cover' | 'foundation' | 'settings';

export type ChatScope = 'chapter' | 'book';

export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  scope: ChatScope;
}

export interface ChapterDocument {
  id: string;
  title: string;
  content: string;
  contentJson?: unknown | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChapterSnapshot {
  version: number;
  chapterId: string;
  reason: string;
  createdAt: string;
  chapter: ChapterDocument;
}

export interface BookChats {
  book: ChatMessage[];
  chapters: Record<string, ChatMessage[]>;
}

export interface BookFoundation {
  centralIdea: string;
  promise: string;
  audience: string;
  narrativeVoice: string;
  styleRules: string;
  structureNotes: string;
  glossaryPreferred: string;
  glossaryAvoid: string;
}

export interface BookMetadata {
  title: string;
  author: string;
  chapterOrder: string[];
  coverImage: string | null;
  foundation: BookFoundation;
  createdAt: string;
  updatedAt: string;
  chats: BookChats;
}

export interface BookProject {
  path: string;
  metadata: BookMetadata;
  chapters: Record<string, ChapterDocument>;
}

export interface AppConfig {
  model: string;
  systemPrompt: string;
  temperature: number;
  autoVersioning: boolean;
  autoApplyChatChanges: boolean;
  chatApplyIterations: number;
  continuousAgentEnabled: boolean;
  continuousAgentMaxRounds: number;
  ollamaOptions: Record<string, number | string | boolean>;
  autosaveIntervalMs: number;
}

export type AiActionId =
  | 'draft-from-idea'
  | 'polish-style'
  | 'rewrite-tone'
  | 'expand-examples'
  | 'shorten-20'
  | 'consistency'
  | 'improve-transitions'
  | 'deepen-argument'
  | 'align-with-foundation'
  | 'feedback-chapter'
  | 'feedback-book';

export interface AiAction {
  id: AiActionId;
  label: string;
  description: string;
  modifiesText: boolean;
}
