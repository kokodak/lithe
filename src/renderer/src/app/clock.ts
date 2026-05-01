export function updateCurrentTime(label: HTMLTimeElement): void {
  const now = new Date();
  label.dateTime = now.toISOString();
  label.textContent = new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit'
  }).format(now);
}

export function startClock(label: HTMLTimeElement): number {
  updateCurrentTime(label);
  return window.setInterval(() => updateCurrentTime(label), 1000);
}
