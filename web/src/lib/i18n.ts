// Eleven languages in five families. The English text is the key: `t("Take it back")` shows the
// line from the current dictionary, or the English itself when there is none. `{name}` placeholders
// are filled in after the lookup, so a sentence is translated whole. A key may carry a `|context`
// suffix that is never shown, for one English word that is two elsewhere ("Defended|board").

import { createContext, useContext } from "react";
import { ES_AR, ES_CO, ES_ES, ES_MX } from "./es";
import { FR_CA, FR_FR } from "./fr";
import { PT_BR } from "./pt-BR";
import { PT_PT } from "./pt-PT";
import { ZH } from "./zh";

export type Lang = "en-US" | "en-GB" | "zh-Hans" | "es-ES" | "es-MX" | "es-AR" | "es-CO" | "fr-FR" | "fr-CA" | "pt-BR" | "pt-PT";
export type Params = Record<string, string | number>;
export type T = (text: string, params?: Params) => string;

/** The dictionaries. English lines are the keys; UK English only has its jokes. */
export const DICTS: Partial<Record<Lang, Record<string, string>>> = {
  "en-GB": { "Click to start": "Click to start, bruv" },
  "zh-Hans": ZH, "es-ES": ES_ES, "es-MX": ES_MX, "es-AR": ES_AR, "es-CO": ES_CO, "fr-FR": FR_FR, "fr-CA": FR_CA, "pt-BR": PT_BR, "pt-PT": PT_PT,
};
export type Variant = { lang: Lang; flag: string; name: string; /** the city names file, by family (config.ts placesUrl) */ places?: string };
/**
 * One family per flag slot on the splash, in that order; the first variant is the one shown until
 * another is picked. `name` is the family's name in the masthead picker.
 */
export const FAMILIES: { name: string; variants: Variant[] }[] = [
  { name: "English", variants: [{ lang: "en-US", flag: "/brand/flag-us.svg", name: "US" }, { lang: "en-GB", flag: "/brand/flag-gb.svg", name: "UK" }] },
  { name: "中文", variants: [{ lang: "zh-Hans", flag: "/brand/flag-cn.svg", name: "简体", places: "zh-Hans" }] },
  {
    name: "Español",
    variants: [
      { lang: "es-ES", flag: "/brand/flag-es.svg", name: "España", places: "es" },
      { lang: "es-MX", flag: "/brand/flag-mx.svg", name: "México", places: "es" },
      { lang: "es-AR", flag: "/brand/flag-ar.svg", name: "Argentina", places: "es" },
      { lang: "es-CO", flag: "/brand/flag-co.svg", name: "Colombia", places: "es" },
    ],
  },
  { name: "Français", variants: [{ lang: "fr-FR", flag: "/brand/flag-fr.svg", name: "France", places: "fr" }, { lang: "fr-CA", flag: "/brand/flag-qc.svg", name: "Québec", places: "fr" }] },
  { name: "Português", variants: [{ lang: "pt-BR", flag: "/brand/flag-br.svg", name: "Brasil", places: "pt-BR" }, { lang: "pt-PT", flag: "/brand/flag-pt.svg", name: "Portugal", places: "pt-PT" }] },
];
export const LANGS = FAMILIES.flatMap((f) => f.variants);
/** What a flag or picker entry calls a variant: "Español (Argentina)". */
export const variantLabel = (v: Variant) => `${FAMILIES.find((f) => f.variants.includes(v))!.name} (${v.name})`;

const fill = (s: string, p?: Params) => (p ? s.replace(/\{(\w+)\}/g, (m, k) => (k in p ? String(p[k]) : m)) : s);
/** English, as written in the code. */
export const en: T = (text, p) => fill(text.split("|")[0], p);
export const translator = (lang: Lang): T => {
  const d = DICTS[lang];
  return d ? (text, p) => fill(d[text] ?? text.split("|")[0], p) : en;
};

const LANG_KEY = "gq.lang";
// the codes stored before the variants (2026-10-14)
const OLD: Record<string, Lang> = { en: "en-US", es: "es-ES", fr: "fr-FR", pt: "pt-BR" };
/** The language picked last time on this device, English until then. */
export function storedLang(): Lang {
  try {
    const l = localStorage.getItem(LANG_KEY) ?? "";
    return OLD[l] ?? (LANGS.some((x) => x.lang === l) ? (l as Lang) : "en-US");
  } catch {
    return "en-US";
  }
}
export function storeLang(lang: Lang) {
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    // private mode: the choice lasts the visit
  }
}

export const LangContext = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({ lang: "en-US", setLang: () => undefined });
export const useLang = () => useContext(LangContext);
export const useT = (): T => translator(useLang().lang);
