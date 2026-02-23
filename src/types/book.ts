export type MainView = 'editor' | 'outline' | 'cover' | 'foundation' | 'amazon' | 'settings';

export type ChatScope = 'chapter' | 'book';
export type BookStatus = 'recien_creado' | 'avanzado' | 'publicado';

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

export type AmazonPresetType = 'non-fiction-reflexive' | 'practical-essay' | 'intimate-narrative';

export interface AmazonKdpData {
  presetType: AmazonPresetType;
  marketplace: string;
  language: string;
  kdpTitle: string;
  subtitle: string;
  penName: string;
  seriesName: string;
  edition: string;
  keywords: string[];
  categories: string[];
  backCoverText: string;
  longDescription: string;
  authorBio: string;
  kdpNotes: string;
}

export interface InteriorFormat {
  trimSize: '5x8' | '5.5x8.5' | '6x9' | 'a5' | 'custom';
  pageWidthIn: number;
  pageHeightIn: number;
  marginTopMm: number;
  marginBottomMm: number;
  marginInsideMm: number;
  marginOutsideMm: number;
  paragraphIndentEm: number;
  lineHeight: number;
}

export interface BookMetadata {
  title: string;
  author: string;
  chapterOrder: string[];
  coverImage: string | null;
  backCoverImage: string | null;
  spineText: string;
  foundation: BookFoundation;
  amazon: AmazonKdpData;
  interiorFormat: InteriorFormat;
  isPublished: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  chats: BookChats;
}

export interface BookProject {
  path: string;
  metadata: BookMetadata;
  chapters: Record<string, ChapterDocument>;
}

export interface LibraryStatusRules {
  advancedChapterThreshold: number;
}

export interface LibraryBookEntry {
  id: string;
  path: string;
  title: string;
  author: string;
  status: BookStatus;
  chapterCount: number;
  wordCount: number;
  coverImage: string | null;
  publishedAt: string | null;
  lastOpenedAt: string;
  updatedAt: string;
}

export interface LibraryIndex {
  books: LibraryBookEntry[];
  statusRules: LibraryStatusRules;
  updatedAt: string;
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
