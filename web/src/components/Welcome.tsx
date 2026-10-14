// The attract screen: the city hero, one blinking start line in the middle, the flags bottom right.
// A cyan frame marks the current language: click the other flag and the start line, then the whole game, follow.

import { useLang, useT, type Lang } from "@/lib/i18n";

const FLAGS: [Lang, string, string][] = [
  ["en", "/brand/flag-us.svg", "English"],
  ["zh-Hans", "/brand/flag-cn.svg", "中文"],
];

export function Welcome({ onStart }: { onStart: () => void }) {
  const t = useT();
  const { lang, setLang } = useLang();
  return (
    <div className="welcome-screen">
      <div className="welcome">
        <img src="/brand/hero-city.webp" alt="" width={1440} height={960} />
        <div className="start-options">
          <button className="start" onClick={onStart}>
            {t("Click to start")}
          </button>
        </div>
        <div className="flags">
          {FLAGS.map(([l, src, name]) => (
            <button key={l} className="flag" aria-label={name} aria-pressed={l === lang} onClick={() => setLang(l)}>
              <img src={src} alt="" width={36} height={24} />
            </button>
          ))}
        </div>
      </div>
      <p className="rotate-hint">{t("Turn your phone sideways: the map is much easier to play.")}</p>
    </div>
  );
}
