// Keeps the phone screen awake while the game is on screen (e.g. AUTO hunting with no touches).
// Two layers:
// 1. the Screen Wake Lock API: dropped by the browser whenever the page is hidden, so it is
//    re-requested when the page comes back and on the next touch / key;
// 2. a fallback for where that API is missing, refused or ignored (older iOS, iOS home-screen
//    apps, some battery savers): a tiny silent muted video looping inline. Playing video keeps
//    the screen on. It needs a user gesture to start, so it starts on the first touch / key.
// Failures are ignored: the game simply behaves as before.

let lock: WakeLockSentinel | null = null;
let pending = false;
let video: HTMLVideoElement | null = null;

const isIOS = (): boolean => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** iOS home-screen apps report Wake Lock support but did not honour it before iOS 18.4. */
const needsVideo = (): boolean => !('wakeLock' in navigator) || isIOS();

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
    // not allowed (no gesture yet, battery saver, ...): fall back to the looping video
    playVideo();
  } finally {
    pending = false;
  }
}

function makeVideo(): HTMLVideoElement {
  const v = document.createElement('video');
  v.setAttribute('playsinline', '');
  v.setAttribute('muted', '');
  v.muted = true;
  v.loop = true;
  v.setAttribute('aria-hidden', 'true');
  // in the DOM but invisible and out of the way of touches
  Object.assign(v.style, { position: 'fixed', left: '0', top: '0', width: '1px', height: '1px', opacity: '0.01', pointerEvents: 'none', zIndex: '-1' });
  const base = import.meta.env.BASE_URL;
  for (const [src, type] of [
    [`${base}keepawake.webm`, 'video/webm'],
    [`${base}keepawake.mp4`, 'video/mp4'],
  ] as const) {
    const s = document.createElement('source');
    s.src = src;
    s.type = type;
    v.appendChild(s);
  }
  document.body.appendChild(v);
  return v;
}

function playVideo(): void {
  if (document.visibilityState !== 'visible') return;
  try {
    video ??= makeVideo();
    if (video.paused) void video.play().catch(() => undefined);
  } catch {
    /* no video support: nothing more to try */
  }
}

/** Call once at startup. */
export function keepScreenAwake(): void {
  const retry = (): void => {
    void acquire();
    if (needsVideo()) playVideo();
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') retry();
    else video?.pause();
  });
  window.addEventListener('pointerdown', retry, { passive: true });
  window.addEventListener('touchend', retry, { passive: true });
  window.addEventListener('keydown', retry);
  void acquire();
}
