import { useState } from 'react';

import type { AiAction, AiActionId, ChatMessage, ChatScope } from '../types/book';

interface AIPanelProps {
  actions: AiAction[];
  aiBusy: boolean;
  feedback: string;
  canUndo: boolean;
  scope: ChatScope;
  messages: ChatMessage[];
  onScopeChange: (scope: ChatScope) => void;
  onRunAction: (actionId: AiActionId) => void;
  onSendChat: (message: string, scope: ChatScope) => void;
  onUndo: () => void;
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
        <div className="section-title-row">
          <h3>Acciones</h3>
          <button onClick={props.onUndo} disabled={!props.canUndo || props.aiBusy}>
            Undo snapshot
          </button>
        </div>
        <div className="action-grid">
          {props.actions.map((action) => (
            <button
              key={action.id}
              onClick={() => props.onRunAction(action.id)}
              disabled={props.aiBusy}
              title={action.description}
            >
              {action.label}
            </button>
          ))}
        </div>
      </section>

      <section className="chat-section">
        <div className="section-title-row">
          <h3>Chat</h3>
          <select value={props.scope} onChange={(event) => props.onScopeChange(event.target.value as ChatScope)}>
            <option value="chapter">Por capitulo</option>
            <option value="book">Por libro</option>
          </select>
        </div>

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
          />
          <button onClick={handleSend} disabled={props.aiBusy}>
            Enviar
          </button>
        </div>
      </section>

      <section className="feedback-section">
        <h3>Devolucion</h3>
        <div className="feedback-box">{props.feedback || 'Todavia no hay devolucion.'}</div>
      </section>
    </aside>
  );
}

export default AIPanel;
