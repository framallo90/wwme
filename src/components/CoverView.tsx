interface CoverViewProps {
  coverSrc: string | null;
  onPickCover: () => void;
  onClearCover: () => void;
}

function CoverView(props: CoverViewProps) {
  return (
    <section className="cover-view">
      <header>
        <h2>Portada</h2>
      </header>

      <div className="cover-preview">
        {props.coverSrc ? <img src={props.coverSrc} alt="Portada del libro" /> : <p>Sin portada</p>}
      </div>

      <div className="cover-actions">
        <button onClick={props.onPickCover}>Cambiar portada</button>
        <button onClick={props.onClearCover} disabled={!props.coverSrc}>
          Quitar portada
        </button>
      </div>
    </section>
  );
}

export default CoverView;
