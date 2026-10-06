// Keeps the phone screen awake while the game is on screen (e.g. AUTO hunting with no touches).
// The browser drops the lock whenever the page is hidden, so it is re-requested when the page
// comes back and on the next touch / key (some browsers only grant it after a user gesture).
// Unsupported or refused requests are ignored: the game simply behaves as before.

let lock: WakeLockSentinel | null = null;
let pending = false;

async function acquire(): Promise<void> {
  if (lock || pending || document.visibilityState !== 'visible' || !('wakeLock' in navigator)) return;
  pending = true;
  try {
    const l = await navigator.wakeLock.request('screen');
    lock = l;
    l.addEventListener('release', () => {
      if (lock === l) lock = null;
    });
  } catch {
    /* not allowed right now (no gesture yet, battery saver, ...) */
  } finally {
    pending = false;
  }
}

/** Call once at startup. */
export function keepScreenAwake(): void {
  const retry = (): void => void acquire();
  document.addEventListener('visibilitychange', retry);
  window.addEventListener('pointerdown', retry, { passive: true });
  window.addEventListener('keydown', retry);
  retry();
}
