import { useMemo, useState } from 'react';

import type { ChapterDocument, ChapterStatus, StoryCharacter } from '../types/book';
import { getChapterWordCount } from '../lib/export';
import { stripHtml } from '../lib/text';

interface OutlineViewProps {
  chapters: ChapterDocument[];
  storyBibleCharacters: StoryCharacter[];
  onSelectChapter: (chapterId: string) => void;
  onMoveChapter: (chapterId: string, direction: 'up' | 'down') => void;
  onMoveToPosition: (chapterId: string, position: number) => void;
  onUpdateChapterPov: (chapterId: string, pointOfView: string) => void;
  onUpdateChapterMeta: (chapterId: string, patch: { synopsis?: string; status?: ChapterStatus; wordTarget?: number | null }) => void;
}

const STATUS_LABELS: Record<ChapterStatus, string> = {
  borrador: 'Borrador',
  en_revision: 'En revision',
  final: 'Final',
};

const STATUS_ALL = '' as const;

function normalizePov(value: string | undefined): string {
  return (value ?? '').trim();
}

function normalizePovKey(value: string | undefined): string {
  return normalizePov(value).toLowerCase();
}

function WordTargetBar({ current, target }: { current: number; target: number }) {
  const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
  const over = current > target && target > 0;
  return (
    <div className="outline-word-bar" title={`${current} / ${target} palabras (${pct}%)`}>
      <div
        className={`outline-word-bar-fill ${over ? 'is-over' : ''}`}
        style={{ width: `${Math.min(pct, 100)}%` }}
      />
      <span className="outline-word-bar-label">
        {current} / {target} palabras ({pct}%){over ? ' — excedido' : ''}
      </span>
    </div>
  );
}

