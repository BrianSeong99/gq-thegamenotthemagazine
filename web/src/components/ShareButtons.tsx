// Invite rivals to a record: the X post (Weibo beside it in Chinese) and the plain link.

import { useState } from "react";
import { recordLinks } from "@/lib/flow";
import { translator, useLang, useT } from "@/lib/i18n";

export function ShareButtons({ recordId, score, expiresAt, cities, stage }: { recordId: string; score: number; expiresAt: number; cities: string[]; stage?: string }) {
  const t = useT();
  const { lang } = useLang();
  const { url, x, weibo } = recordLinks(recordId, score, expiresAt, cities, stage, stage && translator("zh-Hans")(stage));
  const [copied, setCopied] = useState(false);
  return (
    <div className="share">
      <a className="btn primary" href={x} target="_blank" rel="noreferrer">
        {t("Share on X")}
      </a>
      {lang === "zh-Hans" && (
        <a className="btn primary" href={weibo} target="_blank" rel="noreferrer">
          {t("Share on Weibo")}
        </a>
      )}
      <button className="btn" onClick={() => void navigator.clipboard.writeText(url).then(() => setCopied(true))}>
        {copied ? t("Copied!") : t("Copy link")}
      </button>
    </div>
  );
}
