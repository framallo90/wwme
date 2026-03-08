import { useMemo, useState } from 'react';

import type {
  AiAction,
  AiActionId,
  AiAssistantMode,
  ChapterRangeFilter,
  ChatMessage,
  ChatScope,
  PromptTemplate,
} from '../types/book';
import type { OllamaServiceStatus } from '../lib/ollamaClient';
import ContextTip from './ContextTip';

interface AiContextSummary {
  scopeLabel: string;
  manuscriptLabel: string;
  storyBibleCharacters: number;
  storyBibleLocations: number;
  storyBibleHasRules: boolean;
  sagaTitle: string | null;
  sagaCharacters: number;
  sagaLocations: number;
  sagaTimelineEvents: number;
  sagaSecrets: number;
  sagaRelationships: number;
  pinnedRuleCount: number;
  pinnedRulesPreview: string[];
  historyMessageCount: number;
}

interface AIPanelProps {
  actions: AiAction[];
  aiBusy: boolean;
  canUndoSnapshots: boolean;
  canRedoSnapshots: boolean;
  canRollbackAiSession: boolean;
  scope: ChatScope;
  chapterLengthInfo: string;
  bookLengthInfo: string;
  messages: ChatMessage[];
  autoApplyChatChanges: boolean;
  bookAutoApplyEnabled: boolean;
  bookAutoApplyReleaseEnabled: boolean;
  chatApplyIterations: number;
  continuousAgentEnabled: boolean;
  continuousAgentMaxRounds: number;
  promptTemplates: PromptTemplate[];
  ollamaStatus: OllamaServiceStatus;
  contextSummary: AiContextSummary | null;
  assistantMode: AiAssistantMode;
  onScopeChange: (scope: ChatScope) => void;
  onAssistantModeChange: (mode: AiAssistantMode) => void;
  onRefreshOllamaStatus: () => void;
  onRunAction: (actionId: AiActionId) => void;
  onSendChat: (message: string, scope: ChatScope, mode: AiAssistantMode) => void;
  onTrackCharacter: (characterName: string, scope: ChatScope, range: ChapterRangeFilter) => void;
  onSummarizeStory: (scope: ChatScope, range: ChapterRangeFilter) => void;
  chapterCount: number;
  onUndoSnapshot: () => void;
  onRedoSnapshot: () => void;
  onRollbackAiSession: () => void;
  onSaveMilestone: () => void;
  onCreatePromptTemplate: (title: string, content: string) => void;
  onDeletePromptTemplate: (templateId: string) => void;
  onContextJump: (jump: { kind: 'chapter' | 'timeline' | 'saga-rule'; id: string; label: string }) => void;
}

interface ActionMeta {
  section: string;
  target: string;
  outcome: string;
  note: string;
  order: number;
}

interface WorkflowCard {
  id: string;
  title: string;
  description: string;
  cta: string;
  scopeLabel: string;
  actionId?: AiActionId;
  prefill?: string;
  scopes?: ChatScope[];
}

interface ComposerPreset {
  id: string;
  label: string;
  content: string;
}

interface ChatContextJump {
  kind: 'chapter' | 'timeline' | 'saga-rule';
  id: string;
  label: string;
}

interface ChatContextCitation {
  kind: 'chapter' | 'timeline' | 'saga-rule';
  id: string;
  label: string;
  snippet: string;
}

const CONSULT_ACTION_IDS = new Set<AiActionId>([
  'feedback-chapter',
  'feedback-book',
  'verify-pov-voice',
  'suggest-next-chapter',
  'detect-broken-promises',
  'compare-arc-rhythm',
  'loose-ends-check',
  'consult-world',
  'consult-economy',
  'consult-politics',
  'consult-tone-drift',
  'consult-rule-audit',
]);

const CONSULT_ONLY_ACTION_IDS = new Set<AiActionId>([
  'consult-world',
  'consult-economy',
  'consult-politics',
  'consult-tone-drift',
  'consult-rule-audit',
]);

