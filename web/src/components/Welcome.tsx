// The attract screen: the city hero, one blinking start line in the middle, the flags bottom right.
// A click anywhere on the picture starts; a cyan frame marks the current language, click another flag
// and the start line, then the whole game, follow.

import { LANGS, useLang, useT } from "@/lib/i18n";

export function Welcome({ onStart }: { onStart: () => void }) {
  const t = useT();
  const { lang, setLang } = useLang();
  return (
    <div className="welcome-screen">
      <div className="welcome">
        <img src="/brand/hero-city.webp" alt="" width={1440} height={960} onClick={onStart} />
        <div className="start-options">
          <button className="start" onClick={onStart}>
            {t("Click to start")}
          </button>
        </div>
        <div className="flags">
          {LANGS.map((l) => (
            <button key={l.lang} className="flag" aria-label={l.name} aria-pressed={l.lang === lang} onClick={() => setLang(l.lang)}>
              <img src={l.flag} alt="" width={36} height={24} />
            </button>
          ))}
        </div>
      </div>
      <p className="rotate-hint">{t("Turn your phone sideways: the map is much easier to play.")}</p>
    </div>
  );
}
