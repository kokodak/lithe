const storageKey = 'lithe:draft';

export const defaultText = `# Welcome to Lithe

Start with plain Markdown. Stay local. Add power only when you ask for it.

- Fast, quiet editing
- Portable text
- Future plugin hooks
`;

export function loadDraft(): string {
  return localStorage.getItem(storageKey) ?? defaultText;
}

export function saveDraft(text: string): void {
  localStorage.setItem(storageKey, text);
}
