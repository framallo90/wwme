interface CoverViewProps {
  coverSrc: string | null;
  backCoverSrc: string | null;
  spineText: string;
  onPickCover: () => void;
  onClearCover: () => void;
  onPickBackCover: () => void;
  onClearBackCover: () => void;
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
          </div>
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
          </div>
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
