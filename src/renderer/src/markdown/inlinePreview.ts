import { Decoration, type EditorView } from '@codemirror/view';
import { hiddenSyntax, liveCode, liveEmphasis, liveStrikethrough, liveStrong } from './decorations';
import { inlineCodeRangeIsActive, syntaxRangeIsActive } from './selection';
import type { PendingDecoration } from './types';
import { ImageWidget, LinkWidget } from './widgets';

interface InlineSyntaxRange {
  from: number;
  to: number;
}

function rangeTouchesSelection(view: EditorView, from: number, to: number): boolean {
  return view.state.selection.ranges.some((range) => {
    const selectionFrom = Math.min(range.from, range.to);
    const selectionTo = Math.max(range.from, range.to);

    if (range.empty) {
      return range.head >= from && range.head <= to;
    }

    return selectionFrom < to && selectionTo > from;
  });
}

function rangesConnect(first: InlineSyntaxRange, second: InlineSyntaxRange): boolean {
  return first.from <= second.to && second.from <= first.to;
}

function getActiveInlineRanges(view: EditorView, ranges: InlineSyntaxRange[]): InlineSyntaxRange[] {
  const activeRanges = ranges.filter((range) => rangeTouchesSelection(view, range.from, range.to));
  let changed = true;

  while (changed) {
    changed = false;

    for (const range of ranges) {
      if (activeRanges.includes(range)) continue;

      if (activeRanges.some((activeRange) => rangesConnect(activeRange, range))) {
        activeRanges.push(range);
        changed = true;
      }
    }
  }

  return activeRanges;
}

function rangeIsActive(range: InlineSyntaxRange, activeRanges: InlineSyntaxRange[]): boolean {
  return activeRanges.includes(range);
}