const ACTION_META: Record<AiActionId, ActionMeta> = {
  'draft-from-idea': { section: 'Generar', target: 'Capitulo', outcome: 'Borrador', note: 'Arranque guiado por canon.', order: 10 },
  'align-with-foundation': { section: 'Generar', target: 'Capitulo', outcome: 'Canon', note: 'Vuelve a promesa y tono base.', order: 20 },
  'suggest-next-chapter': { section: 'Generar', target: 'Capitulo', outcome: 'Plan', note: 'Ordena el siguiente movimiento.', order: 30 },
  'polish-style': { section: 'Pulido', target: 'Seleccion', outcome: 'Reescritura', note: 'La pasada mas rentable sobre texto ya escrito.', order: 40 },
  'rewrite-tone': { section: 'Pulido', target: 'Seleccion', outcome: 'Tono', note: 'Reenfoca el registro emocional.', order: 50 },
  'improve-transitions': { section: 'Pulido', target: 'Seleccion', outcome: 'Flujo', note: 'Une beats y parrafos.', order: 60 },
  'shorten-20': { section: 'Pulido', target: 'Seleccion', outcome: 'Compresion', note: 'Condensa sin vaciar.', order: 70 },
  'expand-examples': { section: 'Escena y conflicto', target: 'Seleccion', outcome: 'Expansion', note: 'Mas beats, cuerpo y detalle.', order: 80 },
  'deepen-argument': { section: 'Escena y conflicto', target: 'Seleccion', outcome: 'Conflicto', note: 'Mas deseo, temor y subtexto.', order: 90 },
  consistency: { section: 'Escena y conflicto', target: 'Capitulo', outcome: 'Voz y canon', note: 'Unifica terminos y registro.', order: 100 },
  'feedback-chapter': { section: 'Diagnostico', target: 'Capitulo', outcome: 'Informe', note: 'Lectura editorial accionable.', order: 110 },
  'verify-pov-voice': { section: 'Diagnostico', target: 'Capitulo', outcome: 'POV', note: 'Busca filtraciones y quiebres de voz.', order: 120 },
  'compare-arc-rhythm': { section: 'Diagnostico', target: 'Capitulo', outcome: 'Ritmo', note: 'Mide energia contra el arco.', order: 130 },
  'feedback-book': { section: 'Diagnostico', target: 'Libro', outcome: 'Informe', note: 'Revision macro del libro.', order: 140 },
  'detect-broken-promises': { section: 'Continuidad', target: 'Capitulo', outcome: 'Riesgos', note: 'Promesas y siembras flojas.', order: 150 },
  'loose-ends-check': { section: 'Continuidad', target: 'Libro', outcome: 'Riesgos', note: 'Chequeo global antes de cerrar.', order: 160 },
  'consult-rule-audit': { section: 'Continuidad', target: 'Libro', outcome: 'Auditoria', note: 'Cruza reglas, magia y conlangs.', order: 170 },
  'consult-world': { section: 'Mundo', target: 'Libro', outcome: 'Consulta', note: 'Geografia, historia y logistica.', order: 180 },
  'consult-economy': { section: 'Mundo', target: 'Libro', outcome: 'Economia', note: 'Hambre, rutas y recursos.', order: 190 },
  'consult-politics': { section: 'Mundo', target: 'Libro', outcome: 'Politica', note: 'Facciones y legitimidad.', order: 200 },
  'consult-tone-drift': { section: 'Mundo', target: 'Libro', outcome: 'Tono', note: 'Deriva tonal contra el pacto.', order: 210 },
};

const MODE_COPY: Record<AiAssistantMode, { kicker: string; title: string; summary: string }> = {
  rewrite: {
    kicker: 'Mesa de reescritura',
    title: 'Usala para empujar escenas concretas',
    summary: 'Sirve mejor sobre fragmentos, cierres, dialogos y capitulos ya existentes que sobre pedidos vagos.',
  },
  consultor: {
    kicker: 'Mesa de diagnostico',
    title: 'Usala para leer, contrastar y devolver evidencia',
    summary: 'Es mas valiosa como lector analitico del mundo y del manuscrito que como autor fantasma.',
  },
};

