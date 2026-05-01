import { EditorView } from '@codemirror/view';

export const handleBacktickInput = EditorView.inputHandler.of((view, from, to, text) => {
  if (text !== '`') return false;

  if (from !== to) {
    const selectedText = view.state.sliceDoc(from, to);

    view.dispatch({
      changes: { from, to, insert: `\`${selectedText}\`` },
      selection: { anchor: to + 2 }
    });

    return true;
  }

  const line = view.state.doc.lineAt(from);
  const textBeforeCursor = view.state.sliceDoc(line.from, from);

  if (from >= 2 && textBeforeCursor.endsWith('``') && textBeforeCursor.slice(0, -2).trim() === '') {
    const insert = '```\n\n```';
    const replaceFrom = from - 2;

    view.dispatch({
      changes: { from: replaceFrom, to, insert },
      selection: { anchor: replaceFrom + 4 }
    });

    return true;
  }

  if (view.state.sliceDoc(from, from + 1) === '`') {
    view.dispatch({ selection: { anchor: from + 1 } });
    return true;
  }

  const previousCharacter = from > line.from ? view.state.sliceDoc(from - 1, from) : '';
  const nextCharacter = from < line.to ? view.state.sliceDoc(from, from + 1) : '';
  const adjacentToExistingText = /\S/.test(previousCharacter) || /\S/.test(nextCharacter);

  if (adjacentToExistingText) {
    view.dispatch({
      changes: { from, to, insert: '`' },
      selection: { anchor: from + 1 }
    });
    return true;
  }

  view.dispatch({
    changes: { from, to, insert: '``' },
    selection: { anchor: from + 1 }
  });

  return true;
});
