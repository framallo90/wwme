import { useMemo, useState } from 'react';

import {
  applyAmazonPreset,
  buildAmazonCopyPack,
  categoriesAsLines,
  generateAmazonCopy,
  keywordsAsLines,
} from '../lib/amazon';
import { buildInteriorCss } from '../lib/export';
import type { AmazonPresetType, BookMetadata, ChapterDocument } from '../types/book';

interface AmazonPanelProps {
  metadata: BookMetadata;
  chapters: ChapterDocument[];
  onChangeMetadata: (next: BookMetadata) => void;
  onSave: () => void;
  onExportAmazonBundle: () => void;
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
  const interior = props.metadata.interiorFormat;
  const interiorCss = useMemo(() => buildInteriorCss(props.metadata), [props.metadata]);

  const updateAmazon = (patch: Partial<BookMetadata['amazon']>) => {
    props.onChangeMetadata({
      ...props.metadata,
      amazon: {
        ...props.metadata.amazon,
        ...patch,
      },
    });
  };

  const updateInterior = (patch: Partial<BookMetadata['interiorFormat']>) => {
    props.onChangeMetadata({
      ...props.metadata,
      interiorFormat: {
        ...props.metadata.interiorFormat,
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

  const handleTrimPreset = (trim: BookMetadata['interiorFormat']['trimSize']) => {
    if (trim === '5x8') {
      updateInterior({ trimSize: trim, pageWidthIn: 5, pageHeightIn: 8 });
      return;
    }
    if (trim === '5.5x8.5') {
      updateInterior({ trimSize: trim, pageWidthIn: 5.5, pageHeightIn: 8.5 });
      return;
    }
    if (trim === 'a5') {
      updateInterior({ trimSize: trim, pageWidthIn: 5.83, pageHeightIn: 8.27 });
      return;
    }
    if (trim === '6x9') {
      updateInterior({ trimSize: trim, pageWidthIn: 6, pageHeightIn: 9 });
      return;
    }
    updateInterior({ trimSize: 'custom' });
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
        <button type="button" onClick={applyPreset} title="Aplica estructura base de metadatos segun el tipo de libro.">
          Aplicar preset
        </button>
        <button type="button" onClick={autoGenerate} title="Genera textos sugeridos para descripcion, bio y notas.">
          Auto-completar textos
        </button>
        <button type="button" onClick={props.onExportAmazonBundle} title="Exporta paquete TXT + HTML para carga en Amazon.">
          Export pack Amazon
        </button>
        <button type="button" onClick={() => props.onSave()} title="Guarda todos los campos Amazon dentro del libro.">
          Guardar Amazon
        </button>
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
          <button type="button" onClick={() => handleCopy('Descripcion corta', amazon.backCoverText)} title="Copia la descripcion corta al portapapeles.">
            Copiar
          </button>
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
          <button type="button" onClick={() => handleCopy('Descripcion larga', amazon.longDescription)} title="Copia la descripcion larga para pegar en KDP.">
            Copiar
          </button>
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
          <button type="button" onClick={() => handleCopy('Keywords', keywordsAsLines(amazon))} title="Copia keywords separadas por linea.">
            Copiar lineas
          </button>
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
          <button type="button" onClick={() => handleCopy('Categorias', categoriesAsLines(amazon))} title="Copia categorias separadas por linea.">
            Copiar lineas
          </button>
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
          <button type="button" onClick={() => handleCopy('Bio autor', amazon.authorBio)} title="Copia biografia de autor.">
            Copiar
          </button>
        </div>
        <textarea rows={4} value={amazon.authorBio} onChange={(event) => updateAmazon({ authorBio: event.target.value })} />
      </section>

      <section className="amazon-section">
        <div className="section-title-row">
          <h3>Notas KDP</h3>
          <button type="button" onClick={() => handleCopy('Notas KDP', amazon.kdpNotes)} title="Copia notas operativas para KDP.">
            Copiar
          </button>
        </div>
        <textarea rows={4} value={amazon.kdpNotes} onChange={(event) => updateAmazon({ kdpNotes: event.target.value })} />
      </section>

      <section className="amazon-section">
        <div className="section-title-row">
          <h3>Formato interior (Amazon Print)</h3>
        </div>
        <div className="amazon-grid">
          <label>
            Trim size
            <select value={interior.trimSize} onChange={(event) => handleTrimPreset(event.target.value as BookMetadata['interiorFormat']['trimSize'])}>
              <option value="5x8">5 x 8 in</option>
              <option value="5.5x8.5">5.5 x 8.5 in</option>
              <option value="6x9">6 x 9 in</option>
              <option value="a5">A5</option>
              <option value="custom">Custom</option>
            </select>
          </label>
          <label>
            Ancho (in)
            <input
              type="number"
              step="0.01"
              min="4"
              max="8.5"
              value={interior.pageWidthIn}
              onChange={(event) => updateInterior({ pageWidthIn: Number.parseFloat(event.target.value || '6'), trimSize: 'custom' })}
            />
          </label>
          <label>
            Alto (in)
            <input
              type="number"
              step="0.01"
              min="6"
              max="11"
              value={interior.pageHeightIn}
              onChange={(event) => updateInterior({ pageHeightIn: Number.parseFloat(event.target.value || '9'), trimSize: 'custom' })}
            />
          </label>
          <label>
            Margen superior (mm)
            <input
              type="number"
              step="0.5"
              min="8"
              max="35"
              value={interior.marginTopMm}
              onChange={(event) => updateInterior({ marginTopMm: Number.parseFloat(event.target.value || '18') })}
            />
          </label>
          <label>
            Margen inferior (mm)
            <input
              type="number"
              step="0.5"
              min="8"
              max="35"
              value={interior.marginBottomMm}
              onChange={(event) => updateInterior({ marginBottomMm: Number.parseFloat(event.target.value || '18') })}
            />
          </label>
          <label>
            Margen interior (mm)
            <input
              type="number"
              step="0.5"
              min="8"
              max="40"
              value={interior.marginInsideMm}
              onChange={(event) => updateInterior({ marginInsideMm: Number.parseFloat(event.target.value || '20') })}
            />
          </label>
          <label>
            Margen exterior (mm)
            <input
              type="number"
              step="0.5"
              min="8"
              max="30"
              value={interior.marginOutsideMm}
              onChange={(event) => updateInterior({ marginOutsideMm: Number.parseFloat(event.target.value || '16') })}
            />
          </label>
          <label>
            Sangria parrafo (em)
            <input
              type="number"
              step="0.1"
              min="0"
              max="3"
              value={interior.paragraphIndentEm}
              onChange={(event) => updateInterior({ paragraphIndentEm: Number.parseFloat(event.target.value || '1.4') })}
            />
          </label>
          <label>
            Interlineado
            <input
              type="number"
              step="0.05"
              min="1.1"
              max="2"
              value={interior.lineHeight}
              onChange={(event) => updateInterior({ lineHeight: Number.parseFloat(event.target.value || '1.55') })}
            />
          </label>
        </div>
        <details>
          <summary>Ver CSS de maquetado</summary>
          <pre className="feedback-box">{interiorCss}</pre>
        </details>
      </section>

      <section className="amazon-section">
        <div className="section-title-row">
          <h3>Checklist de subida</h3>
          <button type="button" onClick={() => handleCopy('Checklist', kdpChecklist)} title="Copia checklist de pasos de subida.">
            Copiar
          </button>
        </div>
        <pre className="feedback-box">{kdpChecklist}</pre>
      </section>

      <section className="amazon-section">
        <div className="section-title-row">
          <h3>Pack completo</h3>
          <button type="button" onClick={() => handleCopy('Pack Amazon', copyPack)} title="Copia todo el pack de metadatos en un bloque unico.">
            Copiar pack
          </button>
        </div>
        <pre className="feedback-box">{copyPack}</pre>
      </section>

      {copyStatus ? <p className="muted">{copyStatus}</p> : null}
    </section>
  );
}

export default AmazonPanel;
