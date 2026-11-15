import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const subs = new Set<() => void>();
const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true;

/** Capture the install prompt as early as possible (it can fire before React mounts). */
export function initInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    subs.forEach((s) => s());
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    subs.forEach((s) => s());
  });
}

export default function InstallButton() {
  const [, force] = useState(0);
  useEffect(() => {
    const s = () => force((n) => n + 1);
    subs.add(s);
    return () => { subs.delete(s); };
  }, []);
  if (!deferred || isStandalone()) return null;
  return (
    <button
      className="btn btn-small btn-install"
      onClick={async () => {
        const d = deferred;
        if (!d) return;
        await d.prompt();
        await d.userChoice.catch(() => null);
        deferred = null;
        force((n) => n + 1);
      }}
    >
      ⬇ Install app
    </button>
  );
}
