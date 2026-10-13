// The Player Hub: my records to take back, my shots to play, lost shots at my records to collect.

import type { ChallengeNote } from "@/lib/chain";
import { blocksToClock, blockToMs, fmtGeocoin, sameAccount, sameWord } from "@/lib/flow";
import { triesLost, whenLabel } from "@/lib/hub";
import { cityNames, recordCities, type Place, type Word4 } from "@/lib/quiz";
import { CLAIM_FUZZ } from "@/config";
import { noteDeadline as deadline, type AccountFelts } from "@/lib/notes";
import { ShareButtons } from "./ShareButtons";

type LobbyProps = {
  me: AccountFelts | null;
  notes: ChallengeNote[];
  height: number;
  places: Place[];
  onSettle: (shot: ChallengeNote, record: ChallengeNote | undefined) => void;
  onCollect: (notes: ChallengeNote[]) => void;
};

export function Lobby({ me, notes, height, places, onSettle, onCollect }: LobbyProps) {
  const records = notes.filter((n) => n.kind === "record" && !n.consumed);
  const shots = notes.filter((n) => n.kind === "shot" && !n.consumed);
  const recordById = (idWord: Word4) => notes.find((n) => n.kind === "record" && sameWord(n.idWord, idWord));
  const expired = (n: ChallengeNote) => height >= deadline(n);
  // the champion may take a note CLAIM_FUZZ blocks past its deadline: a claim proved just before it lands until then
  const takeable = (n: ChallengeNote) => height >= deadline(n) + CLAIM_FUZZ;
  // when the champion may take it, as a clock time: blocks left at testnet's pace
  const until = (n: ChallengeNote) => whenLabel(blockToMs(deadline(n) + CLAIM_FUZZ, height));

  const mine = (n: ChallengeNote) => sameAccount(me, n.storage.champion);
  // only mine here: other people's open records are listed in Champion vs Rival
  const myRecords = records.filter(mine);
  const myShots = shots.filter((n) => sameAccount(me, n.storage.rival));
  const shotsAtMyRecords = shots.filter((n) => mine(n) && !sameAccount(me, n.storage.rival));
  const empty = myRecords.length + myShots.length + shotsAtMyRecords.length === 0;
  // everything the champion can take now goes in one transaction: one wallet approval
  const ready = [...myRecords, ...shotsAtMyRecords].filter(takeable);

  return (
    <div className="lobby">
      {empty && <p className="muted">Play the World Tour and post your record: rivals pay a Geocoin to try to beat it!</p>}
      {ready.length > 1 && (
        <p>
          <button className="btn primary" onClick={() => onCollect(ready)}>
            Take all
          </button>
        </p>
      )}
      {myRecords.map((p) => (
        <section key={p.id} className={`panel card${takeable(p) ? " yellow" : ""}`}>
          <div className="eyebrow">{takeable(p) ? "My record / over" : `My record / open until ${until(p)}`}</div>
          <div className="score">{p.storage.target.toLocaleString()} pts</div>
          {takeable(p) ? (
            <button className="btn primary" onClick={() => onCollect([p])}>
              Take it back
            </button>
          ) : (
            <>
              <p className="muted">Waiting for a rival…</p>
              <LostSoFar n={triesLost(p, notes, height)} />
              <ShareButtons recordId={p.id} score={p.storage.target} expiresAt={blockToMs(p.storage.expiryBlock, height)} cities={cityNames(recordCities(p.storage.game), places)} />
            </>
          )}
        </section>
      ))}

      {me &&
        myShots.map((c) => {
          const record = recordById(c.storage.recordId);
          return (
            <section key={c.id} className="panel card pink">
              <div className="eyebrow">{expired(c) ? "My shot / too late" : `My shot / ends in ${blocksToClock(deadline(c) - height)}`}</div>
              <div className="score">beat {c.storage.target.toLocaleString()}</div>
              <p className="muted">{fmtGeocoin(c.amount)} on the table</p>
              {expired(c) ? (
                // the shot script serves its rival first: a shot at my own record stays locked past its deadline
                <p className="muted">{mine(c) ? "Locked: this shot was at your own record." : "The champion can take it."}</p>
              ) : (
                <button className="btn primary" onClick={() => onSettle(c, record && !record.consumed ? record : undefined)}>
                  Play
                </button>
              )}
            </section>
          );
        })}

      {me &&
        shotsAtMyRecords.map((c) => (
          <section key={c.id} className="panel card mint">
            <div className="eyebrow">{takeable(c) ? "For you / ready" : "For you / in play"}</div>
            <div className="score">{fmtGeocoin(c.amount)}</div>
            {takeable(c) ? (
              <button className="btn primary" onClick={() => onCollect([c])}>
                Take it
              </button>
            ) : (
              <p className="muted">Someone is playing…</p>
            )}
          </section>
        ))}
    </div>
  );
}

/** Rivals who lost are counted, never named. Nothing while none lost, or while the count is unknown. */
const LostSoFar = ({ n }: { n: number | null }) => (n ? <p className="small">{n === 1 ? "1 try lost so far" : `${n} tries lost so far`}</p> : null);
