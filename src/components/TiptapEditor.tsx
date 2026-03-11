import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Extension, Node, mergeAttributes, type JSONContent } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';

import type { ContinuityHighlightTerm } from '../lib/continuityGuard';
import { plainTextToHtml } from '../lib/text';
import type { InteriorFormat } from '../types/book';
import {
  buildSemanticReferenceHtml,
  convertSemanticReferenceShortcodesToHtml,
  type SemanticReferenceCatalogEntry,
  type SemanticReferenceInsertPayload,
} from '../lib/semanticReferences';

export interface TiptapEditorHandle {
  hasSelection: () => boolean;
  getSelectionText: () => string;
  getDocumentText: () => string;
  insertText: (value: string) => void;
  insertSemanticReference: (reference: SemanticReferenceInsertPayload) => void;
  previewSelectionReplacement: (value: string) => string;
  replaceSelectionWithText: (value: string) => void;
  replaceDocumentWithText: (value: string) => void;
  getHTML: () => string;
  getJSON: () => JSONContent | null;
  canUndo: () => boolean;
  canRedo: () => boolean;
  undo: () => void;
  redo: () => void;
  focus: () => void;
}

interface TiptapEditorProps {
  content: string;
  interiorFormat: InteriorFormat;
  scrollPersistenceKey?: string;
  continuityHighlightEnabled?: boolean;
  continuityHighlights?: ContinuityHighlightTerm[];
  semanticReferencesCatalog?: SemanticReferenceCatalogEntry[];
  onChange: (payload: { html: string; json: JSONContent }) => void;
  onSemanticReferenceOpen?: (reference: {
    id: string;
    kind: 'character' | 'location';
    label: string;
    targetView: 'bible' | 'saga';
  }) => void;
  onBlur?: () => void;
}

interface ContinuityHighlightPattern {
  id: string;
  kind: ContinuityHighlightTerm['kind'];
  label: string;
  tooltip: string;
  termLength: number;
  regex: RegExp;
}

interface SemanticSuggestionState {
  kind: 'character' | 'location';
  from: number;
  to: number;
  query: string;
  entries: SemanticReferenceCatalogEntry[];
  selectedIndex: number;
  position: {
    top: number;
    left: number;
  };
}

