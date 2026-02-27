export type MainView =
  | 'editor'
  | 'outline'
  | 'preview'
  | 'diff'
  | 'style'
  | 'cover'
  | 'foundation'
  | 'bible'
  | 'amazon'
  | 'search'
  | 'settings'
  | 'language';

export type ChatScope = 'chapter' | 'book';
export type BookStatus = 'recien_creado' | 'avanzado' | 'publicado';

export type ChatRole = 'user' | 'assistant';
export type ChapterLengthPreset = 'corta' | 'media' | 'larga';

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
  lengthPreset: ChapterLengthPreset;
  createdAt: string;
  updatedAt: string;
}

export interface ChapterSnapshot {
  version: number;
  chapterId: string;
  reason: string;
  milestoneLabel?: string | null;
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

export interface StoryCharacter {
  id: string;
  name: string;
  aliases: string;
  role: string;
  traits: string;
  goal: string;
  notes: string;
}

export interface StoryLocation {
  id: string;
  name: string;
  aliases: string;
  description: string;
  atmosphere: string;
  notes: string;
}

export interface StoryBible {
  characters: StoryCharacter[];
  locations: StoryLocation[];
  continuityRules: string;
}

export type AmazonPresetType = 'non-fiction-reflexive' | 'practical-essay' | 'intimate-narrative';

export interface AmazonContributor {
  role: string;
  name: string;
}

export type AmazonRoyaltyPlan = 35 | 70;

export interface AmazonMarketPricing {
  marketplace: string;
  currency: string;
  ebookPrice: number | null;
  printPrice: number | null;
}

export interface AmazonKdpData {
  presetType: AmazonPresetType;
  marketplace: string;
  language: string;
  kdpTitle: string;
  subtitle: string;
  penName: string;
  seriesName: string;
  edition: string;
  contributors: AmazonContributor[];
  ownCopyright: boolean;
  isAdultContent: boolean;
  isbn: string;
  enableDRM: boolean;
  enrollKDPSelect: boolean;
  ebookRoyaltyPlan: AmazonRoyaltyPlan;
  printCostEstimate: number;
  marketPricing: AmazonMarketPricing[];
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
  storyBible: StoryBible;
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
  language: string;
  systemPrompt: string;
  temperature: number;
  audioVoiceName: string;
  audioRate: number;
  audioVolume: number;
  aiResponseMode: 'rapido' | 'equilibrado' | 'calidad';
  autoVersioning: boolean;
  aiSafeMode: boolean;
  autoApplyChatChanges: boolean;
  chatApplyIterations: number;
  continuousAgentEnabled: boolean;
  continuousAgentMaxRounds: number;
  continuityGuardEnabled: boolean;
  ollamaOptions: Record<string, number | string | boolean>;
  autosaveIntervalMs: number;
  backupEnabled: boolean;
  backupDirectory: string;
  backupIntervalMs: number;
  accessibilityHighContrast: boolean;
  accessibilityLargeText: boolean;
}

export interface PromptTemplate {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChapterRangeFilter {
  fromChapter: number | null;
  toChapter: number | null;
}

export interface CollaborationPatchChapter {
  chapterId: string;
  title: string;
  content: string;
  updatedAt: string;
}

export interface CollaborationPatch {
  version: 1;
  patchId: string;
  createdAt: string;
  sourceBookTitle: string;
  sourceAuthor: string;
  sourceLanguage: string;
  notes: string;
  chapters: CollaborationPatchChapter[];
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
