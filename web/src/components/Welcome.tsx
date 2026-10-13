// The attract screen: the city hero, and two blinking start lines in the middle, one per language.

import { useT, type Lang } from "@/lib/i18n";

export function Welcome({ onStart }: { onStart: (lang: Lang) => void }) {
  const t = useT();
  return (
    <div className="welcome-screen">
      <div className="welcome">
        <img src="/brand/hero-city.webp" alt="" width={1440} height={960} />
        <div className="start-options">
          <button className="start" lang="en" onClick={() => onStart("en")}>
            <img src="/brand/flag-us.svg" alt="" width={36} height={24} />
            Click to start
          </button>
          <button className="start" lang="zh-Hans" onClick={() => onStart("zh-Hans")}>
            <img src="/brand/flag-cn.svg" alt="" width={36} height={24} />
            点击开始
          </button>
        </div>
      </div>
      <p className="rotate-hint">{t("Turn your phone sideways: the map is much easier to play.")}</p>
    </div>
  );
}
