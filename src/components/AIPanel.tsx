import { useState } from 'react';

import type { AiAction, AiActionId, ChatMessage, ChatScope } from '../types/book';

interface AIPanelProps {
  actions: AiAction[];
  aiBusy: boolean;
  canUndoSnapshots: boolean;
  canRedoSnapshots: boolean;
  scope: ChatScope;
  messages: ChatMessage[];
  autoApplyChatChanges: boolean;
  chatApplyIterations: number;
  continuousAgentEnabled: boolean;
  continuousAgentMaxRounds: number;
  onScopeChange: (scope: ChatScope) => void;
  onRunAction: (actionId: AiActionId) => void;
  onSendChat: (message: string, scope: ChatScope) => void;
  onUndoSnapshot: () => void;
  onRedoSnapshot: () => void;
}

function AIPanel(props: AIPanelProps) {
  const [chatInput, setChatInput] = useState('');

  const handleSend = () => {
    const message = chatInput.trim();
    if (!message) {
      return;
    }

    props.onSendChat(message, props.scope);
    setChatInput('');
  };

  return (
    <aside className="ai-panel">
      <header>
        <h2>Panel IA</h2>
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

      <section className="chat-section">
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
                disabled={props.aiBusy}
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

    </aside>
  );
}

export default AIPanel;
