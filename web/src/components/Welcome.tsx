// The attract screen: the city hero, one blinking start line in the middle, the flags bottom right,
// one per language family. A click anywhere on the picture starts. A cyan frame marks the current
// language; clicking it opens its family's other variants above it, a picked one takes the slot and
// the stack folds away until the framed flag is clicked again.

import { useState } from "react";
import { FAMILIES, type Lang, useLang, useT, variantLabel } from "@/lib/i18n";

export function Welcome({ onStart }: { onStart: () => void }) {
  const t = useT();
  const { lang, setLang } = useLang();
  // the variant each family keeps in its slot after a pick, until the page is left
  const [picked, setPicked] = useState<Record<string, Lang>>({});
  // the family whose other variants are shown above its flag
  const [open, setOpen] = useState<string | null>(null);
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
          {FAMILIES.map((f) => {
            const current = f.variants.find((v) => v.lang === lang);
            const shown = current ?? f.variants.find((v) => v.lang === picked[f.name]) ?? f.variants[0];
            const pick = (l: Lang) => {
              setPicked({ ...picked, [f.name]: l });
              setLang(l);
              setOpen(null);
            };
            return (
              <div key={f.name} className="family">
                {open === f.name &&
                  f.variants
                    .filter((v) => v !== shown)
                    .map((v) => (
                      <button key={v.lang} className="flag" aria-label={variantLabel(v)} onClick={() => pick(v.lang)}>
                        <img src={v.flag} alt="" width={36} height={24} />
                      </button>
                    ))}
                <button
                  className="flag"
                  aria-label={variantLabel(shown)}
                  aria-pressed={!!current}
                  aria-expanded={f.variants.length > 1 ? open === f.name : undefined}
                  onClick={() => {
                    setLang(shown.lang);
                    setOpen(open === f.name || f.variants.length < 2 ? null : f.name);
                  }}
                >
                  <img src={shown.flag} alt="" width={36} height={24} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
      <p className="rotate-hint">{t("Turn your phone sideways: the map is much easier to play.")}</p>
    </div>
  );
}
