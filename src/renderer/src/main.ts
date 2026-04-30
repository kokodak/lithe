import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { EditorState, RangeSetBuilder, type Text } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, keymap, ViewPlugin, type ViewUpdate, WidgetType } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';
import './styles.css';

const defaultText = `# Welcome to Lithe

Start with plain Markdown. Stay local. Add power only when you ask for it.

- Fast, quiet editing
- Portable text
- Future plugin hooks
`;

const storageKey = 'lithe:draft';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('App root was not found.');
}

app.innerHTML = `
  <main class="shell">
    <section class="workspace" aria-label="Editor">
      <header class="toolbar">
        <time id="current-time" dateTime=""></time>
        <span id="cursor-position" class="cursor-position"></span>
      </header>

      <div class="editor-layout">
        <div id="editor" aria-label="Markdown editor"></div>
      </div>
    </section>
  </main>
`;

const editor = document.querySelector<HTMLDivElement>('#editor');
const currentTime = document.querySelector<HTMLTimeElement>('#current-time');
const cursorPosition = document.querySelector<HTMLElement>('#cursor-position');

if (!editor || !currentTime || !cursorPosition) {
  throw new Error('Editor controls were not found.');
}

const editorControl = editor;
const currentTimeLabel = currentTime;
const cursorPositionLabel = cursorPosition;
let saveTimer: number | undefined;
let editorView: EditorView;

class BulletWidget extends WidgetType {
  toDOM(): HTMLElement {
    const bullet = document.createElement('span');
    bullet.className = 'cm-live-bullet';
    bullet.textContent = '•';
    return bullet;
  }
}

class CheckboxWidget extends WidgetType {
  constructor(
    private readonly checked: boolean,
    private readonly checkPosition: number
  ) {
    super();
  }

  eq(other: CheckboxWidget): boolean {
    return other.checked === this.checked && other.checkPosition === this.checkPosition;
  }

  toDOM(view: EditorView): HTMLElement {
    const checkbox = document.createElement('span');
    checkbox.className = `cm-live-checkbox${this.checked ? ' is-checked' : ''}`;
    checkbox.setAttribute('aria-label', this.checked ? 'Mark task incomplete' : 'Mark task complete');
    checkbox.setAttribute('role', 'checkbox');
    checkbox.setAttribute('aria-checked', String(this.checked));
    checkbox.tabIndex = 0;
    checkbox.textContent = this.checked ? '✓' : '';

    const toggle = (event: Event): void => {
      event.preventDefault();
      event.stopPropagation();

      view.dispatch({
        changes: {
          from: this.checkPosition,
          to: this.checkPosition + 1,
          insert: this.checked ? ' ' : 'x'
        }
      });
      view.focus();
    };

    checkbox.addEventListener('mousedown', (event) => {
      event.preventDefault();
    });
    checkbox.addEventListener('click', toggle);
    checkbox.addEventListener('keydown', (event) => {
      if (event.key === ' ' || event.key === 'Enter') {
        toggle(event);
      }
    });

    return checkbox;
  }
}

class CodeLanguageWidget extends WidgetType {
  constructor(private readonly language: string) {
    super();
  }

  eq(other: CodeLanguageWidget): boolean {
    return other.language === this.language;
  }

  toDOM(): HTMLElement {
    const label = document.createElement('span');
    label.className = 'cm-live-code-language';
    label.textContent = this.language;
    return label;
  }
}

const hiddenSyntax = Decoration.mark({ class: 'cm-markdown-syntax-hidden' });
const liveStrong = Decoration.mark({ class: 'cm-live-strong' });
const liveCode = Decoration.mark({ class: 'cm-live-code' });
const liveCheckedTask = Decoration.mark({ class: 'cm-live-task-checked' });
const bulletWidget = Decoration.widget({ widget: new BulletWidget(), side: 1 });
const fencedCodeLine = Decoration.line({ class: 'cm-live-codeblock' });
const fencedCodeFirstLine = Decoration.line({ class: 'cm-live-codeblock cm-live-codeblock-first' });
const fencedCodeLastLine = Decoration.line({ class: 'cm-live-codeblock cm-live-codeblock-last' });
const fencedCodeSingleLine = Decoration.line({ class: 'cm-live-codeblock cm-live-codeblock-first cm-live-codeblock-last' });

const headingClasses = [
  'cm-live-heading-1',
  'cm-live-heading-2',
  'cm-live-heading-3',
  'cm-live-heading-4',
  'cm-live-heading-5',
  'cm-live-heading-6'
];

