import type { EditorView } from '@codemirror/view';
import { hiddenSyntax, liveCode, liveStrong } from './decorations';
import { inlineCodeRangeIsActive, syntaxRangeIsActive } from './selection';
import type { PendingDecoration } from './types';

export function addInlinePreviewDecorations(
  view: EditorView,
  pending: PendingDecoration[],
  lineFrom: number,
  lineText: string
): void {
  for (const match of lineText.matchAll(/(\*\*|__)(.+?)\1/g)) {
    const marker = match[1];
    const matchStart = match.index ?? 0;
    const contentStart = matchStart + marker.length;
    const contentEnd = matchStart + match[0].length - marker.length;
    const openingFrom = lineFrom + matchStart;
    const openingTo = lineFrom + contentStart;
    const closingFrom = lineFrom + contentEnd;
    const closingTo = lineFrom + matchStart + match[0].length;
    const activeStrong = syntaxRangeIsActive(view, openingFrom, closingTo);

    if (!activeStrong) {
      pending.push({ from: openingFrom, to: openingTo, decoration: hiddenSyntax });
    }

    pending.push({ from: lineFrom + contentStart, to: lineFrom + contentEnd, decoration: liveStrong });

    if (!activeStrong) {
      pending.push({ from: closingFrom, to: closingTo, decoration: hiddenSyntax });
    }
  }

  for (const match of lineText.matchAll(/`([^`]+?)`/g)) {
    const matchStart = match.index ?? 0;
    const contentStart = matchStart + 1;
    const contentEnd = matchStart + match[0].length - 1;
    const openingFrom = lineFrom + matchStart;
    const openingTo = lineFrom + contentStart;
    const closingFrom = lineFrom + contentEnd;
    const closingTo = lineFrom + matchStart + match[0].length;
    const activeInlineCode = inlineCodeRangeIsActive(view, openingFrom, closingTo);

    if (!activeInlineCode) {
      pending.push({ from: openingFrom, to: openingTo, decoration: hiddenSyntax });
    }

    if (activeInlineCode) {
      pending.push({ from: openingFrom, to: closingTo, decoration: liveCode });
    } else {
      pending.push({ from: lineFrom + contentStart, to: lineFrom + contentEnd, decoration: liveCode });
      pending.push({ from: closingFrom, to: closingTo, decoration: hiddenSyntax });
    }
  }
}

export function lineIsOnlyInlineCode(lineText: string): boolean {
  return /^`[^`]+`$/.test(lineText);
}
