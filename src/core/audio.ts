/**
 * Tiny audio manager. Sound effects are fetched and decoded into Web Audio buffers on first use
 * (lazy); music streams through one looping <audio> element. Nothing plays until the first tap
 * (browser autoplay rules). Music and SFX mute flags are remembered separately in localStorage.
 */
const SFX_KEY = 'pixova.sfxMuted';
const MUSIC_KEY = 'pixova.musicMuted';

let ctx: AudioContext | null = null;
let unlocked = false;
const buffers = new Map<string, Promise<AudioBuffer | null>>();
const listeners = new Set<() => void>();

let sfxMuted = read(SFX_KEY);
let musicMuted = read(MUSIC_KEY);
let musicEl: HTMLAudioElement | null = null;
let wantedMusic: string | null = null;

function read(k: string) { try { return localStorage.getItem(k) === '1'; } catch { return false; } }
function write(k: string, v: boolean) { try { localStorage.setItem(k, v ? '1' : '0'); } catch { /* ignore */ } }
const notify = () => listeners.forEach((l) => l());

export function initAudioUnlock() {
  const unlock = () => {
    if (unlocked) return;
    unlocked = true;
    try {
      ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      void ctx.resume();
    } catch { /* no web audio */ }
    syncMusic();
    window.removeEventListener('pointerdown', unlock, true);
    window.removeEventListener('keydown', unlock, true);
  };
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);
  document.addEventListener('visibilitychange', () => {
    if (!musicEl) return;
    if (document.hidden) musicEl.pause();
    else syncMusic();
  });
}

function load(url: string) {
  let p = buffers.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => r.arrayBuffer())
      .then((b) => (ctx ? ctx.decodeAudioData(b) : null))
      .catch(() => null);
    buffers.set(url, p);
  }
  return p;
}

/** Warm the cache for a set of sound effects (call when a game screen mounts). */
export function preloadSfx(urls: string[]) {
  if (ctx) urls.forEach(load);
}

export function playSfx(url: string, volume = 0.8) {
  if (sfxMuted || !unlocked || !ctx) return;
  void load(url).then((buf) => {
    if (!buf || !ctx || sfxMuted) return;
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    gain.gain.value = volume;
    src.buffer = buf;
    src.connect(gain).connect(ctx.destination);
    src.start();
  });
}

/** Set the background track (null for silence). The file is only fetched when actually played. */
export function setMusic(url: string | null) {
  wantedMusic = url;
  syncMusic();
}

function syncMusic() {
  if (!unlocked || musicMuted || !wantedMusic || document.hidden) {
    musicEl?.pause();
    return;
  }
  if (!musicEl) {
    musicEl = new Audio();
    musicEl.loop = true;
    musicEl.volume = 0.35;
  }
  const abs = new URL(wantedMusic, location.href).href;
  if (musicEl.src !== abs) musicEl.src = abs;
  void musicEl.play().catch(() => { /* retried on next sync */ });
}

export const isSfxMuted = () => sfxMuted;
export const isMusicMuted = () => musicMuted;
export function setSfxMuted(v: boolean) { sfxMuted = v; write(SFX_KEY, v); notify(); }
export function setMusicMuted(v: boolean) { musicMuted = v; write(MUSIC_KEY, v); syncMusic(); notify(); }
export function subscribeAudio(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