const WORKFLOWS: Record<AiAssistantMode, WorkflowCard[]> = {
  rewrite: [
    { id: 'draft', title: 'Abrir capitulo desde idea', description: 'Premisa breve a borrador guiado.', cta: 'Generar', scopeLabel: 'Capitulo', actionId: 'draft-from-idea', scopes: ['chapter'] },
    { id: 'polish', title: 'Pulir escena activa', description: 'La pasada de mejor retorno cuando ya hay texto.', cta: 'Aplicar', scopeLabel: 'Seleccion', actionId: 'polish-style', scopes: ['chapter'] },
    { id: 'subtext', title: 'Subir subtexto', description: 'Prepara un pedido de dialogo con tension.', cta: 'Preparar', scopeLabel: 'Chat', scopes: ['chapter'], prefill: 'Reescribe el dialogo para reforzar subtexto, friccion y objetivos cruzados. Evita explicar emociones.' },
    { id: 'hook', title: 'Cerrar con gancho', description: 'Prepara un cierre que arrastre al lector.', cta: 'Preparar', scopeLabel: 'Chat', scopes: ['chapter'], prefill: 'Reescribe el cierre para dejar una necesidad de lectura inmediata nacida del conflicto del capitulo.' },
  ],
  consultor: [
    { id: 'feedback', title: 'Diagnostico inmediato', description: 'Lectura editorial del capitulo activo.', cta: 'Analizar', scopeLabel: 'Capitulo', actionId: 'feedback-chapter', scopes: ['chapter'] },
    { id: 'pov', title: 'Auditoria de POV', description: 'Chequea foco, acceso mental y voz.', cta: 'Auditar', scopeLabel: 'Capitulo', actionId: 'verify-pov-voice', scopes: ['chapter'] },
    { id: 'world', title: 'Consecuencias del mundo', description: 'Prepara una consulta politica y logistica.', cta: 'Preparar', scopeLabel: 'Chat', prefill: 'Analiza las consecuencias politicas, economicas y logisticas de [evento] usando solo evidencia interna.' },
    { id: 'loose', title: 'Cabos y promesas', description: 'Chequeo macro antes de cerrar libro.', cta: 'Revisar', scopeLabel: 'Libro', actionId: 'loose-ends-check', scopes: ['book'] },
  ],
};

const COMPOSER_PRESETS: Record<AiAssistantMode, ComposerPreset[]> = {
  rewrite: [
    { id: 'subtext', label: 'Subtexto', content: 'Reescribe el dialogo para reforzar subtexto, tension y objetivos cruzados.' },
    { id: 'sensorial', label: 'Mas cuerpo', content: 'Amplia la escena con beats fisicos, reacciones concretas y detalle sensorial selectivo.' },
    { id: 'condense', label: 'Condensar', content: 'Condensa el fragmento sin perder conflicto, atmosfera ni informacion clave.' },
    { id: 'hook', label: 'Gancho final', content: 'Reescribe el cierre para dejar una necesidad de lectura inmediata y coherente.' },
  ],
  consultor: [
    { id: 'tone', label: 'Comparar tono', content: 'Compara el tono del capitulo activo con los tres anteriores y lista riesgos con evidencia.' },
    { id: 'continuity', label: 'Riesgos canon', content: 'Lista tres riesgos reales de continuidad o canon con evidencia y mitigacion.' },
    { id: 'politics', label: 'Consecuencia politica', content: 'Analiza las consecuencias politicas de [evento] sobre alianzas, legitimidad y facciones.' },
    { id: 'economy', label: 'Economia', content: 'Analiza el impacto economico y logistico de [evento] sobre recursos, rutas, hambre y tiempos.' },
  ],
};

