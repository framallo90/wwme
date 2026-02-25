import type { BookFoundation } from '../types/book';

interface BookFoundationPanelProps {
  foundation: BookFoundation;
  onChange: (foundation: BookFoundation) => void;
  onSave: () => void;
}

function BookFoundationPanel(props: BookFoundationPanelProps) {
  const { foundation } = props;

  return (
    <section className="settings-view">
      <header>
        <h2>Base del libro</h2>
        <p>Define la idea madre para no repetir instrucciones en cada capitulo.</p>
      </header>

      <label>
        Idea central
        <textarea
          rows={3}
          value={foundation.centralIdea}
          onChange={(event) => props.onChange({ ...foundation, centralIdea: event.target.value })}
          placeholder="Que sostiene todo el libro"
        />
      </label>

      <label>
        Promesa del libro
        <textarea
          rows={3}
          value={foundation.promise}
          onChange={(event) => props.onChange({ ...foundation, promise: event.target.value })}
          placeholder="Que recibe el lector al terminar"
        />
      </label>

      <label>
        Audiencia objetivo
        <input
          value={foundation.audience}
          onChange={(event) => props.onChange({ ...foundation, audience: event.target.value })}
          placeholder="Para quien esta escrito"
        />
      </label>

      <label>
        Voz narrativa
        <input
          value={foundation.narrativeVoice}
          onChange={(event) => props.onChange({ ...foundation, narrativeVoice: event.target.value })}
          placeholder="Ej: intimo, sobrio, reflexivo"
        />
      </label>

      <label>
        Reglas de estilo
        <textarea
          rows={4}
          value={foundation.styleRules}
          onChange={(event) => props.onChange({ ...foundation, styleRules: event.target.value })}
          placeholder="Reglas fijas de escritura"
        />
      </label>

      <label>
        Notas de estructura
        <textarea
          rows={4}
          value={foundation.structureNotes}
          onChange={(event) => props.onChange({ ...foundation, structureNotes: event.target.value })}
          placeholder="Estructura general o arco"
        />
      </label>

      <label>
        Glosario preferido
        <textarea
          rows={3}
          value={foundation.glossaryPreferred}
          onChange={(event) => props.onChange({ ...foundation, glossaryPreferred: event.target.value })}
          placeholder="Terminos recomendados"
        />
      </label>

      <label>
        Glosario a evitar
        <textarea
          rows={3}
          value={foundation.glossaryAvoid}
          onChange={(event) => props.onChange({ ...foundation, glossaryAvoid: event.target.value })}
          placeholder="Terminos o estilos a no usar"
        />
      </label>

      <button type="button" onClick={props.onSave}>Guardar base del libro</button>
    </section>
  );
}

export default BookFoundationPanel;
