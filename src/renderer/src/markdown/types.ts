import type { Decoration } from '@codemirror/view';

export interface PendingDecoration {
  from: number;
  to: number;
  decoration: Decoration;
}

export interface FencedCodeBlock {
  startLine: number;
  endLine: number;
  marker: string;
  language: string;
}
