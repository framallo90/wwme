import { useEffect, useState } from 'react';
import './PromptModal.css';

interface PromptModalProps {
  isOpen: boolean;
  title: string;
  label: string;
  defaultValue?: string;
  onConfirm: (value: string) => void;
  onClose: () => void;
}

function PromptModal(props: PromptModalProps) {
  const { isOpen, title, label, defaultValue, onConfirm, onClose } = props;
  const [value, setValue] = useState(defaultValue ?? '');

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  const handleConfirm = () => {
    if (value.trim()) {
      onConfirm(value.trim());
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      handleConfirm();
    }
  };

  return (
    <div className="prompt-modal-overlay" onClick={onClose}>
      <div className="prompt-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="prompt-modal-head">
          <h2>{title}</h2>
          <button className="prompt-modal-close" onClick={onClose} aria-label="Cerrar">
            X
          </button>
        </div>
        <label>
          {label}
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
          />
        </label>
        <div className="prompt-modal-actions">
          <button onClick={onClose}>Cancelar</button>
          <button onClick={handleConfirm} disabled={!value.trim()}>
            Aceptar
          </button>
        </div>
      </div>
    </div>
  );
}

export default PromptModal;
