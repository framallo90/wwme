import { useState } from 'react';

import type { AiAction, AiActionId, ChapterRangeFilter, ChatMessage, ChatScope, PromptTemplate } from '../types/book';
import ContextTip from './ContextTip';

interface AIPanelProps {
  actions: AiAction[];
  aiBusy: boolean;
  canUndoSnapshots: boolean;
  canRedoSnapshots: boolean;
  scope: ChatScope;
  chapterLengthInfo: string;
  bookLengthInfo: string;
  messages: ChatMessage[];
  autoApplyChatChanges: boolean;
  chatApplyIterations: number;
  continuousAgentEnabled: boolean;
  continuousAgentMaxRounds: number;
  promptTemplates: PromptTemplate[];
  onScopeChange: (scope: ChatScope) => void;
  onRunAction: (actionId: AiActionId) => void;
  onSendChat: (message: string, scope: ChatScope) => void;
  onTrackCharacter: (characterName: string, scope: ChatScope, range: ChapterRangeFilter) => void;
  onSummarizeStory: (scope: ChatScope, range: ChapterRangeFilter) => void;
  chapterCount: number;
  onUndoSnapshot: () => void;
  onRedoSnapshot: () => void;
  onSaveMilestone: () => void;
  onCreatePromptTemplate: (title: string, content: string) => void;
  onDeletePromptTemplate: (templateId: string) => void;
}

