import { useState } from 'react';
import type { ChapterDocument, LooseThread, LooseThreadStatus } from '../types/book';

interface LooseThreadsViewProps {
  threads: LooseThread[];
  chapters: ChapterDocument[];
  onAddThread: (thread: Omit<LooseThread, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onUpdateThread: (id: string, patch: Partial<Pick<LooseThread, 'title' | 'description' | 'status' | 'chapterRef'>>) => void;
  onDeleteThread: (id: string) => void;
}

const STATUS_LABELS: Record<LooseThreadStatus, string> = {
  open: 'Abierto',
  resolved: 'Resuelto',
  dropped: 'Descartado',
};

function LooseThreadsView(props: LooseThreadsViewProps) {
  const [statusFilter, setStatusFilter] = useState<LooseThreadStatus | ''>('open');
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ title: '', description: '', status: 'open' as LooseThreadStatus, chapterRef: '' });

  const filtered = props.threads.filter((t) => !statusFilter || t.status === statusFilter);

  const counts: Record<LooseThreadStatus, number> = { open: 0, resolved: 0, dropped: 0 };
  for (const t of props.threads) counts[t.status]++;

  const resetForm = () => setForm({ title: '', description: '', status: 'open', chapterRef: '' });

  const startCreate = () => {
    resetForm();
    setEditingId(null);
    setIsCreating(true);
  };

  const startEdit = (thread: LooseThread) => {
    setForm({ title: thread.title, description: thread.description, status: thread.status, chapterRef: thread.chapterRef ?? '' });
    setIsCreating(false);
    setEditingId(thread.id);
  };

  const cancelEdit = () => {
    setIsCreating(false);
    setEditingId(null);
    resetForm();
  };

  const handleSubmit = () => {
    if (!form.title.trim()) return;
    if (isCreating) {
      props.onAddThread({ title: form.title.trim(), description: form.description.trim(), status: form.status, chapterRef: form.chapterRef || undefined });
      setIsCreating(false);
      resetForm();
    } else if (editingId) {
      props.onUpdateThread(editingId, { title: form.title.trim(), description: form.description.trim(), status: form.status, chapterRef: form.chapterRef || undefined });
      setEditingId(null);
      resetForm();
    }
  };

  const renderForm = () => (
    <div className="loose-thread-form">
      <label>
        Titulo del hilo
        <input
          autoFocus
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          placeholder="Ej: La cicatriz de Elara — nunca explicada"
        />
      </label>
      <label>
        Descripcion / contexto
        <textarea
          rows={3}
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          placeholder="¿Qué planteo sin resolver? ¿Dónde aparece? ¿Qué efecto debería tener?"
        />
      </label>
      <label>
        Estado
        <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as LooseThreadStatus }))}>
          <option value="open">Abierto</option>
          <option value="resolved">Resuelto</option>
          <option value="dropped">Descartado</option>
        </select>
      </label>
      <label>
        Capitulo relacionado
        <select value={form.chapterRef} onChange={(e) => setForm((f) => ({ ...f, chapterRef: e.target.value }))}>
          <option value="">— Sin capitulo —</option>
          {props.chapters.map((c) => (
            <option key={c.id} value={c.id}>{c.title}</option>
          ))}
        </select>
      </label>
      <div className="loose-thread-form-actions">
        <button type="button" onClick={handleSubmit} disabled={!form.title.trim()}>
          {isCreating ? 'Agregar hilo' : 'Guardar cambios'}
        </button>
        {editingId && (
          <button
            type="button"
            className="loose-thread-delete-btn"
            onClick={() => { props.onDeleteThread(editingId); cancelEdit(); }}
          >
            Eliminar hilo
          </button>
        )}
        <button type="button" onClick={cancelEdit}>Cancelar</button>
      </div>
    </div>
  );

  return (
    <section className="loose-threads-view">
      <header>
        <h2>Hilos abiertos</h2>
        <p>Promesas narrativas, misterios plantados, preguntas sin respuesta — rastreados hasta que los resuelvas.</p>
        <div className="loose-threads-summary">
          <span className="loose-thread-chip is-open">Abiertos: {counts.open}</span>
          <span className="loose-thread-chip is-resolved">Resueltos: {counts.resolved}</span>
          <span className="loose-thread-chip is-dropped">Descartados: {counts.dropped}</span>
        </div>
      </header>

      <div className="loose-threads-toolbar">
        <label>
          Filtrar por estado
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as LooseThreadStatus | '')}>
            <option value="">Todos ({props.threads.length})</option>
            <option value="open">Abiertos ({counts.open})</option>
            <option value="resolved">Resueltos ({counts.resolved})</option>
            <option value="dropped">Descartados ({counts.dropped})</option>
          </select>
        </label>
        {!isCreating && !editingId && (
          <button type="button" onClick={startCreate}>+ Nuevo hilo</button>
        )}
      </div>

      {isCreating && renderForm()}

      <div className="loose-threads-list">
        {filtered.length === 0 && <p className="muted">Sin hilos en esta categoria. {statusFilter === 'open' ? '¡Bien! O todavía no los registraste.' : ''}</p>}
        {filtered.map((thread) => {
          const chapterTitle = thread.chapterRef ? (props.chapters.find((c) => c.id === thread.chapterRef)?.title ?? thread.chapterRef) : null;
          return (
            <article key={thread.id} className={`loose-thread-item is-${thread.status}`}>
              {editingId === thread.id ? (
                renderForm()
              ) : (
                <>
                  <div className="loose-thread-head">
                    <h3>{thread.title}</h3>
                    <span className={`loose-thread-badge is-${thread.status}`}>{STATUS_LABELS[thread.status]}</span>
                  </div>
                  {thread.description && <p className="loose-thread-description">{thread.description}</p>}
                  {chapterTitle && <p className="muted loose-thread-chapter">Cap: {chapterTitle}</p>}
                  <div className="loose-thread-actions">
                    {thread.status !== 'resolved' && (
                      <button type="button" onClick={() => props.onUpdateThread(thread.id, { status: 'resolved' })} title="Marcar como resuelto">
                        Resuelto
                      </button>
                    )}
                    {thread.status !== 'open' && (
                      <button type="button" onClick={() => props.onUpdateThread(thread.id, { status: 'open' })} title="Reabrir hilo">
                        Reabrir
                      </button>
                    )}
                    <button type="button" onClick={() => startEdit(thread)}>Editar</button>
                  </div>
                </>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

export default LooseThreadsView;