function OutlineView(props: OutlineViewProps) {
  const [povFilter, setPovFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<ChapterStatus | typeof STATUS_ALL>(STATUS_ALL);
  const [positionOverrides, setPositionOverrides] = useState<Record<string, string>>({});
  const [povOverrides, setPovOverrides] = useState<Record<string, string>>({});
  const [synopsisOverrides, setSynopsisOverrides] = useState<Record<string, string>>({});
  const [wordTargetOverrides, setWordTargetOverrides] = useState<Record<string, string>>({});

  // Opciones de POV: personajes de la StoryBible + valores libres ya usados en capítulos
  const povOptions = useMemo(() => {
    const seen = new Map<string, string>();
    // Primero los personajes de la biblia (fuente de verdad)
    for (const char of props.storyBibleCharacters) {
      const name = normalizePov(char.name);
      if (!name) continue;
      const key = normalizePovKey(name);
      if (!seen.has(key)) seen.set(key, name);
    }
    // Luego los valores libres ya usados en capítulos (para no perder datos existentes)
    for (const chapter of props.chapters) {
      const raw = normalizePov(chapter.pointOfView);
      if (!raw) continue;
      const key = normalizePovKey(raw);
      if (!seen.has(key)) seen.set(key, raw);
    }
    return Array.from(seen.values()).sort((left, right) => left.localeCompare(right));
  }, [props.chapters, props.storyBibleCharacters]);

  const filteredChapters = useMemo(() => {
    return props.chapters.filter((chapter) => {
      if (statusFilter && (chapter.status ?? 'borrador') !== statusFilter) return false;
      const normalizedFilter = normalizePovKey(povFilter);
      if (normalizedFilter && normalizePovKey(chapter.pointOfView) !== normalizedFilter) return false;
      return true;
    });
  }, [povFilter, statusFilter, props.chapters]);

  // Contadores por estado para la toolbar
  const statusCounts = useMemo(() => {
    const counts: Record<ChapterStatus, number> = { borrador: 0, en_revision: 0, final: 0 };
    for (const c of props.chapters) counts[c.status ?? 'borrador']++;
    return counts;
  }, [props.chapters]);

  return (
    <section className="outline-view">
      <header>
        <h2>Vista general del libro</h2>
        <p>{filteredChapters.length} capitulos visibles / {props.chapters.length} totales</p>
        <div className="outline-status-summary">
          <span className="outline-status-chip is-borrador">Borrador: {statusCounts.borrador}</span>
          <span className="outline-status-chip is-en_revision">En revision: {statusCounts.en_revision}</span>
          <span className="outline-status-chip is-final">Final: {statusCounts.final}</span>
        </div>
      </header>

      <div className="outline-toolbar">
        <label>
          Filtrar por POV
          <select value={povFilter} onChange={(event) => setPovFilter(event.target.value)}>
            <option value="">Todos</option>
            {povOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>
        <label>
          Filtrar por estado
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as ChapterStatus | typeof STATUS_ALL)}>
            <option value="">Todos</option>
            <option value="borrador">Borrador</option>
            <option value="en_revision">En revision</option>
            <option value="final">Final</option>
          </select>
        </label>
      </div>

      <div className="outline-list">
        {filteredChapters.map((chapter) => {
          const absoluteIndex = props.chapters.findIndex((entry) => entry.id === chapter.id);
          const indexLabel = absoluteIndex >= 0 ? absoluteIndex + 1 : 0;
          const wordCount = getChapterWordCount(chapter);
          const target = chapter.wordTarget ?? null;
          const chapterStatus: ChapterStatus = chapter.status ?? 'borrador';
          return (
            <article key={chapter.id} className={`outline-item status-${chapterStatus}`}>
              <div className="outline-head">
                <h3>{indexLabel}. {chapter.title}</h3>
                <div className="outline-head-meta">
                  <span className={`outline-status-badge is-${chapterStatus}`}>{STATUS_LABELS[chapterStatus]}</span>
                  <span>{wordCount} palabras</span>
                </div>
              </div>

              {target !== null && <WordTargetBar current={wordCount} target={target} />}

              {/* Sinopsis */}
              <label className="outline-synopsis-label">
                Sinopsis / plan
                <textarea
                  rows={2}
                  className="outline-synopsis"
                  placeholder="¿Qué pasa en este capítulo? (plan separado del contenido)"
                  value={synopsisOverrides[chapter.id] ?? (chapter.synopsis ?? '')}
                  onChange={(event) => setSynopsisOverrides((prev) => ({ ...prev, [chapter.id]: event.currentTarget.value }))}
                  onBlur={(event) => {
                    props.onUpdateChapterMeta(chapter.id, { synopsis: event.currentTarget.value });
                    setSynopsisOverrides((prev) => { const next = { ...prev }; delete next[chapter.id]; return next; });
                  }}
                />
              </label>

              {/* Preview de contenido real */}
              <p className="outline-content-preview muted">{stripHtml(chapter.content).slice(0, 200) || 'Sin contenido aun'}</p>

              <div className="outline-order-controls">
                <button type="button" onClick={() => props.onMoveChapter(chapter.id, 'up')} disabled={absoluteIndex <= 0} title="Subir capitulo">Subir</button>
                <label>
                  Posicion
                  <input
                    type="number" min={1} max={props.chapters.length}
                    value={positionOverrides[chapter.id] ?? String(indexLabel)}
                    onChange={(event) => setPositionOverrides((prev) => ({ ...prev, [chapter.id]: event.currentTarget.value }))}
                    onBlur={(event) => {
                      const nextPosition = Number.parseInt(event.currentTarget.value || '', 10);
                      if (Number.isFinite(nextPosition)) props.onMoveToPosition(chapter.id, nextPosition);
                      setPositionOverrides((prev) => { const next = { ...prev }; delete next[chapter.id]; return next; });
                    }}
                  />
                </label>
                <button type="button" onClick={() => props.onMoveChapter(chapter.id, 'down')} disabled={absoluteIndex >= props.chapters.length - 1} title="Bajar capitulo">Bajar</button>
              </div>

              <div className="outline-meta-controls">
                <label>
                  POV
                  <select
                    value={povOverrides[chapter.id] ?? normalizePov(chapter.pointOfView)}
                    onChange={(event) => {
                      const val = event.target.value;
                      setPovOverrides((prev) => ({ ...prev, [chapter.id]: val }));
                      props.onUpdateChapterPov(chapter.id, val);
                    }}
                  >
                    <option value="">— Sin POV —</option>
                    {povOptions.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                    {/* Si el valor actual no está en la lista, mostrarlo igual */}
                    {(() => {
                      const current = normalizePov(chapter.pointOfView);
                      if (current && !povOptions.some((o) => normalizePovKey(o) === normalizePovKey(current))) {
                        return <option value={current}>{current}</option>;
                      }
                      return null;
                    })()}
                  </select>
                </label>
                <label>
                  Estado
                  <select
                    value={chapterStatus}
                    onChange={(event) => props.onUpdateChapterMeta(chapter.id, { status: event.target.value as ChapterStatus })}
                  >
                    <option value="borrador">Borrador</option>
                    <option value="en_revision">En revision</option>
                    <option value="final">Final</option>
                  </select>
                </label>
                <label>
                  Objetivo (palabras)
                  <input
                    type="number" min={0} placeholder="Ej: 3000"
                    value={wordTargetOverrides[chapter.id] ?? (chapter.wordTarget != null ? String(chapter.wordTarget) : '')}
                    onChange={(event) => setWordTargetOverrides((prev) => ({ ...prev, [chapter.id]: event.currentTarget.value }))}
                    onBlur={(event) => {
                      const val = event.currentTarget.value.trim();
                      const parsed = val === '' ? null : Number.parseInt(val, 10);
                      props.onUpdateChapterMeta(chapter.id, { wordTarget: Number.isFinite(parsed ?? NaN) ? parsed : null });
                      setWordTargetOverrides((prev) => { const next = { ...prev }; delete next[chapter.id]; return next; });
                    }}
                  />
                </label>
              </div>

              <button type="button" onClick={() => props.onSelectChapter(chapter.id)}>Ir al editor</button>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export default OutlineView;