export function addInlinePreviewDecorations(
  view: EditorView,
  pending: PendingDecoration[],
  lineFrom: number,
  lineText: string
): void {
  const syntaxRanges: InlineSyntaxRange[] = [];

  for (const match of lineText.matchAll(/(\*\*|__)(.+?)\1/g)) {
    const matchStart = match.index ?? 0;
    syntaxRanges.push({ from: lineFrom + matchStart, to: lineFrom + matchStart + match[0].length });
  }

  for (const match of lineText.matchAll(/`([^`]+?)`/g)) {
    const matchStart = match.index ?? 0;
    syntaxRanges.push({ from: lineFrom + matchStart, to: lineFrom + matchStart + match[0].length });
  }

  for (const match of lineText.matchAll(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    const matchStart = match.index ?? 0;
    syntaxRanges.push({ from: lineFrom + matchStart, to: lineFrom + matchStart + match[0].length });
  }

  for (const match of lineText.matchAll(/~~(.+?)~~/g)) {
    const matchStart = match.index ?? 0;
    syntaxRanges.push({ from: lineFrom + matchStart, to: lineFrom + matchStart + match[0].length });
  }

  for (const match of lineText.matchAll(/(^|[^\*])\*([^\s*][^*]*?[^\s*]|\S)\*(?!\*)/g)) {
    const prefix = match[1];
    const matchStart = (match.index ?? 0) + prefix.length;
    syntaxRanges.push({ from: lineFrom + matchStart, to: lineFrom + matchStart + match[0].length - prefix.length });
  }

  for (const match of lineText.matchAll(/(^|[^_])_([^\s_][^_]*?[^\s_]|\S)_(?!_)/g)) {
    const prefix = match[1];
    const matchStart = (match.index ?? 0) + prefix.length;
    syntaxRanges.push({ from: lineFrom + matchStart, to: lineFrom + matchStart + match[0].length - prefix.length });
  }

  for (const match of lineText.matchAll(/(^|[^!])\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    const prefix = match[1];
    const matchStart = (match.index ?? 0) + prefix.length;
    syntaxRanges.push({ from: lineFrom + matchStart, to: lineFrom + matchStart + match[0].length - prefix.length });
  }

  const activeRanges = getActiveInlineRanges(view, syntaxRanges);

  for (const match of lineText.matchAll(/(\*\*|__)(.+?)\1/g)) {
    const marker = match[1];
    const matchStart = match.index ?? 0;
    const contentStart = matchStart + marker.length;
    const contentEnd = matchStart + match[0].length - marker.length;
    const openingFrom = lineFrom + matchStart;
    const openingTo = lineFrom + contentStart;
    const closingFrom = lineFrom + contentEnd;
    const closingTo = lineFrom + matchStart + match[0].length;
    const strongRange = syntaxRanges.find((range) => range.from === openingFrom && range.to === closingTo);
    const activeStrong = strongRange ? rangeIsActive(strongRange, activeRanges) : syntaxRangeIsActive(view, openingFrom, closingTo);

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
    const inlineCodeRange = syntaxRanges.find((range) => range.from === openingFrom && range.to === closingTo);
    const activeInlineCode = inlineCodeRange
      ? rangeIsActive(inlineCodeRange, activeRanges)
      : inlineCodeRangeIsActive(view, openingFrom, closingTo);

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

  for (const match of lineText.matchAll(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    const matchStart = match.index ?? 0;
    const matchEnd = matchStart + match[0].length;
    const imageRange = syntaxRanges.find((range) => range.from === lineFrom + matchStart && range.to === lineFrom + matchEnd);
    const activeImage = imageRange
      ? rangeIsActive(imageRange, activeRanges)
      : syntaxRangeIsActive(view, lineFrom + matchStart, lineFrom + matchEnd);

    if (!activeImage) {
      pending.push({
        from: lineFrom + matchStart,
        to: lineFrom + matchEnd,
        decoration: Decoration.replace({
          widget: new ImageWidget(match[2], match[1] || 'Markdown image')
        })
      });
    }
  }

  for (const match of lineText.matchAll(/~~(.+?)~~/g)) {
    const matchStart = match.index ?? 0;
    const contentStart = matchStart + 2;
    const contentEnd = matchStart + match[0].length - 2;
    const openingFrom = lineFrom + matchStart;
    const openingTo = lineFrom + contentStart;
    const closingFrom = lineFrom + contentEnd;
    const closingTo = lineFrom + matchStart + match[0].length;
    const strikeRange = syntaxRanges.find((range) => range.from === openingFrom && range.to === closingTo);
    const activeStrike = strikeRange ? rangeIsActive(strikeRange, activeRanges) : syntaxRangeIsActive(view, openingFrom, closingTo);

    if (!activeStrike) {
      pending.push({ from: openingFrom, to: openingTo, decoration: hiddenSyntax });
    }

    pending.push({ from: lineFrom + contentStart, to: lineFrom + contentEnd, decoration: liveStrikethrough });

    if (!activeStrike) {
      pending.push({ from: closingFrom, to: closingTo, decoration: hiddenSyntax });
    }
  }

  for (const match of lineText.matchAll(/(^|[^\*])\*([^\s*][^*]*?[^\s*]|\S)\*(?!\*)/g)) {
    const prefix = match[1];
    const matchStart = (match.index ?? 0) + prefix.length;
    const contentStart = matchStart + 1;
    const contentEnd = matchStart + match[0].length - prefix.length - 1;
    const openingFrom = lineFrom + matchStart;
    const openingTo = lineFrom + contentStart;
    const closingFrom = lineFrom + contentEnd;
    const closingTo = lineFrom + matchStart + match[0].length - prefix.length;
    const emphasisRange = syntaxRanges.find((range) => range.from === openingFrom && range.to === closingTo);
    const activeEmphasis = emphasisRange
      ? rangeIsActive(emphasisRange, activeRanges)
      : syntaxRangeIsActive(view, openingFrom, closingTo);

    if (!activeEmphasis) {
      pending.push({ from: openingFrom, to: openingTo, decoration: hiddenSyntax });
    }

    pending.push({ from: lineFrom + contentStart, to: lineFrom + contentEnd, decoration: liveEmphasis });

    if (!activeEmphasis) {
      pending.push({ from: closingFrom, to: closingTo, decoration: hiddenSyntax });
    }
  }

  for (const match of lineText.matchAll(/(^|[^_])_([^\s_][^_]*?[^\s_]|\S)_(?!_)/g)) {
    const prefix = match[1];
    const matchStart = (match.index ?? 0) + prefix.length;
    const contentStart = matchStart + 1;
    const contentEnd = matchStart + match[0].length - prefix.length - 1;
    const openingFrom = lineFrom + matchStart;
    const openingTo = lineFrom + contentStart;
    const closingFrom = lineFrom + contentEnd;
    const closingTo = lineFrom + matchStart + match[0].length - prefix.length;
    const emphasisRange = syntaxRanges.find((range) => range.from === openingFrom && range.to === closingTo);
    const activeEmphasis = emphasisRange
      ? rangeIsActive(emphasisRange, activeRanges)
      : syntaxRangeIsActive(view, openingFrom, closingTo);

    if (!activeEmphasis) {
      pending.push({ from: openingFrom, to: openingTo, decoration: hiddenSyntax });
    }

    pending.push({ from: lineFrom + contentStart, to: lineFrom + contentEnd, decoration: liveEmphasis });

    if (!activeEmphasis) {
      pending.push({ from: closingFrom, to: closingTo, decoration: hiddenSyntax });
    }
  }

  for (const match of lineText.matchAll(/(^|[^!])\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    const prefix = match[1];
    const matchStart = (match.index ?? 0) + prefix.length;
    const suffixEnd = matchStart + match[0].length - prefix.length;
    const linkRange = syntaxRanges.find((range) => range.from === lineFrom + matchStart && range.to === lineFrom + suffixEnd);
    const activeLink = linkRange
      ? rangeIsActive(linkRange, activeRanges)
      : syntaxRangeIsActive(view, lineFrom + matchStart, lineFrom + suffixEnd);

    if (!activeLink) {
      pending.push({
        from: lineFrom + matchStart,
        to: lineFrom + suffixEnd,
        decoration: Decoration.replace({
          widget: new LinkWidget(match[2], match[3])
        })
      });
    }
  }
}

export function lineIsOnlyInlineCode(lineText: string): boolean {
  return /^`[^`]+`$/.test(lineText);
}
