import { useSyncExternalStore, type ButtonHTMLAttributes } from 'react';

// `document.fullscreenElement` is an external (non-React) data source, and
// `requestFullscreen` support never changes at runtime — `useSyncExternalStore`
// is the tool React itself recommends for exactly this: it reads a value that
// must default to the SSR-safe answer (`false`, so Next's server render and
// the first client render match — no hydration mismatch) and only switches to
// the real answer once mounted, without an effect calling `setState` directly.
function subscribeToFullscreenChange(onChange: () => void) {
  document.addEventListener('fullscreenchange', onChange);
  return () => document.removeEventListener('fullscreenchange', onChange);
}
const neverChanges = () => () => {};

function getIsFullscreen() {
  return document.fullscreenElement !== null;
}
function getIsFullscreenServer() {
  return false;
}

function getSupportsFullscreen() {
  return typeof document.documentElement.requestFullscreen === 'function';
}
function getSupportsFullscreenServer() {
  return false;
}

/**
 * Tam ekran aç/kapa düğmesi. Oyunlar platformdan iframe ile değil tam sayfa
 * yönlendirmeyle açıldığı için doğrudan `documentElement` üzerinde çalışır —
 * ayrıca bir `allow="fullscreen"` izni gerekmez.
 *
 * Durum `fullscreenchange` ile takip edilir, kendi state'imizle değil: oyuncu
 * ESC'e basıp tam ekrandan çıktığında tarayıcı bize haber vermezse ikon yanlış
 * kalırdı. Görünüm tamamen çağıran oyuna ait — her oyunun kendi buton stili
 * olduğu için `className` dışarıdan verilir.
 */
export function FullscreenButton({ className, ...buttonProps }: ButtonHTMLAttributes<HTMLButtonElement>) {
  const isFullscreen = useSyncExternalStore(subscribeToFullscreenChange, getIsFullscreen, getIsFullscreenServer);
  // Destek kontrolü de aynı mekanizmayla okunur: sunucuda render edilen
  // oyunlarda (Next) ilk render'ın sunucuyla aynı olması, hydration
  // uyuşmazlığını önler.
  const supported = useSyncExternalStore(neverChanges, getSupportsFullscreen, getSupportsFullscreenServer);

  // iOS Safari `requestFullscreen` desteklemez; orada düğmeyi hiç göstermemek,
  // basınca sessizce hiçbir şey olmayan bir düğme göstermekten iyidir.
  if (!supported) return null;

  const label = isFullscreen ? 'Tam ekrandan çık' : 'Tam ekran';

  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        // Tarayıcı isteği reddederse (izin yok, kullanıcı hareketi sayılmadı)
        // sayfa çökmesin — düğme eski halinde kalır, o kadar.
        if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
        else void document.documentElement.requestFullscreen().catch(() => {});
      }}
      aria-label={label}
      aria-pressed={isFullscreen}
      title={label}
      {...buttonProps}
    >
      {/* Piksel yazı tiplerinde ⛶ gibi glyph'ler eksik olduğu için ikon SVG. */}
      <svg viewBox="0 0 16 16" width="1em" height="1em" fill="currentColor" aria-hidden="true" focusable="false">
        {isFullscreen
          ? <path d="M6 1h2v5H3V4h3zm4 0h2v3h3v2h-5zM1 10h5v5H4v-3H1zm9 0h5v2h-3v3h-2z" />
          : <path d="M1 1h5v2H3v3H1zm9 0h5v5h-2V3h-3zM1 10h2v3h3v2H1zm12 0h2v5h-5v-2h3z" />}
      </svg>
    </button>
  );
}
