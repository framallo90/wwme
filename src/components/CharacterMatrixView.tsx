import { useMemo } from 'react';
import type { ChapterDocument, StoryCharacter } from '../types/book';
import { stripHtml } from '../lib/text';

interface CharacterMatrixViewProps {
  chapters: ChapterDocument[];
  characters: StoryCharacter[];
}

function normalizeForSearch(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

const WORD_BOUNDARY_CHARS = /[\s.,;:!?()[\]{}"'/\\\n\r\t-]/;

function isWordBoundary(text: string, index: number): boolean {
  if (index <= 0 || index >= text.length) return true;
  return WORD_BOUNDARY_CHARS.test(text[index - 1]) || WORD_BOUNDARY_CHARS.test(text[index]);
}

function countMentions(chapterContent: string, character: StoryCharacter): number {
  const text = normalizeForSearch(stripHtml(chapterContent));
  const names = [...new Set(
    [character.name, ...(character.aliases ? character.aliases.split(',') : [])]
      .map((n) => n.trim())
      .filter(Boolean),
  )];
  let count = 0;
  for (const name of names) {
    const normalized = normalizeForSearch(name);
    if (!normalized) continue;
    let pos = 0;
    while ((pos = text.indexOf(normalized, pos)) !== -1) {
      const end = pos + normalized.length;
      if (isWordBoundary(text, pos) && isWordBoundary(text, end)) {
        count++;
      }
      pos += normalized.length;
    }
  }
  return count;
}

function MentionCell({ count, isPov }: { count: number; isPov: boolean }) {
  if (isPov) {
    return (
      <td className={`char-matrix-cell is-pov ${count > 0 ? 'has-mentions' : 'no-mentions'}`} title={`POV de este capitulo - ${count} menciones`}>
        <span className="char-matrix-pov-marker">POV</span>
        {count > 0 && <span className="char-matrix-count">{count}</span>}
      </td>
    );
  }
  if (count === 0) {
    return <td className="char-matrix-cell no-mentions" title="Sin menciones" />;
  }
  const intensity = count >= 10 ? 'high' : count >= 4 ? 'mid' : 'low';
  return (
    <td className={`char-matrix-cell has-mentions intensity-${intensity}`} title={`${count} menciones`}>
      <span className="char-matrix-count">{count}</span>
    </td>
  );
}

function CharacterMatrixView(props: CharacterMatrixViewProps) {
  const matrix = useMemo(() => {
    return props.chapters.map((chapter) => {
      const row = props.characters.map((char) => {
        const isPov = !!chapter.pointOfView && chapter.pointOfView.trim().toLowerCase() === char.name.trim().toLowerCase();
        const count = countMentions(chapter.content, char);
        return { charId: char.id, count, isPov };
      });
      return { chapter, row };
    });
  }, [props.chapters, props.characters]);

  const charTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const { row } of matrix) {
      for (const { charId, count } of row) {
        totals[charId] = (totals[charId] ?? 0) + count;
      }
    }
    return totals;
  }, [matrix]);

  if (props.characters.length === 0) {
    return (
      <section className="char-matrix-view">
        <header>
          <h2>Matriz Personaje x Capitulo</h2>
          <p className="muted">Agrega personajes en la Biblia de Historia para ver la matriz.</p>
        </header>
      </section>
    );
  }

  return (
    <section className="char-matrix-view">
      <header>
        <h2>Matriz Personaje x Capitulo</h2>
        <p>Presencia de cada personaje por capitulo - basado en menciones de nombre y aliases.</p>
        <p className="muted">POV = capitulo narrado desde ese personaje. El numero indica cantidad de menciones.</p>
      </header>

      <div className="char-matrix-table-wrapper">
        <table className="char-matrix-table">
          <thead>
            <tr>
              <th className="char-matrix-chapter-col">Capitulo</th>
              {props.characters.map((char) => (
                <th key={char.id} className="char-matrix-char-col" title={char.aliases ? `Aliases: ${char.aliases}` : char.name}>
                  <span className="char-matrix-char-name">{char.name}</span>
                  <span className="char-matrix-char-total muted">{charTotals[char.id] ?? 0}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.map(({ chapter }, rowIdx) => (
              <tr key={chapter.id} className={rowIdx % 2 === 0 ? 'even' : 'odd'}>
                <td className="char-matrix-chapter-title" title={chapter.title}>
                  <span className="char-matrix-chapter-num">{rowIdx + 1}.</span> {chapter.title}
                </td>
                {matrix[rowIdx].row.map(({ charId, count, isPov }) => (
                  <MentionCell key={charId} count={count} isPov={isPov} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default CharacterMatrixView;
