// The stage tiles over the bottom of the 1P map: the four maps other than the one shown, in the
// order they unlock. A locked tile shows how many records it needs and the score one of them must reach
// (on a narrow screen the two numbers alone, the score in thousands) and does nothing.
// The lobby shows them only once my records are known (notes read, wallet back).

import { useT } from "@/lib/i18n";
import { STAGES, type Stage, type StageId } from "@/lib/stages";

export function StageTiles({ shown, unlocked, onPick }: { shown: Stage; unlocked: (s: Stage) => boolean; onPick: (id: StageId) => void }) {
  const t = useT();
  return (
    <div className="stages" role="group" aria-label={t("Stages")}>
      {STAGES.filter((s) => s.id !== shown.id).map((s) => {
        const open = unlocked(s);
        const n = s.threshold.toLocaleString();
        const need = s.records === 1 ? t("1 record above {n}", { n }) : t("{r} records, 1 above {n}", { r: s.records, n });
        return (
          <button key={s.id} className="stage" disabled={!open} onClick={() => onPick(s.id)} aria-label={open ? t(s.name) : `${t(s.name)}: ${need}`}>
            <img src={s.map} alt="" />
            <span className="name">{t(s.name)}</span>
            {!open && (
              <span className="need">
                <svg viewBox="0 0 8 10" width="8" height="10" aria-hidden="true">
                  <path d="M2 4V2.5a2 2 0 0 1 4 0V4" fill="none" stroke="currentColor" strokeWidth="1.5" />
                  <rect x="1" y="4" width="6" height="5" fill="currentColor" />
                </svg>{" "}
                <span className="full">{need}</span>
                <span className="short">{`${s.records} · ${s.threshold / 1000}k`}</span>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
