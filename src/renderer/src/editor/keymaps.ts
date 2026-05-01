import { EditorView, keymap } from '@codemirror/view';

export function continueListItem(view: EditorView): boolean {
  const selection = view.state.selection.main;
  if (!selection.empty) return false;

  const line = view.state.doc.lineAt(selection.head);
  const textBeforeCursor = view.state.sliceDoc(line.from, selection.head);
  const taskMatch = /^(\s*)([-*+])\s+\[([ xX])\]\s*(.*)$/.exec(textBeforeCursor);
  const bulletMatch = /^(\s*)([-*+])\s+(.*)$/.exec(textBeforeCursor);

  if (taskMatch) {
    const [, indent, marker, , content] = taskMatch;

    if (content.trim() === '') {
      view.dispatch({
        changes: { from: line.from, to: selection.head, insert: indent },
        selection: { anchor: line.from + indent.length }
      });
      return true;
    }

    const insert = `\n${indent}${marker} [ ] `;
    view.dispatch({
      changes: { from: selection.head, insert },
      selection: { anchor: selection.head + insert.length }
    });
    return true;
  }

  if (bulletMatch) {
    const [, indent, marker, content] = bulletMatch;

    if (content.trim() === '') {
      view.dispatch({
        changes: { from: line.from, to: selection.head, insert: indent },
        selection: { anchor: line.from + indent.length }
      });
      return true;
    }

    const insert = `\n${indent}${marker} `;
    view.dispatch({
      changes: { from: selection.head, insert },
      selection: { anchor: selection.head + insert.length }
    });
    return true;
  }

  return false;
}

function moveCursorByDocumentLine(view: EditorView, direction: -1 | 1): boolean {
  const selection = view.state.selection.main;
  if (!selection.empty) return false;

  const line = view.state.doc.lineAt(selection.head);
  const targetLineNumber = line.number + direction;

  if (targetLineNumber < 1 || targetLineNumber > view.state.doc.lines) {
    return false;
  }

  const column = selection.head - line.from;
  const targetLine = view.state.doc.line(targetLineNumber);
  const anchor = targetLine.from + Math.min(column, targetLine.length);

  view.dispatch({
    selection: { anchor },
    scrollIntoView: true
  });

  return true;
}

export const stableVerticalMovement = keymap.of([
  { key: 'ArrowUp', run: (view) => moveCursorByDocumentLine(view, -1) },
  { key: 'ArrowDown', run: (view) => moveCursorByDocumentLine(view, 1) }
]);
