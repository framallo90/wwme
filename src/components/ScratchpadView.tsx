import { useCallback, useEffect, useRef, useState } from 'react';

interface ScratchpadViewProps {
  scratchpad: string;
  bookTitle: string;
  onSave: (text: string) => void;
}

function ScratchpadView({ scratchpad, bookTitle, onSave }: ScratchpadViewProps) {
  const [localText, setLocalText] = useState('');
  const [dirty, setDirty] = useState(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visibleText = dirty ? localText : scratchpad;

  const commitText = useCallback((value: string) => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }

    onSave(value);
    setDirty(false);
    setLocalText('');
  }, [onSave]);

  const handleSave = useCallback(() => {
    commitText(visibleText);
  }, [commitText, visibleText]);

  const handleChange = (value: string) => {
    setLocalText(value);
    setDirty(true);
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    autoSaveTimerRef.current = setTimeout(() => {
      commitText(value);
    }, 5000);
  };

  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, []);

  return (
    <section className="scratchpad-view">
      <header>
        <h2>Banco de ideas</h2>
        <p>Recortes, escenas sueltas, apuntes de trama y dialogos futuros. Nada de esto altera el manuscrito oficial.</p>
        {bookTitle ? <p className="muted">Libro activo: {bookTitle}</p> : null}
      </header>

      <div className="scratchpad-toolbar">
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty}
          title="Guardar el borrador libre (Ctrl+S)"
        >
          {dirty ? 'Guardar cambios' : 'Guardado'}
        </button>
        <span className="muted">{visibleText.length} caracteres</span>
      </div>

      <textarea
        className="scratchpad-textarea"
        value={visibleText}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={`Ideas para "${bookTitle || 'tu libro'}":\n\n- ?Que motivacion oculta tiene el antagonista?\n- Escena que todavia no encaja en ningun capitulo...\n- Posibles giros para el final...\n- Dialogo que quiero usar mas adelante...`}
        onKeyDown={(e) => {
          if (e.ctrlKey && e.key === 's') {
            e.preventDefault();
            handleSave();
          }
        }}
      />
    </section>
  );
}

export default ScratchpadView;
