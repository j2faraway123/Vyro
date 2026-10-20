export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const s = Math.floor(seconds % 60);
  const m = Math.floor((seconds / 60) % 60);
  const h = Math.floor(seconds / 3600);
  const ss = s.toString().padStart(2, "0");
  return h > 0 ? `${h}:${m.toString().padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

export function formatDuration(seconds: number): string {
  const total = Math.round(seconds / 60);
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

export function plural(n: number, word: string, pluralWord = `${word}s`): string {
  return `${n.toLocaleString()} ${n === 1 ? word : pluralWord}`;
}

export function relativeTime(unixSeconds: number, now = Date.now() / 1000): string {
  const d = now - unixSeconds;
  if (d < 60) return "just now";
  if (d < 3600) return `${Math.floor(d / 60)} min ago`;
  if (d < 86400) return `${Math.floor(d / 3600)} hr ago`;
  if (d < 86400 * 2) return "yesterday";
  if (d < 86400 * 7) return `${Math.floor(d / 86400)} days ago`;
  return new Date(unixSeconds * 1000).toLocaleDateString();
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function greeting(date = new Date()): string {
  const h = date.getHours();
  if (h < 5) return "Up late";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

/** Lower-cases and strips diacritics so "Beyoncé" matches "beyonce". */
export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}
