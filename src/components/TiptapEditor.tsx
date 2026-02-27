import { forwardRef, useEffect, useImperativeHandle } from 'react';
import type { JSONContent } from '@tiptap/core';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';

import { plainTextToHtml } from '../lib/text';
import type { InteriorFormat } from '../types/book';

export interface TiptapEditorHandle {
  hasSelection: () => boolean;
  getSelectionText: () => string;
  getDocumentText: () => string;
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
  onChange: (payload: { html: string; json: JSONContent }) => void;
  onBlur?: () => void;
}

const TiptapEditor = forwardRef<TiptapEditorHandle, TiptapEditorProps>(
  ({ content, interiorFormat, onChange, onBlur }, ref) => {
    const editor = useEditor({
      extensions: [
        StarterKit,
        Placeholder.configure({
          placeholder: 'Escribe tu capitulo aqui...',
        }),
      ],
      content,
      autofocus: false,
      editorProps: {
        attributes: {
          class: 'editor-content',
        },
      },
      onUpdate: ({ editor: instance }) => {
        onChange({
          html: instance.getHTML(),
          json: instance.getJSON(),
        });
      },
      onBlur: () => {
        onBlur?.();
      },
    });

    useEffect(() => {
      if (!editor) {
        return;
      }

      const current = editor.getHTML();
      if (content !== current) {
        // Preservar la posicion del cursor antes de actualizar
        const { from, to } = editor.state.selection;
        editor.commands.setContent(content, { emitUpdate: false });
        
        // Restaurar la seleccion si el editor tenia el foco
        if (editor.isFocused) {
          try {
            const docSize = editor.state.doc.content.size;
            editor.commands.setTextSelection({ from: Math.min(from, docSize), to: Math.min(to, docSize) });
          } catch {
            // Ignorar errores de rango si el contenido cambio drasticamente
          }
        }
      }
    }, [content, editor]);

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
      <EditorContent
        editor={editor}
        className="tiptap-wrapper"
        style={{
          ['--editor-line-height' as string]: `${interiorFormat.lineHeight}`,
          ['--editor-indent' as string]: `${interiorFormat.paragraphIndentEm}em`,
        }}
      />
    );
  },
);

TiptapEditor.displayName = 'TiptapEditor';

export default TiptapEditor;