function AIPanel(props: AIPanelProps) {
  const [chatInput, setChatInput] = useState('');
  const [characterTrackInput, setCharacterTrackInput] = useState('');
  const [rangeFromInput, setRangeFromInput] = useState('');
  const [rangeToInput, setRangeToInput] = useState('');
  const [newPromptTitle, setNewPromptTitle] = useState('');
  const [newPromptContent, setNewPromptContent] = useState('');

  const handleSend = () => {
    const message = chatInput.trim();
    if (!message) {
      return;
    }

    props.onSendChat(message, props.scope);
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

  const handleTrackCharacter = () => {
    const name = characterTrackInput.trim();
    if (!name) {
      return;
    }
    props.onTrackCharacter(name, props.scope, buildRangeFilter());
    setCharacterTrackInput('');
  };

  const handleSummarizeStory = () => {
    props.onSummarizeStory(props.scope, buildRangeFilter());
  };

  const insertTemplate = (template: PromptTemplate) => {
    const trimmedInput = chatInput.trim();
    if (!trimmedInput) {
      setChatInput(template.content);
      return;
    }
    setChatInput(`${trimmedInput}\n\n${template.content}`);
  };

  return (
    <aside className="ai-panel">
      <header>
        <h2>
          Panel IA <ContextTip text="Asistencia local con Ollama: acciones, chat y prompts reutilizables." />
        </h2>
        <p>Ollama local</p>
      </header>

      <section className="quick-actions">
        <details className="panel-collapsible">
          <summary>Acciones rapidas IA</summary>
          <div className="collapsible-body">
            <div className="section-title-row">
              <h3>Acciones</h3>
              <button
                type="button"
                onClick={props.onUndoSnapshot}
                disabled={!props.canUndoSnapshots || props.aiBusy}
                title="Restaura el estado previo guardado en snapshots."
              >
                Deshacer IA
              </button>
              <button
                type="button"
                onClick={props.onRedoSnapshot}
                disabled={!props.canRedoSnapshots || props.aiBusy}
                title="Reaplica el ultimo estado deshecho por snapshot."
              >
                Rehacer IA
              </button>
              <button
                type="button"
                onClick={props.onSaveMilestone}
                disabled={props.aiBusy || !props.canUndoSnapshots}
                title="Guarda un snapshot etiquetado como hito para volver rapido luego."
              >
                Guardar hito
              </button>
            </div>
            <div className="action-grid">
              {props.actions.map((action) => (
                <button
                  type="button"
                  key={action.id}
                  onClick={() => props.onRunAction(action.id)}
                  disabled={props.aiBusy}
                  title={action.description}
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        </details>
      </section>

      <section className="chat-section chat-section-main">
        <details className="panel-collapsible" open>
          <summary>Chat y aplicacion</summary>
          <div className="collapsible-body">
            <div className="section-title-row">
              <h3>Chat</h3>
              <select
                value={props.scope}
                onChange={(event) => props.onScopeChange(event.target.value as ChatScope)}
                title="Elige si el chat trabaja sobre el capitulo actual o sobre todo el libro."
              >
                <option value="chapter">Por capitulo</option>
                <option value="book">Por libro</option>
              </select>
            </div>
            <div className="length-info-box">
              <strong>Longitud objetivo</strong>
              <p>{props.scope === 'chapter' ? props.chapterLengthInfo : props.bookLengthInfo}</p>
            </div>
            <div className="character-track-row">
              <input
                value={characterTrackInput}
                onChange={(event) => setCharacterTrackInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    handleTrackCharacter();
                  }
                }}
                placeholder="Nombre del personaje (ej: Lena)"
                disabled={props.aiBusy}
                title="Genera seguimiento del personaje en todo el libro y lo publica en el chat."
              />
              <button
                type="button"
                onClick={handleTrackCharacter}
                disabled={props.aiBusy}
                title="Rastrea lo que hizo el personaje y lo resume en el chat."
              >
                Seguimiento personaje
              </button>
            </div>
            <div className="chat-range-row">
              <label>
                Desde cap
                <input
                  type="number"
                  min={1}
                  max={props.chapterCount}
                  value={rangeFromInput}
                  onChange={(event) => setRangeFromInput(event.target.value)}
                  placeholder="1"
                  disabled={props.aiBusy}
                />
              </label>
              <label>
                Hasta cap
                <input
                  type="number"
                  min={1}
                  max={props.chapterCount}
                  value={rangeToInput}
                  onChange={(event) => setRangeToInput(event.target.value)}
                  placeholder={String(props.chapterCount)}
                  disabled={props.aiBusy}
                />
              </label>
              <button
                type="button"
                onClick={handleSummarizeStory}
                disabled={props.aiBusy}
                title="Genera un resumen cronologico de hechos relevantes en el rango seleccionado."
              >
                Resumen historia
              </button>
            </div>
            <p className="muted">
              {props.autoApplyChatChanges
                ? `Auto-aplicar activo (${props.chatApplyIterations} iteracion/es).`
                : 'Modo consulta (sin auto-aplicar).'}
            </p>
            {props.scope === 'chapter' && props.autoApplyChatChanges ? (
              <p className="muted">
                {props.continuousAgentEnabled
                  ? `Agente continuo activo (${props.continuousAgentMaxRounds} rondas max).`
                  : 'Agente continuo desactivado.'}
              </p>
            ) : null}

            <div className="chat-history">
              {props.messages.length === 0 ? (
                <p className="muted">Sin mensajes.</p>
              ) : (
                props.messages.map((message) => (
                  <article key={message.id} className={`chat-message ${message.role}`}>
                    <strong>{message.role === 'user' ? 'Vos' : 'IA'}</strong>
                    <p>{message.content}</p>
                  </article>
                ))
              )}
            </div>

            <div className="chat-input-row">
              <textarea
                rows={3}
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                placeholder="Escribe una consulta para la IA..."
                title="Escribe una instruccion: la IA puede responder o aplicar cambios segun configuracion."
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={props.aiBusy}
                title={props.autoApplyChatChanges ? 'Envia la instruccion y aplica cambios automaticamente.' : 'Envia la consulta al chat.'}
              >
                {props.autoApplyChatChanges ? 'Enviar y aplicar' : 'Enviar'}
              </button>
            </div>
          </div>
        </details>
      </section>

      <section className="chat-section chat-section-prompt-library">
        <details className="panel-collapsible">
          <summary>Biblioteca de prompts</summary>
          <div className="collapsible-body">
            <p className="muted">Plantillas reutilizables por libro para acelerar sesiones creativas.</p>
            <div className="prompt-library-form">
              <input
                value={newPromptTitle}
                onChange={(event) => setNewPromptTitle(event.target.value)}
                placeholder="Nombre del prompt"
                disabled={props.aiBusy}
              />
              <textarea
                rows={3}
                value={newPromptContent}
                onChange={(event) => setNewPromptContent(event.target.value)}
                placeholder="Texto base del prompt..."
                disabled={props.aiBusy}
              />
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
                      <button
                        type="button"
                        onClick={() => props.onDeletePromptTemplate(template.id)}
                        disabled={props.aiBusy}
                      >
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
