/* Small helpers used across the application screens. */

export function nanoid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Review helpers ─────────────────────────────────────────────────────────────