const CONTINUITY_PLUGIN_KEY = new PluginKey('continuity-highlights');
const CONTINUITY_WORD_CHARS = 'A-Za-z0-9\\u00C0-\\u024F';
const CONTINUITY_HIGHLIGHT_SOFT_WARNING_TERMS = 800;
const SEMANTIC_SUGGEST_PATTERN = /(?:^|[\s([{"'«])([@#])([\p{L}\p{N}_\-']{0,40})$/u;
const MAX_SEMANTIC_SUGGESTIONS = 7;
const editorScrollPositions = new Map<string, number>();
let lastContinuityDensityWarned = 0;

function normalizeEditorSemanticHtml(html: string, catalog: SemanticReferenceCatalogEntry[]): string {
  if (!html.trim() || catalog.length === 0) {
    return html;
  }

  // Evita recorrer todo el HTML en cada tecla cuando no hay shortcodes para convertir.
  if (!html.includes('@[') && !html.includes('#[')) {
    return html;
  }

  return convertSemanticReferenceShortcodesToHtml(html, catalog);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildContinuityHighlightPatterns(highlights: ContinuityHighlightTerm[]): ContinuityHighlightPattern[] {
  const seen = new Set<string>();
  const patterns: ContinuityHighlightPattern[] = [];

  for (const entry of highlights) {
    const term = entry.term.replace(/\s+/g, ' ').trim();
    if (term.length < 2) {
      continue;
    }

    const dedupeKey = `${entry.id}::${term.toLowerCase()}`;
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);

    patterns.push({
      id: entry.id,
      kind: entry.kind,
      label: entry.label,
      tooltip: entry.tooltip,
      termLength: term.length,
      regex: new RegExp(`(^|[^${CONTINUITY_WORD_CHARS}])(${escapeRegExp(term)})(?=$|[^${CONTINUITY_WORD_CHARS}])`, 'giu'),
    });
  }

  const sorted = patterns.sort((left, right) => right.termLength - left.termLength);
  if (sorted.length > CONTINUITY_HIGHLIGHT_SOFT_WARNING_TERMS) {
    const now = Date.now();
    if (now - lastContinuityDensityWarned > 60_000) {
      lastContinuityDensityWarned = now;
      console.warn(
        `[WriteWMe] Resaltado de continuidad intensivo: ${sorted.length} terminos activos. ` +
          'El resaltado sigue completo, pero el rendimiento puede bajar en equipos lentos.',
      );
    }
  }
  return sorted;
}

function buildContinuityDecorations(doc: ProseMirrorNode, patterns: ContinuityHighlightPattern[]): DecorationSet {
  const decorations: Decoration[] = [];
  const occupiedRanges: Array<{ start: number; end: number }> = [];

  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) {
      return true;
    }

    const text = node.text;
    for (const pattern of patterns) {
      pattern.regex.lastIndex = 0;
      let match = pattern.regex.exec(text);

      while (match) {
        const prefix = match[1] ?? '';
        const token = match[2] ?? '';
        if (token) {
          const start = pos + match.index + prefix.length;
          const end = start + token.length;
          const insideExisting = occupiedRanges.some((range) => start >= range.start && end <= range.end);
          if (!insideExisting) {
            occupiedRanges.push({ start, end });
            decorations.push(
              Decoration.inline(start, end, {
                class: `continuity-mention continuity-mention--${pattern.kind}`,
                title: `${pattern.label}: ${pattern.tooltip}`,
              }),
            );
          }
        }

        if (pattern.regex.lastIndex === match.index) {
          pattern.regex.lastIndex += 1;
        }
        match = pattern.regex.exec(text);
      }
    }

    return true;
  });

  return DecorationSet.create(doc, decorations);
}

function createContinuityHighlightExtension(enabled: boolean, highlights: ContinuityHighlightTerm[]): Extension {
  if (!enabled || highlights.length === 0) {
    return Extension.create({ name: 'continuity-highlights' });
  }

  const patterns = buildContinuityHighlightPatterns(highlights);
  if (patterns.length === 0) {
    return Extension.create({ name: 'continuity-highlights' });
  }

  return Extension.create({
    name: 'continuity-highlights',
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: CONTINUITY_PLUGIN_KEY,
          props: {
            decorations(state) {
              return buildContinuityDecorations(state.doc, patterns);
            },
          },
        }),
      ];
    },
  });
}

const SemanticReferenceNode = Node.create({
  name: 'semanticReference',
  inline: true,
  group: 'inline',
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      refKind: {
        default: 'character',
        parseHTML: (element) => element.getAttribute('data-semantic-ref-kind') || 'character',
      },
      refId: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-semantic-ref-id') || '',
      },
      label: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-semantic-ref-label') || element.textContent || '',
      },
      tooltip: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-semantic-ref-tooltip') || '',
      },
      targetView: {
        default: 'bible',
        parseHTML: (element) => element.getAttribute('data-semantic-ref-target-view') || 'bible',
      },
      status: {
        default: 'valid',
        parseHTML: (element) => element.getAttribute('data-semantic-ref-status') || 'valid',
      },
      warning: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-semantic-ref-warning') || '',
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-semantic-ref-kind]' }];
  },

  renderHTML({ HTMLAttributes, node }) {
    const refKind = node.attrs.refKind === 'location' ? 'location' : 'character';
    const label = String(node.attrs.label || '').trim();
    const warning = String(node.attrs.warning || '').trim();
    const tooltip = String(node.attrs.tooltip || '').trim();
    const title = [tooltip, warning].filter(Boolean).join(' | ');
    const prefix = refKind === 'character' ? '@' : '#';

    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        class: `semantic-reference semantic-reference--${refKind} semantic-reference--${String(node.attrs.status || 'valid')}`,
        'data-semantic-ref-kind': refKind,
        'data-semantic-ref-id': String(node.attrs.refId || ''),
        'data-semantic-ref-label': label,
        'data-semantic-ref-tooltip': tooltip,
        'data-semantic-ref-target-view': String(node.attrs.targetView || 'bible'),
        'data-semantic-ref-status': String(node.attrs.status || 'valid'),
        'data-semantic-ref-warning': warning,
        title,
      }),
      `${prefix}${label}`,
    ];
  },

  renderText({ node }) {
    const refKind = node.attrs.refKind === 'location' ? 'Lugar' : 'Personaje';
    const prefix = node.attrs.refKind === 'location' ? '#' : '@';
    const label = String(node.attrs.label || '').trim();
    return `${prefix}[${refKind}:${label}]`;
  },
});

