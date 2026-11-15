import { useEffect, useState, useSyncExternalStore } from 'react';
import type { RoomSession } from './room';
import { isMusicMuted, isSfxMuted, subscribeAudio } from './audio';

export function useSession(session: RoomSession) {
  return useSyncExternalStore(session.subscribe, session.getState);
}

export function useAudioPrefs() {
  const sfxMuted = useSyncExternalStore(subscribeAudio, isSfxMuted);
  const musicMuted = useSyncExternalStore(subscribeAudio, isMusicMuted);
  return { sfxMuted, musicMuted };
}

export function useHashRoute() {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const on = () => setHash(window.location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash.replace(/^#\/?/, '');
}

export function navigate(path: string) {
  window.location.hash = '/' + path.replace(/^\//, '');
}

export function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);
  return online;
}

/** Re-render every `ms` while `active` (for countdowns). */
export function useNow(ms: number, active = true) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms, active]);
  return now;
}