const litheHighlightStyle = HighlightStyle.define([
  { tag: t.keyword, color: '#8f3f71' },
  { tag: [t.name, t.deleted, t.character, t.macroName], color: '#2f5f62' },
  { tag: [t.propertyName, t.variableName], color: '#245f9f' },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.labelName], color: '#7b4f18' },
  { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: '#9a4b33' },
  { tag: [t.definition(t.name), t.separator], color: '#25211b' },
  { tag: [t.typeName, t.className, t.number, t.changed, t.annotation, t.modifier, t.self, t.namespace], color: '#6f4aa3' },
  { tag: [t.operator, t.operatorKeyword], color: '#4e6b6c' },
  { tag: [t.url, t.escape, t.regexp, t.link], color: '#186a75' },
  { tag: [t.meta, t.comment], color: '#7b756b', fontStyle: 'italic' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: t.link, textDecoration: 'underline' },
  { tag: t.heading, fontWeight: '700' },
  { tag: [t.atom, t.bool, t.special(t.variableName)], color: '#a04f16' },
  { tag: [t.processingInstruction, t.string, t.inserted], color: '#4f6f25' },
  { tag: t.invalid, color: '#b3261e' }
]);

interface PendingDecoration {
  from: number;
  to: number;
  decoration: Decoration;
}

interface FencedCodeBlock {
  startLine: number;
  endLine: number;
  marker: string;
  language: string;
}

