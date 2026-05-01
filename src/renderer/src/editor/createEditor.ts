import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { syntaxHighlighting } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { litheHighlightStyle } from './highlighting';
import { handleBacktickInput, handlePairedSymbolInput } from './inputHandlers';
import { continueListItem, stableVerticalMovement } from './keymaps';
import { liveMarkdownPreview } from '../markdown/livePreview';

interface CreateEditorOptions {
  parent: HTMLElement;
  initialText: string;
  onChange: (text: string) => void;
  onCursorChange: (view: EditorView) => void;
}

export function createEditor(options: CreateEditorOptions): EditorView {
  return new EditorView({
    parent: options.parent,
    state: EditorState.create({
      doc: options.initialText,
      extensions: [
        history(),
        markdown({ codeLanguages: languages }),
        syntaxHighlighting(litheHighlightStyle, { fallback: true }),
        handleBacktickInput,
        handlePairedSymbolInput,
        liveMarkdownPreview,
        EditorView.lineWrapping,
        stableVerticalMovement,
        keymap.of([{ key: 'Enter', run: continueListItem }, ...defaultKeymap, ...historyKeymap]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            options.onChange(update.view.state.doc.toString());
          }

          if (update.docChanged || update.selectionSet) {
            options.onCursorChange(update.view);
          }
        })
      ]
    })
  });
}

export function warmCodeLanguages(): void {
  const loadLanguages = (): void => {
    void Promise.allSettled(languages.map((language) => language.load()));
  };

  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(loadLanguages, { timeout: 2000 });
    return;
  }

  globalThis.setTimeout(loadLanguages, 400);
}
