// Five languages. The English text is the key: `t("Take it back")` shows the line from the current
// dictionary (zh.ts, es.ts, fr.ts, pt.ts), or the English itself when there is none. `{name}`
// placeholders are filled in after the lookup, so a sentence is translated whole. A key may carry a
// `|context` suffix that is never shown, for one English word that is two elsewhere ("Defended|board").

import { createContext, useContext } from "react";
import { ES } from "./es";
import { FR } from "./fr";
import { PT } from "./pt";
import { ZH } from "./zh";

export type Lang = "en" | "zh-Hans" | "es" | "fr" | "pt";
export type Params = Record<string, string | number>;
export type T = (text: string, params?: Params) => string;

export const DICTS: Record<Exclude<Lang, "en">, Record<string, string>> = { "zh-Hans": ZH, es: ES, fr: FR, pt: PT };
/** The languages, in the order the splash shows their flags; `name` is what the picker calls each. */
export const LANGS: { lang: Lang; flag: string; name: string }[] = [
  { lang: "en", flag: "/brand/flag-us.svg", name: "English" },
  { lang: "zh-Hans", flag: "/brand/flag-cn.svg", name: "中文" },
  { lang: "es", flag: "/brand/flag-es.svg", name: "Español" },
  { lang: "fr", flag: "/brand/flag-fr.svg", name: "Français" },
  { lang: "pt", flag: "/brand/flag-br.svg", name: "Português" },
];

const fill = (s: string, p?: Params) => (p ? s.replace(/\{(\w+)\}/g, (m, k) => (k in p ? String(p[k]) : m)) : s);
/** English, as written in the code. */
export const en: T = (text, p) => fill(text.split("|")[0], p);
export const translator = (lang: Lang): T => (lang === "en" ? en : (text, p) => fill(DICTS[lang][text] ?? text.split("|")[0], p));

const LANG_KEY = "gq.lang";
/** The language picked last time on this device, English until then. */
export function storedLang(): Lang {
  try {
    const l = localStorage.getItem(LANG_KEY);
    return LANGS.some((x) => x.lang === l) ? (l as Lang) : "en";
  } catch {
    return "en";
  }
}
export function storeLang(lang: Lang) {
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    // private mode: the choice lasts the visit
  }
}

export const LangContext = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({ lang: "en", setLang: () => undefined });
export const useLang = () => useContext(LangContext);
export const useT = (): T => translator(useLang().lang);
