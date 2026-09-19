export function formatElapsed(milliseconds: number): string {
  if (milliseconds < 1000) return `${Math.round(milliseconds)} ms`;
  if (milliseconds < 60000) return `${(milliseconds / 1000).toFixed(1)} s`;
  return `${Math.floor(milliseconds / 60000)} min ${Math.floor((milliseconds % 60000) / 1000)} s`;
}
