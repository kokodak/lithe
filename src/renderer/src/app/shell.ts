export interface AppShell {
  editor: HTMLDivElement;
  currentTime: HTMLTimeElement;
  cursorPosition: HTMLElement;
}

export function createAppShell(root: HTMLDivElement): AppShell {
  root.innerHTML = `
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

  return { editor, currentTime, cursorPosition };
}