const CONTEXT_JUMP_PATTERN = /\[\[JUMP:(chapter|timeline|saga-rule):([^|\]]+)\|([^\]]+)\]\]/g;
const CONTEXT_CITE_PATTERN = /\[\[CITE:(chapter|timeline|saga-rule):([^|\]]+)\|([^|\]]+)\|([^\]]+)\]\]/g;

function parseChatContent(content: string): { text: string; jumps: ChatContextJump[]; citations: ChatContextCitation[] } {
  const jumps: ChatContextJump[] = [];
  const citations: ChatContextCitation[] = [];
  const cleaned = content
    .replace(CONTEXT_JUMP_PATTERN, (_full, rawKind: string, rawId: string, rawLabel: string) => {
      const kind = rawKind === 'timeline' || rawKind === 'saga-rule' ? rawKind : 'chapter';
      const id = String(rawId ?? '').trim();
      const label = String(rawLabel ?? '').trim();
      if (!id || !label) {
        return '';
      }
      jumps.push({
        kind,
        id,
        label,
      });
      return '';
    })
    .replace(
      CONTEXT_CITE_PATTERN,
      (_full, rawKind: string, rawId: string, rawLabel: string, rawSnippet: string) => {
        const kind = rawKind === 'timeline' || rawKind === 'saga-rule' ? rawKind : 'chapter';
        const id = String(rawId ?? '').trim();
        const label = String(rawLabel ?? '').trim();
        const snippet = String(rawSnippet ?? '').trim();
        if (!id || !label || !snippet) {
          return '';
        }
        citations.push({
          kind,
          id,
          label,
          snippet,
        });
        return '';
      },
    )
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return {
    text: cleaned,
    jumps,
    citations,
  };
}

