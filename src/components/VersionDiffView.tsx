import { useEffect, useMemo, useState } from 'react';
import { diffTextBlocks, summarizeDiffOperations } from '../lib/diff';
import { listChapterSnapshots } from '../lib/storage';
import { stripHtml } from '../lib/text';
import type { ChapterDocument, ChapterSnapshot } from '../types/book';

interface VersionDiffViewProps {
  bookPath: string | null;
  chapters: ChapterDocument[];
  activeChapterId: string | null;
}

interface VersionChoice {
  key: string;
  label: string;
  details: string;
}

const CURRENT_VERSION_KEY = 'current';

function snapshotKey(version: number): string {
  return `snapshot:${version}`;
}

function formatUnknownError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (typeof error === 'string' && error.trim()) {
    return error;
  }

  return 'Error desconocido';
}

function VersionDiffView(props: VersionDiffViewProps) {
  const [chapterSelection, setChapterSelection] = useState<string>('');
  const [leftSelection, setLeftSelection] = useState<string>(CURRENT_VERSION_KEY);
  const [rightSelection, setRightSelection] = useState<string>(CURRENT_VERSION_KEY);
  const [snapshots, setSnapshots] = useState<ChapterSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const selectedChapterId = useMemo(() => {
    if (props.chapters.length === 0) {
      return null;
    }

    if (chapterSelection && props.chapters.some((chapter) => chapter.id === chapterSelection)) {
      return chapterSelection;
    }

    if (props.activeChapterId && props.chapters.some((chapter) => chapter.id === props.activeChapterId)) {
      return props.activeChapterId;
    }

    return props.chapters[0].id;
  }, [props.chapters, props.activeChapterId, chapterSelection]);

  useEffect(() => {
    if (!props.bookPath || !selectedChapterId) {
      return;
    }

    let isCancelled = false;

    queueMicrotask(() => {
      if (isCancelled) {
        return;
      }
      setLoading(true);
      setLoadError(null);
    });

    void listChapterSnapshots(props.bookPath, selectedChapterId)
      .then((loaded) => {
        if (isCancelled) {
          return;
        }
        setSnapshots(loaded);
      })
      .catch((error) => {
        if (isCancelled) {
          return;
        }
        setSnapshots([]);
        setLoadError(formatUnknownError(error));
      })
      .finally(() => {
        if (isCancelled) {
          return;
        }
        setLoading(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [props.bookPath, selectedChapterId]);

  const activeChapter = useMemo(() => {
    if (!selectedChapterId) {
      return null;
    }

    return props.chapters.find((chapter) => chapter.id === selectedChapterId) ?? null;
  }, [props.chapters, selectedChapterId]);

  const canLoadSnapshots = Boolean(props.bookPath && selectedChapterId);
  const visibleSnapshots = useMemo(
    () => (canLoadSnapshots ? snapshots : []),
    [canLoadSnapshots, snapshots],
  );
  const visibleLoading = canLoadSnapshots ? loading : false;
  const visibleLoadError = canLoadSnapshots ? loadError : null;
  const snapshotListDesc = useMemo(
    () => [...visibleSnapshots].sort((a, b) => b.version - a.version),
    [visibleSnapshots],
  );

  const versionChoices = useMemo<VersionChoice[]>(() => {
    const choices: VersionChoice[] = [
      {
        key: CURRENT_VERSION_KEY,
        label: 'Actual (editor)',
        details: 'Estado actual del capitulo abierto.',
      },
    ];

    for (const snapshot of snapshotListDesc) {
      const createdAt = snapshot.createdAt ? new Date(snapshot.createdAt).toLocaleString() : '';
      choices.push({
        key: snapshotKey(snapshot.version),
        label: `Snapshot v${snapshot.version}`,
        details: `${createdAt}${snapshot.reason ? ` | ${snapshot.reason}` : ''}`,
      });
    }

    return choices;
  }, [snapshotListDesc]);

  const availableVersionKeys = useMemo(
    () => new Set(versionChoices.map((choice) => choice.key)),
    [versionChoices],
  );
  const fallbackLeftKey = snapshotListDesc.length > 0
    ? snapshotKey(snapshotListDesc[0].version)
    : CURRENT_VERSION_KEY;
  const leftVersionKey = availableVersionKeys.has(leftSelection) ? leftSelection : fallbackLeftKey;
  const rightVersionKey = availableVersionKeys.has(rightSelection) ? rightSelection : CURRENT_VERSION_KEY;

  const snapshotByVersion = useMemo(() => {
    const map = new Map<number, ChapterSnapshot>();
    for (const snapshot of visibleSnapshots) {
      map.set(snapshot.version, snapshot);
    }
    return map;
  }, [visibleSnapshots]);

  const leftText = useMemo(() => {
    if (!activeChapter) {
      return '';
    }

    if (leftVersionKey === CURRENT_VERSION_KEY) {
      return stripHtml(activeChapter.content);
    }

    const match = leftVersionKey.match(/^snapshot:(\d+)$/);
    if (!match) {
      return '';
    }

    const version = Number.parseInt(match[1], 10);
    const snapshot = snapshotByVersion.get(version);
    return snapshot ? stripHtml(snapshot.chapter.content) : '';
  }, [activeChapter, leftVersionKey, snapshotByVersion]);

  const rightText = useMemo(() => {
    if (!activeChapter) {
      return '';
    }

    if (rightVersionKey === CURRENT_VERSION_KEY) {
      return stripHtml(activeChapter.content);
    }

    const match = rightVersionKey.match(/^snapshot:(\d+)$/);
    if (!match) {
      return '';
    }

    const version = Number.parseInt(match[1], 10);
    const snapshot = snapshotByVersion.get(version);
    return snapshot ? stripHtml(snapshot.chapter.content) : '';
  }, [activeChapter, rightVersionKey, snapshotByVersion]);

  const operations = useMemo(() => diffTextBlocks(leftText, rightText), [leftText, rightText]);
  const summary = useMemo(() => summarizeDiffOperations(operations), [operations]);
  const hasChanges = summary.insertCount > 0 || summary.deleteCount > 0;

  return (
    <section className="diff-view">
      <header>
        <h2>Control de cambios</h2>
        <p>
          Compara snapshots historicos con el estado actual del capitulo. Verde = agregado, rojo = eliminado.
        </p>
      </header>

      <div className="diff-controls-grid">
        <label>
          Capitulo
          <select
            value={selectedChapterId ?? ''}
            onChange={(event) => {
              setChapterSelection(event.target.value);
            }}
          >
            {props.chapters.map((chapter) => (
              <option key={chapter.id} value={chapter.id}>
                {chapter.id} - {chapter.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          Version base
          <select value={leftVersionKey} onChange={(event) => setLeftSelection(event.target.value)}>
            {versionChoices.map((choice) => (
              <option key={choice.key} value={choice.key}>
                {choice.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Version comparada
          <select value={rightVersionKey} onChange={(event) => setRightSelection(event.target.value)}>
            {versionChoices.map((choice) => (
              <option key={choice.key} value={choice.key}>
                {choice.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => {
            setLeftSelection(rightVersionKey);
            setRightSelection(leftVersionKey);
          }}
        >
          Invertir
        </button>
      </div>

      <div className="diff-meta-grid">
        <p className="muted">
          Base: <strong>{versionChoices.find((choice) => choice.key === leftVersionKey)?.details ?? '-'}</strong>
        </p>
        <p className="muted">
          Comparada: <strong>{versionChoices.find((choice) => choice.key === rightVersionKey)?.details ?? '-'}</strong>
        </p>
      </div>

      {visibleLoadError ? <p className="warning-text">No se pudieron cargar snapshots: {visibleLoadError}</p> : null}
      {visibleLoading ? <p className="muted">Cargando snapshots...</p> : null}

      {!activeChapter ? (
        <p className="muted">Abre un libro y selecciona un capitulo para comparar versiones.</p>
      ) : (
        <>
          <p className="muted">
            Bloques sin cambios: {summary.equalCount} | agregados: {summary.insertCount} | eliminados: {summary.deleteCount}
          </p>
          {!hasChanges ? (
            <p className="muted">No hay diferencias entre las versiones seleccionadas.</p>
          ) : null}
          <div className="diff-output-list">
            {operations.map((operation, index) => (
              <article key={`${operation.type}-${index}`} className={`diff-block diff-${operation.type}`}>
                <header>
                  {operation.type === 'insert' ? '+' : operation.type === 'delete' ? '-' : '='}
                </header>
                <p>{operation.value || ' '}</p>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

export default VersionDiffView;