function syncSemanticReferencesInEditor(
  instance: NonNullable<ReturnType<typeof useEditor>>,
  catalog: SemanticReferenceCatalogEntry[],
): { html: string; json: JSONContent } {
  const currentHtml = instance.getHTML();
  const normalizedHtml = normalizeEditorSemanticHtml(currentHtml, catalog);
  if (normalizedHtml !== currentHtml) {
    const { from, to } = instance.state.selection;
    instance.commands.setContent(normalizedHtml, { emitUpdate: false });
    if (instance.isFocused) {
      try {
        const docSize = instance.state.doc.content.size;
        instance.commands.setTextSelection({
          from: Math.min(from, docSize),
          to: Math.min(to, docSize),
        });
      } catch {
        // Ignora errores de rango cuando la conversion cambia el documento.
      }
    }
  }

  return {
    html: instance.getHTML(),
    json: instance.getJSON(),
  };
}

function normalizeSemanticLookupValue(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreSemanticSuggestion(entry: SemanticReferenceCatalogEntry, normalizedQuery: string): number {
  if (!normalizedQuery) {
    return 1;
  }

  const normalizedLabel = normalizeSemanticLookupValue(entry.label);
  if (normalizedLabel === normalizedQuery) {
    return 100;
  }
  if (normalizedLabel.startsWith(normalizedQuery)) {
    return 80;
  }
  if (normalizedLabel.includes(normalizedQuery)) {
    return 60;
  }

  for (const alias of entry.aliases) {
    const normalizedAlias = normalizeSemanticLookupValue(alias);
    if (!normalizedAlias) {
      continue;
    }
    if (normalizedAlias === normalizedQuery) {
      return 90;
    }
    if (normalizedAlias.startsWith(normalizedQuery)) {
      return 70;
    }
    if (normalizedAlias.includes(normalizedQuery)) {
      return 50;
    }
  }

  return 0;
}

function buildSemanticSuggestionEntries(
  catalog: SemanticReferenceCatalogEntry[],
  kind: 'character' | 'location',
  query: string,
): SemanticReferenceCatalogEntry[] {
  const normalizedQuery = normalizeSemanticLookupValue(query);
  return catalog
    .filter((entry) => entry.kind === kind)
    .map((entry) => ({
      entry,
      score: scoreSemanticSuggestion(entry, normalizedQuery),
    }))
    .filter((entry) => entry.score > 0 || !normalizedQuery)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.entry.label.localeCompare(right.entry.label);
    })
    .slice(0, MAX_SEMANTIC_SUGGESTIONS)
    .map((entry) => entry.entry);
}

