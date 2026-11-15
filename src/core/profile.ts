import { PALETTE } from './palette';

export interface Profile { name: string; color: number }
const KEY = 'pixova.profile';

export function loadProfile(): Profile | null {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (p && typeof p.name === 'string' && p.name.trim()) return { name: p.name, color: Number(p.color) || 0 };
  } catch { /* ignore */ }
  return null;
}

export function saveProfile(name: string, color?: number): Profile {
  const p = { name: name.trim().slice(0, 16), color: color ?? Math.floor(Math.random() * PALETTE.length) };
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* private mode */ }
  return p;
}
