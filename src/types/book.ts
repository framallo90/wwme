export type MainView =
  | 'editor'
  | 'outline'
  | 'preview'
  | 'diff'
  | 'style'
  | 'cover'
  | 'foundation'
  | 'bible'
  | 'saga'
  | 'timeline'
  | 'plot'
  | 'relations'
  | 'atlas'
  | 'amazon'
  | 'search'
  | 'settings'
  | 'language'
  | 'scratchpad'
  | 'loose-threads'
  | 'char-matrix';

export type ChatScope = 'chapter' | 'book';
export type AiAssistantMode = 'rewrite' | 'consultor';
export type BookStatus = 'recien_creado' | 'avanzado' | 'publicado';

export type ChatRole = 'user' | 'assistant';
export type ChapterLengthPreset = 'corta' | 'media' | 'larga';
export type ChapterStatus = 'borrador' | 'en_revision' | 'final';
export type ChapterManuscriptNoteStatus = 'open' | 'resolved';

export interface ChapterManuscriptNote {
  id: string;
  excerpt: string;
  note: string;
  status: ChapterManuscriptNoteStatus;
  createdAt: string;
  updatedAt: string;
}

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
  pointOfView?: string;
  synopsis?: string;
  status?: ChapterStatus;
  wordTarget?: number | null;
  manuscriptNotes?: ChapterManuscriptNote[];
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

export type CanonStatus = 'canonical' | 'apocryphal';

export interface StoryCharacter {
  id: string;
  name: string;
  aliases: string;
  role: string;
  traits: string;
  goal: string;
  notes: string;
  canonStatus?: CanonStatus;
  physicalDescription?: string;
  age?: string;
  backstory?: string;
  emotionalArc?: string;
}

export interface StoryLocation {
  id: string;
  name: string;
  aliases: string;
  description: string;
  atmosphere: string;
  notes: string;
  canonStatus?: CanonStatus;
}

export interface BookSecret {
  id: string;
  title: string;
  objectiveTruth: string;
  perceivedTruth: string;
  notes: string;
  relatedCharacterIds: string[];
  revealedInChapterId?: string;
  canonStatus?: CanonStatus;
}

export interface StoryBible {
  characters: StoryCharacter[];
  locations: StoryLocation[];
  continuityRules: string;
  secrets?: BookSecret[];
}

export interface SagaWorldEntity {
  id: string;
  name: string;
  aliases: string;
  summary: string;
  notes: string;
  canonStatus?: CanonStatus;
}

export type SagaCharacterAliasType = 'birth-name' | 'nickname' | 'title' | 'codename' | 'secret-name' | 'public-name';

export interface SagaCharacterAlias {
  id: string;
  value: string;
  type: SagaCharacterAliasType;
  startOrder: number | null;
  endOrder: number | null;
  notes: string;
}

export type SagaCharacterStatus = 'alive' | 'dead' | 'missing' | 'unknown';

export interface SagaCharacterLifecycle {
  birthEventId: string | null;
  deathEventId: string | null;
  firstAppearanceEventId: string | null;
  lastKnownEventId: string | null;
  currentStatus: SagaCharacterStatus;
}

export interface SagaCharacterVersion {
  id: string;
  label: string;
  startOrder: number | null;
  endOrder: number | null;
  ageStart?: number | null;
  ageEnd?: number | null;
  status: SagaCharacterStatus;
  summary: string;
  notes: string;
}

export interface SagaCharacter extends SagaWorldEntity {
  aliasTimeline: SagaCharacterAlias[];
  lifecycle: SagaCharacterLifecycle;
  versions?: SagaCharacterVersion[];
}

export type SagaEntityKind =
  | 'character'
  | 'location'
  | 'route'
  | 'flora'
  | 'fauna'
  | 'faction'
  | 'system'
  | 'artifact';

export interface SagaEntityRef {
  kind: SagaEntityKind;
  id: string;
}

