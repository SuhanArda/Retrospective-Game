import { useEffect, useState, type ButtonHTMLAttributes } from 'react';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  questionOpen?: boolean;
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
export function FullscreenButton({ className, questionOpen = false, ...buttonProps }: Props) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Destek kontrolü de effect içinde: sunucuda render edilen oyunlarda (Next)
  // ilk render'ın sunucuyla aynı olması, hydration uyuşmazlığını önler.
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    setSupported(typeof document.documentElement.requestFullscreen === 'function');
    const sync = () => {
      const tankBattleIsFullscreen = document.fullscreenElement === document.documentElement;
      setIsFullscreen(tankBattleIsFullscreen);
      document.documentElement.classList.toggle('tank-battle-fullscreen', tankBattleIsFullscreen);
    };
    sync();
    document.addEventListener('fullscreenchange', sync);
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      document.documentElement.classList.remove('tank-battle-fullscreen');
    };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('tank-battle-question-open', questionOpen);
    return () => document.documentElement.classList.remove('tank-battle-question-open');
  }, [questionOpen]);

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