const TiptapEditorBase = forwardRef<TiptapEditorHandle, TiptapEditorProps>(
  (
    {
      content,
      interiorFormat,
      scrollPersistenceKey,
      continuityHighlightEnabled = false,
      continuityHighlights = [],
      semanticReferencesCatalog = [],
      onChange,
      onSemanticReferenceOpen,
      onBlur,
    },
    ref,
  ) => {
    const [semanticSuggestion, setSemanticSuggestion] = useState<SemanticSuggestionState | null>(null);
    const semanticCatalogRef = useRef<SemanticReferenceCatalogEntry[]>(semanticReferencesCatalog);
    const onChangeRef = useRef(onChange);
    const onBlurRef = useRef(onBlur);
    const onSemanticReferenceOpenRef = useRef(onSemanticReferenceOpen);
    const lastInternalHtmlRef = useRef('');
    const editorWrapperRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
      semanticCatalogRef.current = semanticReferencesCatalog;
    }, [semanticReferencesCatalog]);

    useEffect(() => {
      onChangeRef.current = onChange;
    }, [onChange]);

    useEffect(() => {
      onBlurRef.current = onBlur;
    }, [onBlur]);

    useEffect(() => {
      onSemanticReferenceOpenRef.current = onSemanticReferenceOpen;
    }, [onSemanticReferenceOpen]);

    const continuityExtension = useMemo(
      () => createContinuityHighlightExtension(continuityHighlightEnabled, continuityHighlights),
      [continuityHighlightEnabled, continuityHighlights],
    );
    const initialNormalizedContent = useMemo(
      () => normalizeEditorSemanticHtml(content, semanticReferencesCatalog),
      [content, semanticReferencesCatalog],
    );

    const editor = useEditor({
      extensions: [
        StarterKit,
        Placeholder.configure({
          placeholder: 'Escribe tu capitulo aqui...',
        }),
        SemanticReferenceNode,
        continuityExtension,
      ],
      content: initialNormalizedContent,
      autofocus: false,
      editorProps: {
        attributes: {
          class: 'editor-content',
        },
        handleKeyDown: (view, event) => {
          const hasModifier = event.ctrlKey || event.metaKey || event.altKey;
          if (event.key === 'Tab' && !hasModifier) {
            event.preventDefault();
            const { from, to } = view.state.selection;
            const transaction = view.state.tr.insertText('  ', from, to);
            view.dispatch(transaction);
            return true;
          }
          return false;
        },
        handleClick: (_view, _pos, event) => {
          const target = event.target as HTMLElement | null;
          const referenceElement = target?.closest<HTMLElement>('[data-semantic-ref-kind]');
          if (!referenceElement) {
            return false;
          }

          const refKind = referenceElement.dataset.semanticRefKind === 'location' ? 'location' : 'character';
          const refId = referenceElement.dataset.semanticRefId?.trim() || '';
          const label = referenceElement.dataset.semanticRefLabel?.trim() || target?.textContent?.trim() || '';
          const targetView = referenceElement.dataset.semanticRefTargetView === 'saga' ? 'saga' : 'bible';
          if (!refId || !label) {
            return false;
          }

          onSemanticReferenceOpenRef.current?.({
            id: refId,
            kind: refKind,
            label,
            targetView,
          });
          return true;
        },
      },
      onUpdate: ({ editor: instance }) => {
        const normalized = syncSemanticReferencesInEditor(instance, semanticCatalogRef.current);
        lastInternalHtmlRef.current = normalized.html;
        onChangeRef.current(normalized);
      },
      onBlur: () => {
        setSemanticSuggestion(null);
        onBlurRef.current?.();
      },
    }, [continuityExtension]);

    const computeSemanticSuggestion = useCallback(
      (instance: NonNullable<ReturnType<typeof useEditor>>, previousIndex = 0): SemanticSuggestionState | null => {
        if (semanticCatalogRef.current.length === 0) {
          return null;
        }

        const { from, to } = instance.state.selection;
        if (from !== to) {
          return null;
        }

        const contextStart = Math.max(0, from - 90);
        const beforeCursor = instance.state.doc.textBetween(contextStart, from, '\n', '\u0000');
        const match = beforeCursor.match(SEMANTIC_SUGGEST_PATTERN);
        if (!match) {
          return null;
        }

        const trigger = match[1] as '@' | '#';
        const rawQuery = match[2] ?? '';
        const kind: SemanticSuggestionState['kind'] = trigger === '@' ? 'character' : 'location';
        const entries = buildSemanticSuggestionEntries(semanticCatalogRef.current, kind, rawQuery);
        if (entries.length === 0) {
          return null;
        }

        const rangeFrom = from - rawQuery.length - 1;
        if (rangeFrom < 0) {
          return null;
        }

        let cursorPosition: { left: number; bottom: number };
        try {
          const coords = instance.view.coordsAtPos(from);
          cursorPosition = { left: coords.left, bottom: coords.bottom };
        } catch {
          return null;
        }

        const safeLeft =
          typeof window === 'undefined'
            ? cursorPosition.left
            : Math.max(14, Math.min(cursorPosition.left, window.innerWidth - 320));
        const safeTop =
          typeof window === 'undefined'
            ? cursorPosition.bottom + 6
            : Math.max(12, Math.min(cursorPosition.bottom + 6, window.innerHeight - 240));
        const selectedIndex = Math.min(Math.max(previousIndex, 0), entries.length - 1);

        return {
          kind,
          from: rangeFrom,
          to: from,
          query: rawQuery,
          entries,
          selectedIndex,
          position: {
            top: safeTop,
            left: safeLeft,
          },
        };
      },
      [],
    );

    const applySemanticSuggestion = useCallback(
      (entry: SemanticReferenceCatalogEntry) => {
        if (!editor || !semanticSuggestion) {
          return;
        }

        editor
          .chain()
          .focus()
          .setTextSelection({ from: semanticSuggestion.from, to: semanticSuggestion.to })
          .deleteSelection()
          .insertContent(
            buildSemanticReferenceHtml({
              id: entry.id,
              kind: entry.kind,
              label: entry.label,
              tooltip: entry.tooltip,
              targetView: entry.targetView,
              warning: entry.warning,
            }),
          )
          .run();
        setSemanticSuggestion(null);
      },
      [editor, semanticSuggestion],
    );

    useEffect(() => {
      if (!editor) {
        return;
      }

      const refreshSuggestions = () => {
        setSemanticSuggestion((previous) =>
          computeSemanticSuggestion(editor, previous?.selectedIndex ?? 0),
        );
      };
      const hideSuggestions = () => {
        setSemanticSuggestion(null);
      };

      refreshSuggestions();
      editor.on('selectionUpdate', refreshSuggestions);
      editor.on('update', refreshSuggestions);
      editor.on('blur', hideSuggestions);

      return () => {
        editor.off('selectionUpdate', refreshSuggestions);
        editor.off('update', refreshSuggestions);
        editor.off('blur', hideSuggestions);
      };
    }, [computeSemanticSuggestion, editor]);

    useEffect(() => {
      if (!editor || !semanticSuggestion) {
        return;
      }

      const handleKeyboard = (event: KeyboardEvent) => {
        if (!editor.isFocused) {
          return;
        }

        if (
          event.key === 'Shift' ||
          event.key === 'Alt' ||
          event.key === 'AltGraph' ||
          event.key === 'Control' ||
          event.key === 'Meta' ||
          event.key === 'CapsLock'
        ) {
          return;
        }

        if (event.key === 'ArrowDown') {
          event.preventDefault();
          setSemanticSuggestion((previous) => {
            if (!previous) {
              return previous;
            }
            return {
              ...previous,
              selectedIndex: (previous.selectedIndex + 1) % previous.entries.length,
            };
          });
          return;
        }

        if (event.key === 'ArrowUp') {
          event.preventDefault();
          setSemanticSuggestion((previous) => {
            if (!previous) {
              return previous;
            }
            return {
              ...previous,
              selectedIndex:
                (previous.selectedIndex - 1 + previous.entries.length) % previous.entries.length,
            };
          });
          return;
        }

        if (event.key === 'Enter' || event.key === 'Tab') {
          event.preventDefault();
          const entry = semanticSuggestion.entries[semanticSuggestion.selectedIndex];
          if (entry) {
            applySemanticSuggestion(entry);
          }
          return;
        }

        if (event.key === 'Escape') {
          event.preventDefault();
          setSemanticSuggestion(null);
        }
      };

      window.addEventListener('keydown', handleKeyboard, true);
      return () => {
        window.removeEventListener('keydown', handleKeyboard, true);
      };
    }, [applySemanticSuggestion, editor, semanticSuggestion]);

    useEffect(() => {
      if (!editor) {
        return;
      }

      // Cuando el editor tiene foco, el es la fuente de verdad.
      if (editor.isFocused) {
        return;
      }

      const nextNormalizedContent = normalizeEditorSemanticHtml(
        content,
        semanticCatalogRef.current,
      );

      // Si el contenido entrante es simplemente el eco del onUpdate del propio editor,
      // ignorar: sincronizar aqui con el output del editor causa una race condition
      // cuando React entrega el efecto con contenido viejo mientras el editor ya tiene
      // teclas mas recientes, reseteando el documento y saltando el cursor al inicio.
      if (nextNormalizedContent === lastInternalHtmlRef.current) {
        return;
      }

      const current = editor.getHTML();
      if (nextNormalizedContent !== current) {
        editor.commands.setContent(nextNormalizedContent, { emitUpdate: false });
      }
    }, [content, editor]);

    useEffect(() => {
      if (!scrollPersistenceKey) {
        return;
      }

      const wrapper = editorWrapperRef.current;
      if (!wrapper) {
        return;
      }

      const persistedTop = editorScrollPositions.get(scrollPersistenceKey);
      if (typeof persistedTop === 'number') {
        wrapper.scrollTop = persistedTop;
      } else {
        wrapper.scrollTop = 0;
      }

      const handleScroll = () => {
        editorScrollPositions.set(scrollPersistenceKey, wrapper.scrollTop);
      };

      wrapper.addEventListener('scroll', handleScroll, { passive: true });
      return () => {
        editorScrollPositions.set(scrollPersistenceKey, wrapper.scrollTop);
        wrapper.removeEventListener('scroll', handleScroll);
      };
    }, [editor, scrollPersistenceKey]);

    useImperativeHandle(ref, () => ({
      hasSelection: () => {
        if (!editor) {
          return false;
        }

        return !editor.state.selection.empty;
      },
      getSelectionText: () => {
        if (!editor || editor.state.selection.empty) {
          return '';
        }

        const { from, to } = editor.state.selection;
        return editor.state.doc.textBetween(from, to, '\n\n');
      },
      getDocumentText: () => {
        if (!editor) {
          return '';
        }

        return editor.state.doc.textBetween(0, editor.state.doc.content.size, '\n\n');
      },
      insertText: (value: string) => {
        if (!editor) {
          return;
        }

        editor.chain().focus().insertContent(value).run();
      },
      insertSemanticReference: (reference: SemanticReferenceInsertPayload) => {
        if (!editor) {
          return;
        }

        editor
          .chain()
          .focus()
          .insertContent(buildSemanticReferenceHtml(reference))
          .run();
      },
      previewSelectionReplacement: (value: string) => {
        if (!editor) {
          return value;
        }

        if (editor.state.selection.empty) {
          return value;
        }

        const { from, to } = editor.state.selection;
        const before = editor.state.doc.textBetween(0, from, '\n\n').trim();
        const after = editor.state.doc.textBetween(to, editor.state.doc.content.size, '\n\n').trim();
        const replacement = value.trim();

        return [before, replacement, after].filter((part) => part.length > 0).join('\n\n');
      },
      replaceSelectionWithText: (value: string) => {
        if (!editor) {
          return;
        }

        const html = plainTextToHtml(value);
        if (editor.state.selection.empty) {
          editor.commands.setContent(html, { emitUpdate: true });
          return;
        }

        editor.chain().focus().insertContent(html).run();
      },
      replaceDocumentWithText: (value: string) => {
        if (!editor) {
          return;
        }

        editor.commands.setContent(plainTextToHtml(value), { emitUpdate: true });
      },
      getHTML: () => editor?.getHTML() ?? '',
      getJSON: () => editor?.getJSON() ?? null,
      canUndo: () => {
        if (!editor) {
          return false;
        }
        return editor.can().undo();
      },
      canRedo: () => {
        if (!editor) {
          return false;
        }
        return editor.can().redo();
      },
      undo: () => {
        editor?.chain().focus().undo().run();
      },
      redo: () => {
        editor?.chain().focus().redo().run();
      },
      focus: () => {
        editor?.chain().focus().run();
      },
    }), [editor]);

    return (
      <>
        <EditorContent
          ref={editorWrapperRef}
          editor={editor}
          className="tiptap-wrapper"
          style={{
            ['--editor-line-height' as string]: `${interiorFormat.lineHeight}`,
            ['--editor-indent' as string]: `${interiorFormat.paragraphIndentEm}em`,
          }}
        />
        {semanticSuggestion ? (
          <div
            className="semantic-ref-suggest-menu"
            style={{
              top: `${semanticSuggestion.position.top}px`,
              left: `${semanticSuggestion.position.left}px`,
            }}
            role="listbox"
            aria-label={
              semanticSuggestion.kind === 'character'
                ? 'Sugerencias de personaje'
                : 'Sugerencias de lugar'
            }
          >
            <p className="semantic-ref-suggest-title">
              {semanticSuggestion.kind === 'character' ? '@Personaje' : '#Lugar'}
              {semanticSuggestion.query.trim()
                ? ` · ${semanticSuggestion.query.trim()}`
                : ' · canon'}
            </p>
            <ul>
              {semanticSuggestion.entries.map((entry, index) => (
                <li key={`${entry.kind}-${entry.id}`}>
                  <button
                    type="button"
                    className={index === semanticSuggestion.selectedIndex ? 'is-active' : ''}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      applySemanticSuggestion(entry);
                    }}
                    title={entry.tooltip}
                    role="option"
                    aria-selected={index === semanticSuggestion.selectedIndex}
                  >
                    <strong>{entry.label}</strong>
                    {entry.aliases.length > 0 ? (
                      <small>{entry.aliases.slice(0, 2).join(', ')}</small>
                    ) : (
                      <small>{entry.kind === 'character' ? 'Personaje canonico' : 'Lugar canonico'}</small>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </>
    );
  },
);

TiptapEditorBase.displayName = 'TiptapEditor';

const TiptapEditor = memo(TiptapEditorBase);

TiptapEditor.displayName = 'TiptapEditor';

export default TiptapEditor;
