// Deterministic name -> color/initials for small assignee avatars, shared
// by OrderTaskList's task cards and WorkflowWidget's "By User" tab headers
// so the same person always renders with the same color across both.
const PALETTE = [
  '#2563eb', '#7c3aed', '#be185d', '#0891b2', '#16a34a',
  '#d97706', '#dc2626', '#4338ca', '#0d9488', '#c2410c',
];

export function stringToColor(input) {
  const str = String(input || '');
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

export function initialsFor(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return '?';
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
