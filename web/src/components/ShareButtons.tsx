// Invite rivals to a record: the X post (Weibo in Chinese) and the plain link.

import { useState } from "react";
import { recordLinks } from "@/lib/flow";
import { useLang, useT } from "@/lib/i18n";

export function ShareButtons({ recordId, score, expiresAt, cities }: { recordId: string; score: number; expiresAt: number; cities: string[] }) {
  const t = useT();
  const { lang } = useLang();
  const { url, x, weibo } = recordLinks(recordId, score, expiresAt, cities);
  const [copied, setCopied] = useState(false);
  return (
    <div className="share">
      <a className="btn primary" href={lang === "zh-Hans" ? weibo : x} target="_blank" rel="noreferrer">
        {t("Share on X")}
      </a>
      <button className="btn" onClick={() => void navigator.clipboard.writeText(url).then(() => setCopied(true))}>
        {copied ? t("Copied!") : t("Copy link")}
      </button>
    </div>
  );
}
