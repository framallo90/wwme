import { useMemo, useState } from 'react';

import {
  applyAmazonPreset,
  buildAmazonCopyPack,
  categoriesAsLines,
  generateAmazonCopy,
  keywordsAsLines,
} from '../lib/amazon';
import type { AmazonPresetType, BookMetadata, ChapterDocument } from '../types/book';

interface AmazonPanelProps {
  metadata: BookMetadata;
  chapters: ChapterDocument[];
  onChangeMetadata: (next: BookMetadata) => void;
  onSave: () => void;
}

const PRESET_OPTIONS: Array<{ id: AmazonPresetType; label: string }> = [
  { id: 'non-fiction-reflexive', label: 'No ficcion reflexiva' },
  { id: 'practical-essay', label: 'Ensayo practico' },
  { id: 'intimate-narrative', label: 'Narrativa intima' },
];

function copyWithFallback(value: string): Promise<void> {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(value);
  }

  const area = document.createElement('textarea');
  area.value = value;
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.focus();
  area.select();
  document.execCommand('copy');
  document.body.removeChild(area);
  return Promise.resolve();
}

function AmazonPanel(props: AmazonPanelProps) {
  const [copyStatus, setCopyStatus] = useState('');

  const amazon = props.metadata.amazon;
  const copyPack = useMemo(() => buildAmazonCopyPack(props.metadata), [props.metadata]);

  const updateAmazon = (patch: Partial<BookMetadata['amazon']>) => {
    props.onChangeMetadata({
      ...props.metadata,
      amazon: {
        ...props.metadata.amazon,
        ...patch,
      },
    });
  };

  const updateKeyword = (index: number, value: string) => {
    const next = [...amazon.keywords];
    next[index] = value;
    updateAmazon({ keywords: next });
  };

  const updateCategory = (index: number, value: string) => {
    const next = [...amazon.categories];
    next[index] = value;
    updateAmazon({ categories: next });
  };

  const handleCopy = async (label: string, value: string) => {
    await copyWithFallback(value);
    setCopyStatus(`Copiado: ${label}`);
  };

  const applyPreset = () => {
    const next = applyAmazonPreset(amazon, amazon.presetType, {
      bookTitle: props.metadata.title,
      author: props.metadata.author,
    });
    updateAmazon(next);
  };

  const autoGenerate = () => {
    const next = generateAmazonCopy(props.metadata, props.chapters, props.metadata.amazon);
    updateAmazon(next);
  };

  const kdpChecklist = [
    '1) KDP > Kindle eBook Details: pegar Titulo, Subtitulo, Descripcion, Keywords y Categorias.',
    '2) KDP > Content: subir manuscrito (MD/HTML convertido) y portada final.',
    '3) KDP > Pricing: definir territorios, precio y publicar.',
  ].join('\n');

  return (
    <section className="settings-view amazon-view">
      <header>
        <h2>Amazon KDP</h2>
        <p>Preset listo para copiar y pegar en la carga del libro.</p>
      </header>

      <div className="amazon-toolbar">
        <label>
          Preset
          <select
            value={amazon.presetType}
            onChange={(event) => updateAmazon({ presetType: event.target.value as AmazonPresetType })}
          >
            {PRESET_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <button onClick={applyPreset}>Aplicar preset</button>
        <button onClick={autoGenerate}>Auto-completar textos</button>
        <button onClick={() => props.onSave()}>Guardar Amazon</button>
      </div>

      <div className="amazon-grid">
        <label>
          Marketplace
          <input value={amazon.marketplace} onChange={(event) => updateAmazon({ marketplace: event.target.value })} />
        </label>

        <label>
          Idioma
          <input value={amazon.language} onChange={(event) => updateAmazon({ language: event.target.value })} />
        </label>

        <label>
          Titulo KDP
          <input value={amazon.kdpTitle} onChange={(event) => updateAmazon({ kdpTitle: event.target.value })} />
        </label>

        <label>
          Subtitulo
          <input value={amazon.subtitle} onChange={(event) => updateAmazon({ subtitle: event.target.value })} />
        </label>

        <label>
          Pen Name
          <input value={amazon.penName} onChange={(event) => updateAmazon({ penName: event.target.value })} />
        </label>

        <label>
          Serie
          <input value={amazon.seriesName} onChange={(event) => updateAmazon({ seriesName: event.target.value })} />
        </label>

        <label>
          Edicion
          <input value={amazon.edition} onChange={(event) => updateAmazon({ edition: event.target.value })} />
        </label>
      </div>

      <section className="amazon-section">
        <div className="section-title-row">
          <h3>Descripcion corta</h3>
          <button onClick={() => handleCopy('Descripcion corta', amazon.backCoverText)}>Copiar</button>
        </div>
        <textarea
          rows={4}
          value={amazon.backCoverText}
          onChange={(event) => updateAmazon({ backCoverText: event.target.value })}
        />
      </section>

      <section className="amazon-section">
        <div className="section-title-row">
          <h3>Descripcion larga (KDP)</h3>
          <button onClick={() => handleCopy('Descripcion larga', amazon.longDescription)}>Copiar</button>
        </div>
        <textarea
          rows={10}
          value={amazon.longDescription}
          onChange={(event) => updateAmazon({ longDescription: event.target.value })}
        />
      </section>

      <section className="amazon-section">
        <div className="section-title-row">
          <h3>Keywords (7)</h3>
          <button onClick={() => handleCopy('Keywords', keywordsAsLines(amazon))}>Copiar lineas</button>
        </div>
        <div className="amazon-lines">
          {amazon.keywords.map((keyword, index) => (
            <input
              key={`kw-${index}`}
              value={keyword}
              onChange={(event) => updateKeyword(index, event.target.value)}
              placeholder={`Keyword ${index + 1}`}
            />
          ))}
        </div>
      </section>

      <section className="amazon-section">
        <div className="section-title-row">
          <h3>Categorias</h3>
          <button onClick={() => handleCopy('Categorias', categoriesAsLines(amazon))}>Copiar lineas</button>
        </div>
        <div className="amazon-lines">
          {amazon.categories.map((category, index) => (
            <input
              key={`cat-${index}`}
              value={category}
              onChange={(event) => updateCategory(index, event.target.value)}
              placeholder={`Categoria ${index + 1}`}
            />
          ))}
        </div>
      </section>

      <section className="amazon-section">
        <div className="section-title-row">
          <h3>Bio autor</h3>
          <button onClick={() => handleCopy('Bio autor', amazon.authorBio)}>Copiar</button>
        </div>
        <textarea rows={4} value={amazon.authorBio} onChange={(event) => updateAmazon({ authorBio: event.target.value })} />
      </section>

      <section className="amazon-section">
        <div className="section-title-row">
          <h3>Notas KDP</h3>
          <button onClick={() => handleCopy('Notas KDP', amazon.kdpNotes)}>Copiar</button>
        </div>
        <textarea rows={4} value={amazon.kdpNotes} onChange={(event) => updateAmazon({ kdpNotes: event.target.value })} />
      </section>

      <section className="amazon-section">
        <div className="section-title-row">
          <h3>Checklist de subida</h3>
          <button onClick={() => handleCopy('Checklist', kdpChecklist)}>Copiar</button>
        </div>
        <pre className="feedback-box">{kdpChecklist}</pre>
      </section>

      <section className="amazon-section">
        <div className="section-title-row">
          <h3>Pack completo</h3>
          <button onClick={() => handleCopy('Pack Amazon', copyPack)}>Copiar pack</button>
        </div>
        <pre className="feedback-box">{copyPack}</pre>
      </section>

      {copyStatus ? <p className="muted">{copyStatus}</p> : null}
    </section>
  );
}

export default AmazonPanel;
