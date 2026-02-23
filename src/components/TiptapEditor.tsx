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
  replaceSelectionWithText: (value: string) => void;
  replaceDocumentWithText: (value: string) => void;
  getHTML: () => string;
  getJSON: () => JSONContent | null;
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
        editor.commands.setContent(content, { emitUpdate: false });
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