function getFenceInfo(lineText: string): { marker: string; language: string } | null {
  const match = /^\s*(```+|~~~+)\s*([A-Za-z0-9_+.-]*)?/.exec(lineText);
  if (!match) return null;

  return {
    marker: match[1],
    language: match[2] || 'plain text'
  };
}

function collectFencedCodeBlocks(doc: Text): FencedCodeBlock[] {
  const blocks: FencedCodeBlock[] = [];
  let openBlock: FencedCodeBlock | null = null;

  for (let lineNumber = 1; lineNumber <= doc.lines; lineNumber += 1) {
    const line = doc.line(lineNumber);
    const fence = getFenceInfo(line.text);

    if (fence) {
      if (!openBlock) {
        openBlock = {
          startLine: line.number,
          endLine: doc.lines,
          marker: fence.marker,
          language: fence.language
        };
      } else if (fence.marker[0] === openBlock.marker[0] && fence.marker.length >= openBlock.marker.length) {
        blocks.push({ ...openBlock, endLine: line.number });
        openBlock = null;
      }
    }
  }

  return blocks;
}

function getFencedCodeBlockForLine(blocks: FencedCodeBlock[], lineNumber: number): FencedCodeBlock | null {
  return blocks.find((block) => lineNumber >= block.startLine && lineNumber <= block.endLine) ?? null;
}

function lineIsInsideFencedCodeBlock(block: FencedCodeBlock, lineNumber: number): boolean {
  return lineNumber >= block.startLine && lineNumber <= block.endLine;
}

function isActiveFencedCodeBlock(view: EditorView, block: FencedCodeBlock, hoverLine: number | null): boolean {
  if (hoverLine !== null && lineIsInsideFencedCodeBlock(block, hoverLine)) {
    return true;
  }

  return view.state.selection.ranges.some((range) => {
    const fromLine = view.state.doc.lineAt(range.from).number;
    const toLine = view.state.doc.lineAt(range.to).number;

    return fromLine <= block.endLine && toLine >= block.startLine;
  });
}

function getFencedCodeLineDecoration(block: FencedCodeBlock, lineNumber: number): Decoration {
  if (block.startLine === block.endLine) return fencedCodeSingleLine;
  if (lineNumber === block.startLine) return fencedCodeFirstLine;
  if (lineNumber === block.endLine) return fencedCodeLastLine;
  return fencedCodeLine;
}

function getPreviewCodeLineDecoration(block: FencedCodeBlock, lineNumber: number): Decoration {
  const firstCodeLine = block.startLine + 1;
  const lastCodeLine = block.endLine - 1;

  if (lineNumber === firstCodeLine && lineNumber === lastCodeLine) return fencedCodeSingleLine;
  if (lineNumber === firstCodeLine) return fencedCodeFirstLine;
  if (lineNumber === lastCodeLine) return fencedCodeLastLine;
  return fencedCodeLine;
}

function lineIntersectsSelection(view: EditorView, lineFrom: number, lineTo: number): boolean {
  return view.state.selection.ranges.some((range) => {
    const selectionFrom = Math.min(range.from, range.to);
    const selectionTo = Math.max(range.from, range.to);

    if (range.empty) {
      return range.head >= lineFrom && range.head <= lineTo;
    }

    return selectionFrom <= lineTo && selectionTo >= lineFrom;
  });
}

function addInlinePreviewDecorations(pending: PendingDecoration[], lineFrom: number, lineText: string): void {
  for (const match of lineText.matchAll(/(\*\*|__)(.+?)\1/g)) {
    const marker = match[1];
    const matchStart = match.index ?? 0;
    const contentStart = matchStart + marker.length;
    const contentEnd = matchStart + match[0].length - marker.length;

    pending.push({ from: lineFrom + matchStart, to: lineFrom + contentStart, decoration: hiddenSyntax });
    pending.push({ from: lineFrom + contentStart, to: lineFrom + contentEnd, decoration: liveStrong });
    pending.push({
      from: lineFrom + contentEnd,
      to: lineFrom + matchStart + match[0].length,
      decoration: hiddenSyntax
    });
  }

  for (const match of lineText.matchAll(/`([^`]+?)`/g)) {
    const matchStart = match.index ?? 0;
    const contentStart = matchStart + 1;
    const contentEnd = matchStart + match[0].length - 1;

    pending.push({ from: lineFrom + matchStart, to: lineFrom + contentStart, decoration: hiddenSyntax });
    pending.push({ from: lineFrom + contentStart, to: lineFrom + contentEnd, decoration: liveCode });
    pending.push({
      from: lineFrom + contentEnd,
      to: lineFrom + matchStart + match[0].length,
      decoration: hiddenSyntax
    });
  }
}

function buildLivePreviewDecorations(view: EditorView, hoverLine: number | null): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const pending: PendingDecoration[] = [];
  const codeBlocks = collectFencedCodeBlocks(view.state.doc);

  for (const range of view.visibleRanges) {
    for (let pos = range.from; pos <= range.to;) {
      const line = view.state.doc.lineAt(pos);
      const lineText = line.text;
      const isInteractive = line.number === hoverLine || lineIntersectsSelection(view, line.from, line.to);
      const codeBlock = getFencedCodeBlockForLine(codeBlocks, line.number);
      const headingMatch = /^(#{1,6})\s+/.exec(lineText);
      const taskMatch = /^(\s*)([-*+])\s+\[([ xX])\]\s+/.exec(lineText);
      const listMatch = /^(\s*)([-*+])\s+/.exec(lineText);
      const blockquoteMatch = /^(\s*)>\s?/.exec(lineText);

      if (codeBlock) {
        const activeCodeBlock = isActiveFencedCodeBlock(view, codeBlock, hoverLine);
        const fenceLine = line.number === codeBlock.startLine || line.number === codeBlock.endLine;

        if (activeCodeBlock || !fenceLine) {
          const lineDecoration = activeCodeBlock
            ? getFencedCodeLineDecoration(codeBlock, line.number)
            : getPreviewCodeLineDecoration(codeBlock, line.number);

          pending.push({ from: line.from, to: line.from, decoration: lineDecoration });
        }

        if (!activeCodeBlock && fenceLine) {
          pending.push({ from: line.from, to: line.to, decoration: hiddenSyntax });
        }

        if (line.number === (activeCodeBlock ? codeBlock.startLine : codeBlock.startLine + 1)) {
          pending.push({
            from: line.from,
            to: line.from,
            decoration: Decoration.widget({
              widget: new CodeLanguageWidget(codeBlock.language),
              side: 1
            })
          });
        }

        pos = line.to + 1;
        continue;
      }

      if (headingMatch) {
        const headingLevel = Math.min(headingMatch[1].length, headingClasses.length);
        pending.push({
          from: line.from,
          to: line.from,
          decoration: Decoration.line({ class: headingClasses[headingLevel - 1] })
        });

        if (!isInteractive) {
          pending.push({ from: line.from, to: line.from + headingMatch[0].length, decoration: hiddenSyntax });
        }
      }

      if (taskMatch) {
        const markerStart = line.from + taskMatch[1].length;
        const taskEnd = line.from + taskMatch[0].length;
        const checkPosition = markerStart + taskMatch[2].length + 2;
        const isChecked = taskMatch[3].toLowerCase() === 'x';

        pending.push({
          from: taskEnd,
          to: taskEnd,
          decoration: Decoration.widget({
            widget: new CheckboxWidget(isChecked, checkPosition),
            side: 1
          })
        });
        pending.push({ from: markerStart, to: taskEnd, decoration: hiddenSyntax });

        if (isChecked) {
          pending.push({ from: taskEnd, to: line.to, decoration: liveCheckedTask });
        }
      } else if (listMatch) {
        const markerStart = line.from + listMatch[1].length;
        pending.push({ from: markerStart, to: line.from + listMatch[0].length, decoration: hiddenSyntax });
        pending.push({ from: line.from + listMatch[0].length, to: line.from + listMatch[0].length, decoration: bulletWidget });
      }

      if (blockquoteMatch) {
        pending.push({
          from: line.from,
          to: line.from,
          decoration: Decoration.line({ class: 'cm-live-blockquote' })
        });

        if (!isInteractive) {
          const markerStart = line.from + blockquoteMatch[1].length;
          pending.push({ from: markerStart, to: line.from + blockquoteMatch[0].length, decoration: hiddenSyntax });
        }
      }

      if (!isInteractive) {
        addInlinePreviewDecorations(pending, line.from, lineText);
      }

      pos = line.to + 1;
    }
  }

  pending
    .sort((a, b) => a.from - b.from || a.to - b.to)
    .forEach((item) => {
      builder.add(item.from, item.to, item.decoration);
    });

  return builder.finish();
}

const liveMarkdownPreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    hoverLine: number | null = null;

    constructor(view: EditorView) {
      this.decorations = buildLivePreviewDecorations(view, this.hoverLine);
    }

    update(update: ViewUpdate): void {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = buildLivePreviewDecorations(update.view, this.hoverLine);
        update.view.requestMeasure();
      }
    }

    setHoverLine(view: EditorView, lineNumber: number | null): void {
      if (this.hoverLine === lineNumber) return;
      this.hoverLine = lineNumber;
      this.decorations = buildLivePreviewDecorations(view, this.hoverLine);
      view.requestMeasure();
    }
  },
  {
    decorations: (plugin) => plugin.decorations,
    eventHandlers: {
      mousemove(event, view) {
        const plugin = view.plugin(liveMarkdownPreview);
        if (!plugin) return;

        const position = view.posAtCoords({ x: event.clientX, y: event.clientY });
        plugin.setHoverLine(view, position === null ? null : view.state.doc.lineAt(position).number);
      },
      mouseleave(_, view) {
        view.plugin(liveMarkdownPreview)?.setHoverLine(view, null);
      }
    }
  }
);

