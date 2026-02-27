interface CoverViewProps {
  coverSrc: string | null;
  backCoverSrc: string | null;
  coverDiagnostic: string | null;
  backCoverDiagnostic: string | null;
  coverFileInfo: { extension: string; bytes: number } | null;
  backCoverFileInfo: { extension: string; bytes: number } | null;
  spineText: string;
  onPickCover: () => void;
  onClearCover: () => void;
  onPickBackCover: () => void;
  onClearBackCover: () => void;
  onRetryLoad: () => void;
  onSpineTextChange: (value: string) => void;
  onSaveSpineText: () => void;
}

function CoverView(props: CoverViewProps) {
  return (
    <section className="cover-view">
      <header>
        <h2>Portada / Contraportada</h2>
      </header>

      <div className="cover-layout-grid">
        <article className="cover-slot">
          <h3>Portada</h3>
          <div className="cover-preview">
            {props.coverSrc ? <img src={props.coverSrc} alt="Portada del libro" /> : <p>Sin portada</p>}
          </div>
          <div className="cover-actions">
            <button type="button" onClick={props.onPickCover} title="Selecciona una imagen para la portada.">
              Cambiar portada
            </button>
            <button type="button" onClick={props.onClearCover} disabled={!props.coverSrc} title="Elimina la portada actual del libro.">
              Quitar portada
            </button>
            <button type="button" onClick={props.onRetryLoad} title="Reintenta cargar la portada desde disco.">
              Reintentar
            </button>
          </div>
          {props.coverFileInfo ? (
            <p className="muted">
              Archivo portada: .{props.coverFileInfo.extension} ({Math.round(props.coverFileInfo.bytes / 1024)} KB)
            </p>
          ) : null}
          {props.coverDiagnostic ? <p className="warning-text">{props.coverDiagnostic}</p> : null}
        </article>

        <article className="cover-slot">
          <h3>Contraportada</h3>
          <div className="cover-preview">
            {props.backCoverSrc ? <img src={props.backCoverSrc} alt="Contraportada del libro" /> : <p>Sin contraportada</p>}
          </div>
          <div className="cover-actions">
            <button type="button" onClick={props.onPickBackCover} title="Selecciona una imagen para la contraportada.">
              Cambiar contraportada
            </button>
            <button type="button" onClick={props.onClearBackCover} disabled={!props.backCoverSrc} title="Elimina la contraportada actual del libro.">
              Quitar contraportada
            </button>
            <button type="button" onClick={props.onRetryLoad} title="Reintenta cargar la contraportada desde disco.">
              Reintentar
            </button>
          </div>
          {props.backCoverFileInfo ? (
            <p className="muted">
              Archivo contraportada: .{props.backCoverFileInfo.extension} ({Math.round(props.backCoverFileInfo.bytes / 1024)} KB)
            </p>
          ) : null}
          {props.backCoverDiagnostic ? <p className="warning-text">{props.backCoverDiagnostic}</p> : null}
        </article>
      </div>

      <label>
        Texto de lomo / titulo central
        <input
          value={props.spineText}
          onChange={(event) => props.onSpineTextChange(event.target.value)}
          placeholder="Titulo para el lomo"
        />
      </label>
      <button type="button" onClick={props.onSaveSpineText} title="Guarda portada, contraportada y texto de lomo en book.json.">
        Guardar datos de portada
      </button>
    </section>
  );
}

export default CoverView;