export interface SagaWorldRelationship {
  id: string;
  from: SagaEntityRef;
  to: SagaEntityRef;
  type: string;
  notes: string;
  startOrder?: number | null;
  endOrder?: number | null;
}

export type SagaTimelineEventCategory =
  | 'war'
  | 'journey'
  | 'birth'
  | 'death'
  | 'political'
  | 'discovery'
  | 'timeskip'
  | 'other';
export type SagaTimelineEventKind = 'point' | 'span';
export type SagaTimelineChapterRefMode = 'occurs' | 'mentioned' | 'revealed';

export interface SagaTimelineChapterRef {
  bookPath: string;
  chapterId: string;
  mode: SagaTimelineChapterRefMode;
  locationId?: string;
}

export type SagaTimelineImpactType =
  | 'birth'
  | 'death'
  | 'appearance'
  | 'disappearance'
  | 'injury'
  | 'promotion'
  | 'betrayal'
  | 'identity-change'
  | 'relationship-change'
  | 'other';

export interface SagaTimelineCharacterImpact {
  characterId: string;
  impactType: SagaTimelineImpactType;
  aliasUsed: string;
  stateChange: string;
}

export interface SagaTimelineArtifactTransfer {
  artifactId: string;
  fromCharacterId: string;
  toCharacterId: string;
  notes: string;
}

export interface SagaTimelineCharacterLocation {
  characterId: string;
  locationId: string;
  notes: string;
}

export type SagaTruthMode = 'objective' | 'perceived' | 'retcon' | 'unreliable';

export interface SagaTimelineSecretReveal {
  secretId: string;
  truthMode: SagaTruthMode;
  perceiverCharacterId: string;
  summary: string;
}

export interface SagaTimelineEvent {
  id: string;
  title: string;
  category: SagaTimelineEventCategory;
  kind: SagaTimelineEventKind;
  startOrder: number;
  endOrder: number | null;
  dependencyIds?: string[];
  laneId?: string;
  laneLabel?: string;
  eraLabel?: string;
  displayLabel: string;
  summary: string;
  notes: string;
  bookRefs: SagaTimelineChapterRef[];
  entityIds: string[];
  characterImpacts: SagaTimelineCharacterImpact[];
  artifactTransfers?: SagaTimelineArtifactTransfer[];
  characterLocations?: SagaTimelineCharacterLocation[];
  secretReveals?: SagaTimelineSecretReveal[];
  objectiveTruth?: string;
  perceivedTruth?: string;
  timeJumpYears?: number | null;
  canonStatus?: CanonStatus;
}

export interface SagaTimelineLane {
  id: string;
  label: string;
  color: string;
  era: string;
  description: string;
}

export interface SagaSecret {
  id: string;
  title: string;
  summary: string;
  objectiveTruth: string;
  notes: string;
  relatedEntityIds: string[];
  canonStatus?: CanonStatus;
}

export interface SagaBookLink {
  bookId: string;
  bookPath: string;
  title: string;
  author: string;
  volumeNumber: number | null;
  linkedAt: string;
}

export interface SagaAtlasLayer {
  id: string;
  name: string;
  description: string;
  color: string;
  visible: boolean;
}

export interface SagaAtlasPin {
  id: string;
  locationId: string;
  label: string;
  layerId: string;
  xPct: number;
  yPct: number;
  notes: string;
}

export interface SagaAtlasRouteMeasurement {
  id: string;
  fromPinId: string;
  toPinId: string;
  routeId: string;
  distanceOverride: number | null;
  travelHours: number | null;
  notes: string;
}

export interface SagaAtlasConfig {
  mapImagePath: string;
  distanceScale: number | null;
  distanceUnit: string;
  defaultTravelMode: string;
  showGrid: boolean;
  layers: SagaAtlasLayer[];
  pins: SagaAtlasPin[];
  routeMeasurements: SagaAtlasRouteMeasurement[];
}

export interface SagaConlangLexiconEntry {
  id: string;
  term: string;
  translation: string;
  notes: string;
}

