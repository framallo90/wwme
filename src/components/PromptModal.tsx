import { useState, useEffect } from 'react';
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
  const [value, setValue] = useState(props.defaultValue ?? '');

  useEffect(() => {
    setValue(props.defaultValue ?? '');
  }, [props.defaultValue, props.isOpen]);

  if (!props.isOpen) {
    return null;
  }

  const handleConfirm = () => {
    if (value.trim()) {
      props.onConfirm(value.trim());
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      handleConfirm();
    }
  };

  return (
    <div className="prompt-modal-overlay" onClick={props.onClose}>
      <div className="prompt-modal-content" onClick={(e) => e.stopPropagation()}>
        <h2>{props.title}</h2>
        <label>
          {props.label}
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
          />
        </label>
        <div className="prompt-modal-actions">
          <button onClick={props.onClose}>Cancelar</button>
          <button onClick={handleConfirm}>Aceptar</button>
        </div>
      </div>
    </div>
  );
}

export default PromptModal;
