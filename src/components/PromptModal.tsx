import { useEffect, useId, useRef, useState } from 'react';
import './PromptModal.css';

interface PromptModalProps {
  isOpen: boolean;
  title: string;
  label: string;
  defaultValue?: string;
  placeholder?: string;
  multiline?: boolean;
  confirmLabel?: string;
  secondaryLabel?: string;
  onSecondary?: () => void;
  onConfirm: (value: string) => void;
  onClose: () => void;
}

function PromptModal(props: PromptModalProps) {
  const {
    isOpen,
    title,
    label,
    defaultValue,
    placeholder,
    multiline,
    confirmLabel,
    secondaryLabel,
    onSecondary,
    onConfirm,
    onClose,
  } = props;
  const [value, setValue] = useState(defaultValue ?? '');
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    if (multiline) {
      textareaRef.current?.focus();
      return;
    }
    inputRef.current?.focus();
  }, [isOpen, multiline]);

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

  const handleDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') {
      return;
    }

    const container = dialogRef.current;
    if (!container) {
      return;
    }

    const focusables = Array.from(
      container.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    );

    if (focusables.length === 0) {
      event.preventDefault();
      return;
    }

    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement as HTMLElement | null;

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
      return;
    }

    if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="prompt-modal-overlay" onClick={onClose}>
      <div
        ref={dialogRef}
        className="prompt-modal-content"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={handleDialogKeyDown}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="prompt-modal-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="prompt-modal-close" onClick={onClose} aria-label="Cerrar">
            X
          </button>
        </div>
        <label>
          {label}
          {multiline ? (
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={placeholder}
              autoFocus
              rows={7}
            />
          ) : (
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              autoFocus
            />
          )}
        </label>
        <div className="prompt-modal-actions">
          <button type="button" onClick={onClose}>Cancelar</button>
          {onSecondary && secondaryLabel ? (
            <button type="button" onClick={onSecondary}>
              {secondaryLabel}
            </button>
          ) : null}
          <button type="button" onClick={handleConfirm} disabled={!value.trim()}>
            {confirmLabel ?? 'Aceptar'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default PromptModal;