export interface SagaConlang {
  id: string;
  name: string;
  phonetics: string;
  grammarNotes: string;
  styleRules: string;
  sampleText: string;
  lexicon: SagaConlangLexiconEntry[];
}

export interface SagaMagicSystem {
  id: string;
  name: string;
  summary: string;
  source: string;
  costs: string;
  limits: string;
  forbiddenActs: string;
  validationHints: string;
}

export interface SagaWorldBible {
  overview: string;
  characters: SagaCharacter[];
  locations: SagaWorldEntity[];
  routes: SagaWorldEntity[];
  flora: SagaWorldEntity[];
  fauna: SagaWorldEntity[];
  factions: SagaWorldEntity[];
  systems: SagaWorldEntity[];
  artifacts: SagaWorldEntity[];
  secrets?: SagaSecret[];
  relationships: SagaWorldRelationship[];
  timeline: SagaTimelineEvent[];
  timelineLanes: SagaTimelineLane[];
  atlas: SagaAtlasConfig;
  conlangs: SagaConlang[];
  magicSystems: SagaMagicSystem[];
  globalRules: string;
  pinnedAiRules: string;
  glossary: string;
}

export interface SagaMetadata {
  id: string;
  title: string;
  description: string;
  strictValidationMode?: boolean;
  books: SagaBookLink[];
  worldBible: SagaWorldBible;
  createdAt: string;
  updatedAt: string;
}

export interface SagaProject {
  path: string;
  metadata: SagaMetadata;
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
  dropCapEnabled: boolean;
  sceneBreakGlyph: string;
  widowOrphanControl: boolean;
  chapterOpeningStyle: 'standard' | 'dropcap' | 'ornamental';
}

export type LooseThreadStatus = 'open' | 'resolved' | 'dropped';
export type EditorialChecklistCustomLevel = 'error' | 'warning';

export interface LooseThread {
  id: string;
  title: string;
  description: string;
  status: LooseThreadStatus;
  chapterRef?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EditorialChecklistCustomItem {
  id: string;
  title: string;
  description: string;
  level: EditorialChecklistCustomLevel;
  checked: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BookMetadata {
  title: string;
  author: string;
  chapterOrder: string[];
  sagaId: string | null;
  sagaPath: string | null;
  sagaVolume: number | null;
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
  scratchpad?: string;
  looseThreads?: LooseThread[];
  editorialChecklistCustom?: EditorialChecklistCustomItem[];
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
  sagaId: string | null;
  sagaPath: string | null;
  sagaVolume: number | null;
  status: BookStatus;
  chapterCount: number;
  wordCount: number;
  coverImage: string | null;
  publishedAt: string | null;
  lastOpenedAt: string;
  updatedAt: string;
}

export interface LibrarySagaEntry {
  id: string;
  path: string;
  title: string;
  description: string;
  bookCount: number;
  lastOpenedAt: string;
  updatedAt: string;
}

export interface LibraryIndex {
  books: LibraryBookEntry[];
  sagas: LibrarySagaEntry[];
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
  bookAutoApplyEnabled: boolean;
  chatApplyIterations: number;
  continuousAgentEnabled: boolean;
  continuousAgentMaxRounds: number;
  continuityGuardEnabled: boolean;
  ollamaOptions: Record<string, number | string | boolean>;
  autosaveIntervalMs: number;
  backupEnabled: boolean;
  backupDirectory: string;
  backupIntervalMs: number;
  expertWriterMode: boolean;
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
  | 'feedback-book'
  | 'verify-pov-voice'
  | 'suggest-next-chapter'
  | 'detect-broken-promises'
  | 'compare-arc-rhythm'
  | 'loose-ends-check'
  | 'consult-world'
  | 'consult-economy'
  | 'consult-politics'
  | 'consult-tone-drift'
  | 'consult-rule-audit';

export interface AiAction {
  id: AiActionId;
  label: string;
  description: string;
  modifiesText: boolean;
}
