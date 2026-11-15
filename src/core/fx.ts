/** Shared "juice" helpers any game can use. */
export function vibrate(pattern: number | number[]) {
  try { navigator.vibrate?.(pattern); } catch { /* unsupported (e.g. iOS) */ }
}

/** Shake the whole app. strength 1 = small, 3 = big. */
export function shake(strength: 1 | 2 | 3 = 2) {
  const el = document.getElementById('app-shell');
  if (!el) return;
  el.classList.remove('shake-1', 'shake-2', 'shake-3');
  void el.offsetWidth; // restart the animation
  el.classList.add(`shake-${strength}`);
  setTimeout(() => el.classList.remove(`shake-${strength}`), 600);
}
