import type { ChapterDocument, InteriorFormat } from '../types/book';

interface PreviewViewProps {
  title: string;
  author: string;
  chapters: ChapterDocument[];
  interiorFormat: InteriorFormat;
  coverSrc: string | null;
  backCoverSrc: string | null;
  chapterPageMap: Record<string, { start: number; end: number; pages: number }>;
}

function renderTrimLabel(interiorFormat: InteriorFormat): string {
  if (interiorFormat.trimSize === 'custom') {
    return `${interiorFormat.pageWidthIn}" x ${interiorFormat.pageHeightIn}"`;
  }

  return interiorFormat.trimSize.toUpperCase();
}

function PreviewView(props: PreviewViewProps) {
  return (
    <section className="preview-view">
      <header className="preview-header">
        <div>
          <h2>Vista previa del libro</h2>
          <p>
            Maquetado con formato {renderTrimLabel(props.interiorFormat)}. Usa esta vista para revisar ritmo visual,
            paginacion y consistencia antes de exportar o publicar.
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          title="Abre la impresion del sistema para generar PDF del estado actual."
        >
          Imprimir / PDF
        </button>
      </header>

      <div className="preview-book">
        <article className="preview-page preview-cover">
          {props.coverSrc ? (
            <img src={props.coverSrc} alt="Portada del libro" />
          ) : (
            <div className="preview-cover-placeholder">
              <h3>{props.title}</h3>
              <p>{props.author}</p>
            </div>
          )}
        </article>

        {props.chapters.map((chapter) => {
          const pageRange = props.chapterPageMap[chapter.id];
          return (
            <article key={chapter.id} className="preview-page">
              <header className="preview-chapter-header">
                <span>{chapter.id}</span>
                <h3>{chapter.title}</h3>
                <p>
                  Hojas estimadas: {pageRange ? `${pageRange.start}-${pageRange.end}` : '-'}{' '}
                  {pageRange?.pages ? `(${pageRange.pages})` : ''}
                </p>
              </header>
              <div className="preview-content" dangerouslySetInnerHTML={{ __html: chapter.content }} />
            </article>
          );
        })}

        <article className="preview-page preview-cover">
          {props.backCoverSrc ? (
            <img src={props.backCoverSrc} alt="Contraportada del libro" />
          ) : (
            <div className="preview-cover-placeholder">
              <h3>Contraportada</h3>
              <p>Completa este espacio en la seccion Portada.</p>
            </div>
          )}
        </article>
      </div>
    </section>
  );
}

export default PreviewView;