function getEditorText(): string {
  return editorView.state.doc.toString();
}

function saveDraft(): void {
  localStorage.setItem(storageKey, getEditorText());
}

function scheduleSave(): void {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(saveDraft, 160);
}

function warmCodeLanguages(): void {
  const loadLanguages = (): void => {
    void Promise.allSettled(languages.map((language) => language.load()));
  };

  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(loadLanguages, { timeout: 2000 });
    return;
  }

  globalThis.setTimeout(loadLanguages, 400);
}

function updateCurrentTime(): void {
  const now = new Date();
  currentTimeLabel.dateTime = now.toISOString();
  currentTimeLabel.textContent = new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit'
  }).format(now);
}

function updateCursorPosition(view: EditorView): void {
  const currentLine = view.state.doc.lineAt(view.state.selection.main.head).number;
  const totalLines = view.state.doc.lines;
  cursorPositionLabel.textContent = `Line ${currentLine} / ${totalLines}`;
}

const completeCodeFence = EditorView.inputHandler.of((view, from, to, text) => {
  if (text !== '`' || from !== to || from < 2) return false;

  const line = view.state.doc.lineAt(from);
  const textBeforeCursor = view.state.sliceDoc(line.from, from);

  if (!textBeforeCursor.endsWith('``') || textBeforeCursor.slice(0, -2).trim() !== '') {
    return false;
  }

  const insert = '```\n\n```';
  const replaceFrom = from - 2;

  view.dispatch({
    changes: { from: replaceFrom, to, insert },
    selection: { anchor: replaceFrom + 4 }
  });

  return true;
});

function continueListItem(view: EditorView): boolean {
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

const initialText = localStorage.getItem(storageKey) ?? defaultText;

editorView = new EditorView({
  parent: editorControl,
  state: EditorState.create({
    doc: initialText,
    extensions: [
      history(),
      markdown({ codeLanguages: languages }),
      syntaxHighlighting(litheHighlightStyle, { fallback: true }),
      completeCodeFence,
      liveMarkdownPreview,
      EditorView.lineWrapping,
      keymap.of([{ key: 'Enter', run: continueListItem }, ...defaultKeymap, ...historyKeymap]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          scheduleSave();
        }

        if (update.docChanged || update.selectionSet) {
          updateCursorPosition(update.view);
        }
      })
    ]
  })
});

warmCodeLanguages();
updateCurrentTime();
updateCursorPosition(editorView);
window.setInterval(updateCurrentTime, 1000);
