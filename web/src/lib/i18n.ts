// Two languages. The English text is the key: `t("Take it back")` shows the Simplified Chinese
// line from zh.ts, or the English itself when there is none. `{name}` placeholders are filled in
// after the lookup, so a sentence is translated whole. A key may carry a `|context` suffix that
// is never shown, for one English word that is two Chinese ones ("Defended|board").

import { createContext, useContext } from "react";
import { ZH } from "./zh";

export type Lang = "en" | "zh-Hans";
export type Params = Record<string, string | number>;
export type T = (text: string, params?: Params) => string;

const fill = (s: string, p?: Params) => (p ? s.replace(/\{(\w+)\}/g, (m, k) => (k in p ? String(p[k]) : m)) : s);
/** English, as written in the code. */
export const en: T = (text, p) => fill(text.split("|")[0], p);
export const translator = (lang: Lang): T => (lang === "en" ? en : (text, p) => fill(ZH[text] ?? text.split("|")[0], p));

const LANG_KEY = "gq.lang";
/** The language picked last time on this device, English until then. */
export function storedLang(): Lang {
  try {
    return localStorage.getItem(LANG_KEY) === "zh-Hans" ? "zh-Hans" : "en";
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