function AIPanel(props: AIPanelProps) {
  const [chatInput, setChatInput] = useState('');
  const [characterTrackInput, setCharacterTrackInput] = useState('');
  const [rangeFromInput, setRangeFromInput] = useState('');
  const [rangeToInput, setRangeToInput] = useState('');
  const [newPromptTitle, setNewPromptTitle] = useState('');
  const [newPromptContent, setNewPromptContent] = useState('');

  const visibleActions = useMemo(
    () =>
      props.actions
        .filter((action) =>
          props.assistantMode === 'consultor'
            ? CONSULT_ACTION_IDS.has(action.id)
            : !CONSULT_ONLY_ACTION_IDS.has(action.id),
        )
        .sort((left, right) => (ACTION_META[left.id]?.order ?? 999) - (ACTION_META[right.id]?.order ?? 999)),
    [props.actions, props.assistantMode],
  );

  const actionSections = useMemo(() => {
    const grouped = new Map<string, AiAction[]>();
    for (const action of visibleActions) {
      const section = ACTION_META[action.id]?.section ?? 'Otros';
      grouped.set(section, [...(grouped.get(section) ?? []), action]);
    }
    return Array.from(grouped.entries());
  }, [visibleActions]);

  const workflows = useMemo(
    () => WORKFLOWS[props.assistantMode].filter((item) => !item.scopes || item.scopes.includes(props.scope)),
    [props.assistantMode, props.scope],
  );

  const autoApplyEnabledForScope =
    props.assistantMode === 'rewrite' &&
    props.autoApplyChatChanges &&
    (props.scope === 'chapter' || (props.bookAutoApplyEnabled && props.bookAutoApplyReleaseEnabled));

  const handleSend = () => {
    const message = chatInput.trim();
    if (!message) {
      return;
    }
    props.onSendChat(message, props.scope, props.assistantMode);
    setChatInput('');
  };

  const handleCreatePromptTemplate = () => {
    const title = newPromptTitle.trim();
    const content = newPromptContent.trim();
    if (!title || !content) {
      return;
    }
    props.onCreatePromptTemplate(title, content);
    setNewPromptTitle('');
    setNewPromptContent('');
  };

  const parseChapterNumber = (value: string): number | null => {
    const parsed = Number.parseInt(value.trim(), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return null;
    }
    return parsed;
  };

  const buildRangeFilter = (): ChapterRangeFilter => ({
    fromChapter: parseChapterNumber(rangeFromInput),
    toChapter: parseChapterNumber(rangeToInput),
  });

  const appendToChatInput = (content: string) => {
    const trimmed = content.trim();
    if (!trimmed) {
      return;
    }
    setChatInput((current) => (current.trim() ? `${current.trim()}\n\n${trimmed}` : trimmed));
  };

  const insertTemplate = (template: PromptTemplate) => {
    appendToChatInput(template.content);
  };

  const modeCopy = MODE_COPY[props.assistantMode];
  const composerPresets = COMPOSER_PRESETS[props.assistantMode];

  return (
    <aside className="ai-panel ai-workbench-panel">
      <header className="ai-workbench-hero">
        <div className="ai-panel-header-row">
          <h2>
            Panel IA <ContextTip text="Mesa de trabajo local con Ollama: reescritura, diagnostico y consultas de mundo." />
          </h2>
          <button type="button" onClick={props.onRefreshOllamaStatus} disabled={props.ollamaStatus.state === 'checking'}>
            {props.ollamaStatus.state === 'checking' ? 'Revisando...' : 'Revisar'}
          </button>
        </div>
        <p className={`ollama-status-pill is-${props.ollamaStatus.state}`}>{props.ollamaStatus.message}</p>
        <div className="assistant-mode-toggle ai-mode-toggle">
          <button type="button" className={props.assistantMode === 'rewrite' ? 'is-active' : ''} onClick={() => props.onAssistantModeChange('rewrite')}>
            Modo reescritura
          </button>
          <button type="button" className={props.assistantMode === 'consultor' ? 'is-active' : ''} onClick={() => props.onAssistantModeChange('consultor')}>
            Modo consultor
          </button>
        </div>
        <div className="ai-mode-summary">
          <div className="ai-mode-copy">
            <span className="section-kicker">{modeCopy.kicker}</span>
            <h3>{modeCopy.title}</h3>
          </div>
          <div className="ai-mode-badges">
            <span className={`ai-chip ${props.scope === 'book' ? 'is-book' : 'is-chapter'}`}>
              {props.scope === 'chapter' ? 'Foco: capitulo' : 'Foco: libro'}
            </span>
            <span className={`ai-chip ${autoApplyEnabledForScope ? 'is-apply' : 'is-safe'}`}>
              {props.assistantMode === 'consultor' ? 'Sin autoaplicar' : autoApplyEnabledForScope ? 'Autoaplicar activo' : 'Modo consulta'}
            </span>
          </div>
        </div>
        <p className="ai-mode-description">{modeCopy.summary}</p>
      </header>

      <section className="quick-actions ai-surface-card">
        <div className="section-title-row">
          <h3>Flujos recomendados</h3>
          <span className="muted">{props.assistantMode === 'rewrite' ? 'Atajos de alto retorno' : 'Chequeos con mas valor'}</span>
        </div>
        <div className="ai-workflow-grid">
          {workflows.map((workflow) => (
            <article key={workflow.id} className="ai-workflow-card">
              <div className="ai-workflow-head">
                <strong>{workflow.title}</strong>
                <span className="ai-chip">{workflow.scopeLabel}</span>
              </div>
              <p>{workflow.description}</p>
              <button type="button" disabled={props.aiBusy} onClick={() => (workflow.actionId ? props.onRunAction(workflow.actionId) : appendToChatInput(workflow.prefill ?? ''))}>
                {workflow.cta}
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="quick-actions ai-surface-card">
        <div className="section-title-row">
          <h3>Control editorial</h3>
          <span className="muted">No dependas de una sola pasada de IA</span>
        </div>
        <div className="ai-control-grid">
          <button type="button" className="ai-control-card" onClick={props.onUndoSnapshot} disabled={!props.canUndoSnapshots || props.aiBusy}>
            <strong>Deshacer IA</strong>
            <small>Vuelve al ultimo punto de restauracion.</small>
          </button>
          <button type="button" className="ai-control-card" onClick={props.onRedoSnapshot} disabled={!props.canRedoSnapshots || props.aiBusy}>
            <strong>Rehacer IA</strong>
            <small>Recupera la ultima version descartada.</small>
          </button>
          <button type="button" className="ai-control-card" onClick={props.onRollbackAiSession} disabled={!props.canRollbackAiSession || props.aiBusy}>
            <strong>Revertir sesion</strong>
            <small>Desarma una tanda completa de cambios.</small>
          </button>
          <button type="button" className="ai-control-card" onClick={props.onSaveMilestone} disabled={props.aiBusy || !props.canUndoSnapshots}>
            <strong>Guardar hito</strong>
            <small>Crea una version segura antes de tocar algo delicado.</small>
          </button>
        </div>
      </section>

      <section className="quick-actions ai-surface-card">
        <div className="section-title-row">
          <h3>Acciones por objetivo</h3>
          <span className="muted">Cada boton indica foco y salida</span>
        </div>
        <div className="ai-action-sections">
          {actionSections.map(([section, actions]) => (
            <article key={section} className="ai-action-section">
              <div className="ai-action-section-head">
                <h4>{section}</h4>
              </div>
              <div className="ai-action-card-grid">
                {actions.map((action) => {
                  const meta = ACTION_META[action.id];
                  return (
                    <button key={action.id} type="button" className="ai-action-card" disabled={props.aiBusy} onClick={() => props.onRunAction(action.id)} title={action.description}>
                      <div className="ai-action-card-head">
                        <strong>{action.label}</strong>
                        <div className="ai-action-badges">
                          <span className="ai-chip">{meta.target}</span>
                          <span className="ai-chip is-outcome">{meta.outcome}</span>
                        </div>
                      </div>
                      <p>{action.description}</p>
                      <small>{meta.note}</small>
                    </button>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="chat-section chat-section-main ai-surface-card">
        <div className="section-title-row">
          <h3>Chat guiado</h3>
          <span className="muted">Consulta libre con presets utiles</span>
        </div>
        <div className="assistant-mode-toggle ai-scope-toggle">
          <button type="button" className={props.scope === 'chapter' ? 'is-active' : ''} onClick={() => props.onScopeChange('chapter')}>
            Por capitulo
          </button>
          <button type="button" className={props.scope === 'book' ? 'is-active' : ''} onClick={() => props.onScopeChange('book')}>
            Por libro
          </button>
        </div>
        <div className="length-info-box ai-length-box">
          <strong>Longitud objetivo</strong>
          <p>{props.scope === 'chapter' ? props.chapterLengthInfo : props.bookLengthInfo}</p>
        </div>
        <p className="muted">
          {props.assistantMode === 'consultor'
            ? 'Modo consultor: respuestas analiticas con evidencia trazable.'
            : 'Modo reescritura: mejor si pides objetivos concretos sobre una escena o fragmento.'}
        </p>
        <div className="ai-composer-presets">
          {composerPresets.map((preset) => (
            <button key={preset.id} type="button" className="ai-preset-chip" disabled={props.aiBusy} onClick={() => appendToChatInput(preset.content)}>
              {preset.label}
            </button>
          ))}
        </div>
        {props.contextSummary ? (
          <div className="ai-context-box">
            <div className="section-title-row">
              <h3>Contexto visible</h3>
              <span className="muted">{props.contextSummary.scopeLabel}</span>
            </div>
            <p className="muted">La IA prioriza manuscrito activo, fichas relevantes, reglas fijadas y hasta 8 mensajes recientes.</p>
            <ul className="ai-context-list">
              <li>Manuscrito: {props.contextSummary.manuscriptLabel}</li>
              <li>
                Biblia del libro: {props.contextSummary.storyBibleCharacters} personaje/s, {props.contextSummary.storyBibleLocations} lugar/es
                {props.contextSummary.storyBibleHasRules ? ' y reglas activas' : ''}
              </li>
              <li>
                {props.contextSummary.sagaTitle
                  ? `Saga "${props.contextSummary.sagaTitle}": ${props.contextSummary.sagaCharacters} personaje/s, ${props.contextSummary.sagaLocations} lugar/es, ${props.contextSummary.sagaTimelineEvents} evento/s, ${props.contextSummary.sagaSecrets} secreto/s y ${props.contextSummary.sagaRelationships} relacion/es.`
                  : 'Sin saga cargada: la IA trabaja solo con el libro activo.'}
              </li>
              <li>Historial reciente enviado: {props.contextSummary.historyMessageCount} mensaje/s</li>
            </ul>
            {props.contextSummary.pinnedRuleCount > 0 ? (
              <div className="ai-pinned-rules">
                <strong>Reglas fijadas para IA ({props.contextSummary.pinnedRuleCount})</strong>
                <ul className="ai-context-list">
                  {props.contextSummary.pinnedRulesPreview.map((rule) => (
                    <li key={rule}>{rule}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="ai-utility-grid">
          <article className="ai-utility-card">
            <div className="section-title-row">
              <h4>Seguimiento de personaje</h4>
              <span className="muted">Consulta puntual</span>
            </div>
            <div className="character-track-row">
              <input
                value={characterTrackInput}
                onChange={(event) => setCharacterTrackInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    const name = characterTrackInput.trim();
                    if (name) {
                      props.onTrackCharacter(name, props.scope, buildRangeFilter());
                    }
                  }
                }}
                placeholder="Nombre del personaje"
                disabled={props.aiBusy}
              />
              <button
                type="button"
                onClick={() => {
                  const name = characterTrackInput.trim();
                  if (name) {
                    props.onTrackCharacter(name, props.scope, buildRangeFilter());
                  }
                }}
                disabled={props.aiBusy}
              >
                Rastrear
              </button>
            </div>
          </article>
          <article className="ai-utility-card">
            <div className="section-title-row">
              <h4>Resumen por rango</h4>
              <span className="muted">Cronologia</span>
            </div>
            <div className="chat-range-row">
              <label>
                Desde cap
                <input type="number" min={1} max={props.chapterCount} value={rangeFromInput} onChange={(event) => setRangeFromInput(event.target.value)} placeholder="1" disabled={props.aiBusy} />
              </label>
              <label>
                Hasta cap
                <input type="number" min={1} max={props.chapterCount} value={rangeToInput} onChange={(event) => setRangeToInput(event.target.value)} placeholder={String(props.chapterCount)} disabled={props.aiBusy} />
              </label>
              <button type="button" onClick={() => props.onSummarizeStory(props.scope, buildRangeFilter())} disabled={props.aiBusy}>
                Resumir
              </button>
            </div>
          </article>
        </div>
        <div className="ai-state-notes">
          <p className="muted">
            {autoApplyEnabledForScope ? `Auto-aplicar activo (${props.chatApplyIterations} iteracion/es).` : 'Modo consulta (sin auto-aplicar).'}
          </p>
          {props.scope === 'book' && props.autoApplyChatChanges && !props.bookAutoApplyEnabled ? (
            <p className="muted">Trust Mode: auto-aplicado de libro bloqueado hasta habilitarlo en Preferencias.</p>
          ) : null}
          {props.scope === 'book' && props.autoApplyChatChanges && props.bookAutoApplyEnabled && !props.bookAutoApplyReleaseEnabled ? (
            <p className="muted">Politica de release: auto-aplicado de libro deshabilitado en esta build.</p>
          ) : null}
          {props.scope === 'chapter' && props.autoApplyChatChanges ? (
            <p className="muted">
              {props.continuousAgentEnabled ? `Agente continuo activo (${props.continuousAgentMaxRounds} rondas max).` : 'Agente continuo desactivado.'}
            </p>
          ) : null}
        </div>
        <div className="chat-history">
          {props.messages.length === 0 ? (
            <p className="muted">Sin mensajes.</p>
          ) : (
            props.messages.map((message) => (
              (() => {
                const parsed = parseChatContent(message.content);
                return (
                  <article key={message.id} className={`chat-message ${message.role}`}>
                    <strong>{message.role === 'user' ? 'Vos' : 'IA'}</strong>
                    {parsed.text ? <p>{parsed.text}</p> : null}
                    {parsed.jumps.length > 0 ? (
                      <div className="chat-context-jumps">
                        {parsed.jumps.map((jump) => (
                          <button
                            key={`${message.id}-${jump.kind}-${jump.id}-${jump.label}`}
                            type="button"
                            className="chat-context-jump"
                            onClick={() => props.onContextJump(jump)}
                          >
                            {jump.label}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    {parsed.citations.length > 0 ? (
                      <div className="chat-evidence-list">
                        {parsed.citations.map((citation) => (
                          <div
                            key={`${message.id}-cite-${citation.kind}-${citation.id}-${citation.label}`}
                            className="chat-evidence-item"
                          >
                            <button
                              type="button"
                              className="chat-context-jump"
                              onClick={() =>
                                props.onContextJump({
                                  kind: citation.kind,
                                  id: citation.id,
                                  label: citation.label,
                                })
                              }
                            >
                              {citation.label}
                            </button>
                            <small>"{citation.snippet}"</small>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </article>
                );
              })()
            ))
          )}
        </div>
        <div className="chat-input-row">
          <textarea
            rows={4}
            value={chatInput}
            onChange={(event) => setChatInput(event.target.value)}
            placeholder={
              props.assistantMode === 'consultor'
                ? 'Ej: analiza las consecuencias politicas de una sequia de cinco anios usando solo evidencia interna.'
                : 'Ej: reescribe este cierre con mas tension, subtexto y una promesa clara para el siguiente capitulo.'
            }
          />
          <button type="button" onClick={handleSend} disabled={props.aiBusy}>
            {autoApplyEnabledForScope ? 'Enviar y aplicar' : 'Enviar consulta'}
          </button>
        </div>
      </section>

      <section className="chat-section chat-section-prompt-library ai-surface-card">
        <details className="panel-collapsible">
          <summary>Biblioteca de prompts</summary>
          <div className="collapsible-body">
            <p className="muted">Plantillas reutilizables para consultas o revisiones frecuentes.</p>
            <div className="prompt-library-form">
              <input value={newPromptTitle} onChange={(event) => setNewPromptTitle(event.target.value)} placeholder="Nombre del prompt" disabled={props.aiBusy} />
              <textarea rows={3} value={newPromptContent} onChange={(event) => setNewPromptContent(event.target.value)} placeholder="Texto base del prompt..." disabled={props.aiBusy} />
              <button type="button" onClick={handleCreatePromptTemplate} disabled={props.aiBusy}>
                Guardar prompt
              </button>
            </div>
            <div className="prompt-library-list">
              {props.promptTemplates.length === 0 ? (
                <p className="muted">Sin prompts guardados.</p>
              ) : (
                props.promptTemplates.map((template) => (
                  <article key={template.id} className="prompt-library-item">
                    <strong>{template.title}</strong>
                    <p>{template.content}</p>
                    <div className="prompt-library-actions">
                      <button type="button" onClick={() => insertTemplate(template)} disabled={props.aiBusy}>
                        Usar
                      </button>
                      <button type="button" onClick={() => props.onDeletePromptTemplate(template.id)} disabled={props.aiBusy}>
                        Eliminar
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>
          </div>
        </details>
      </section>
    </aside>
  );
}

export default AIPanel;
