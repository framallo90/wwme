import { forwardRef } from 'react';
import type { JSONContent } from '@tiptap/core';

import type { ChapterDocument, InteriorFormat } from '../types/book';
import TiptapEditor, { type TiptapEditorHandle } from './TiptapEditor';

interface EditorPaneProps {
  chapter: ChapterDocument | null;
  interiorFormat: InteriorFormat;
  autosaveIntervalMs: number;
  onContentChange: (payload: { html: string; json: JSONContent }) => void;
  onBlur: () => void;
}

const EditorPane = forwardRef<TiptapEditorHandle, EditorPaneProps>((props, ref) => {
  if (!props.chapter) {
    return (
      <section className="editor-pane empty-state">
        <h2>Editor</h2>
        <p>Abri o crea un libro para empezar.</p>
      </section>
    );
  }

  return (
    <section className="editor-pane">
      <header className="editor-header">
        <div>
          <h2>{props.chapter.title}</h2>
          <p>ID {props.chapter.id}</p>
        </div>
        <span>Auto-guardado {Math.round(props.autosaveIntervalMs / 1000)}s</span>
      </header>

      <TiptapEditor
        ref={ref}
        content={props.chapter.content}
        interiorFormat={props.interiorFormat}
        onChange={props.onContentChange}
        onBlur={props.onBlur}
      />
    </section>
  );
});

EditorPane.displayName = 'EditorPane';

export default EditorPane;
