// The arcade chrome around every screen: one ribbon with the wordmark, the tabs, sound, language and wallet.

import type { ReactNode } from "react";
import { useLang, useT } from "@/lib/i18n";
import { TAB_LABEL, type Tab } from "@/lib/tabs";

export function Shell({
  tab,
  onTab,
  onHome,
  walletLabel,
  netSlow,
  hubAlert,
  onWallet,
  soundOn,
  onSound,
  children,
}: {
  tab: Tab;
  onTab: (t: Tab) => void;
  /** the wordmark: back to the splash screen, inside the app (sound and wallet stay as they are) */
  onHome: () => void;
  /** null when no wallet is connected */
  walletLabel: string | null;
  /** the last background sync failed */
  netSlow?: boolean;
  /** the connected wallet has Geocoins to take in the Player Hub */
  hubAlert?: boolean;
  onWallet: () => void;
  soundOn: boolean;
  onSound: () => void;
  children: ReactNode;
}) {
  const t = useT();
  const { lang, setLang } = useLang();
  return (
    <>
      <header className="masthead">
        <a
          className="brand"
          href="/"
          aria-label={t("GeoQuizz home")}
          onClick={(e) => {
            e.preventDefault();
            onHome();
          }}
        >
          <img src="/brand/geoquizz-wordmark.svg" alt="GeoQuizz" width={840} height={205} />
        </a>
        <nav aria-label={t("Sections")}>
          {(Object.keys(TAB_LABEL) as Tab[]).map((k) => (
            <button key={k} className={k === tab ? "active" : k === "hub" && hubAlert ? "blink" : ""} onClick={() => onTab(k)} aria-current={k === tab ? "page" : undefined}>
              {t(TAB_LABEL[k])}
            </button>
          ))}
        </nav>
        {netSlow && (
          <span className="net" title={t("The last sync with the Miden network failed; it retries by itself.")}>
            {t("Network slow")}
          </span>
        )}
        <button className="sound" onClick={onSound} aria-pressed={soundOn}>
          {soundOn ? t("Sound on") : t("Sound off")}
        </button>
        {/* the other language, in place: the screen, the quiz and the wallet stay as they are */}
        {lang === "en" ? (
          <button className="lang" lang="zh-Hans" aria-label="切换至中文" onClick={() => setLang("zh-Hans")}>
            中文
          </button>
        ) : (
          <button className="lang" lang="en" aria-label="Switch to English" onClick={() => setLang("en")}>
            EN
          </button>
        )}
        <div className="account">
          <button className="btn wallet" onClick={onWallet}>
            {walletLabel ?? t("Connect wallet")}
          </button>
          <span className="testnet" title={t("Miden testnet: Geocoins are play money.")}>
            {t("Testnet")}
          </span>
        </div>
      </header>
      <main>
        <p className="rotate-hint">{t("Turn your phone sideways: the map is much easier to play.")}</p>
        {children}
      </main>
    </>
  );
}
