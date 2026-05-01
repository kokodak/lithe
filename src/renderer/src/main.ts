import type { EditorView } from '@codemirror/view';
import { startClock } from './app/clock';
import { createAppShell } from './app/shell';
import { loadDraft, saveDraft } from './app/draftStorage';
import { createEditor, warmCodeLanguages } from './editor/createEditor';
import './styles.css';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('App root was not found.');
}

const shell = createAppShell(app);
let saveTimer: number | undefined;

function scheduleSave(text: string): void {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => saveDraft(text), 160);
}

function updateCursorPosition(view: EditorView): void {
  const currentLine = view.state.doc.lineAt(view.state.selection.main.head).number;
  const totalLines = view.state.doc.lines;
  shell.cursorPosition.textContent = `Line ${currentLine} / ${totalLines}`;
}

const editorView = createEditor({
  parent: shell.editor,
  initialText: loadDraft(),
  onChange: scheduleSave,
  onCursorChange: updateCursorPosition
});

startClock(shell.currentTime);
warmCodeLanguages();
updateCursorPosition(editorView);
