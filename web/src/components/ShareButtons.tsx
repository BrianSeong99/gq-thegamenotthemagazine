// Invite rivals to a record: the X post (Weibo beside it in Chinese) and the plain link.

import { useState } from "react";
import { recordLinks, resultLinks } from "@/lib/flow";
import { useLang, useT } from "@/lib/i18n";
import type { Stage } from "@/lib/stages";

export function ShareButtons({ recordId, score, expiresAt, cities, stage }: { recordId: string; score: number; expiresAt: number; cities: string[]; stage?: Stage }) {
  return <SocialButtons links={recordLinks(recordId, score, expiresAt, cities, stage)} />;
}

export function ResultShareButtons({ score, stage }: { score: number; stage?: Stage }) {
  const links = resultLinks(score, stage);
  return <SocialButtons links={links} copyText={links.text} result />;
}

function SocialButtons({ links: { url, x, weibo }, copyText, result = false }: { links: ReturnType<typeof recordLinks>; copyText?: string; result?: boolean }) {
  const t = useT();
  const { lang } = useLang();
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
      <button className="btn" onClick={() => void navigator.clipboard.writeText(copyText ?? url).then(() => setCopied(true))}>
        {copied ? t("Copied!") : result ? t("Copy result") : t("Copy link")}
      </button>
    </div>
  );
}
