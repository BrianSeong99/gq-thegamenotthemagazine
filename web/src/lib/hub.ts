// Past games and the public leaderboards, read from the game's public notes: nobody reports a
// result, the chain tells how each record and shot ended. Pure: notes (with the blocks they were
// made and used in) come in, rows come out.

import type { ChallengeNote } from "./chain";
import { fmtGeocoin } from "./flow";
import { isShotAt, shotDeadline, type AccountFelts } from "./notes";
import { CLAIM_FUZZ, GC_DECIMALS } from "@/config";

export const keyOf = (a: AccountFelts) => `${a.prefix}:${a.suffix}`;
const same = (a: AccountFelts | null, b: AccountFelts | null) => !!a && !!b && keyOf(a) === keyOf(b);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Letters of an address read from its end: digits and the wallet's `_…` routing part left out. */
export function lettersBackward(address: string): string {
  const id = address.split("_")[0];
  return [...id.slice(id.lastIndexOf("1") + 1)]
    .reverse()
    .filter((c) => /[a-z]/i.test(c))
    .join("")
    .toUpperCase();
}

/**
 * Arcade names: the first three letters of the address read backward (…nthj9 → JHT). A name already
 * taken keeps its first two letters and takes the next letter further back (JHN, then JHL…), so
 * whoever played first keeps theirs. `players` come in the order they first played.
 * ponytail: when every third letter is taken (some 25 of them) the name repeats; vary the second letter then.
 */
export function nicknames(players: { key: string; address: string }[]): Map<string, string> {
  const names = new Map<string, string>();
  const taken = new Set<string>();
  for (const { key, address } of players) {
    if (names.has(key)) continue;
    const letters = lettersBackward(address);
    let name = letters.slice(0, 3);
    for (let i = 3; taken.has(name) && i < letters.length; i++) name = letters.slice(0, 2) + letters[i];
    taken.add(name);
    names.set(key, name);
  }
  return names;
}

/** Everyone who played, in the order they first did: a champion from a record, a rival from a shot. */
export function playersInOrder(notes: ChallengeNote[]): AccountFelts[] {
  const plays = notes
    .flatMap((n) => {
      const who = n.kind === "record" ? n.storage.champion : n.storage.rival;
      return who ? [{ who, at: n.createdAt ?? Infinity }] : [];
    })
    .sort((a, b) => a.at - b.at || (keyOf(a.who) < keyOf(b.who) ? -1 : 1));
  const seen = new Map<string, AccountFelts>();
  for (const { who } of plays) if (!seen.has(keyOf(who))) seen.set(keyOf(who), who);
  return [...seen.values()];
}

/**
 * How a shot ended. Before its deadline only its rival can use it, and only with a winning answer;
 * a claim proved before the deadline lands at most CLAIM_FUZZ blocks after it, and the champion may
 * only collect from deadline + CLAIM_FUZZ on. So the block it was used in tells: won up to there,
 * taken after. undefined while the node has not said when it was used.
 *
 * v1 notes: the champion could collect from the deadline itself, so a late-landing claim (testnet,
 * 2026-10-09: deadline 82645, claim in 82650) is told apart by having taken the open `record` in the
 * same block. A v1 win without the prize that lands after the deadline reads as lost; kept as is.
 */
export function shotOutcome(shot: ChallengeNote, height: number, record?: ChallengeNote): "won" | "lost" | "open" | undefined {
  const deadline = shotDeadline(shot.storage);
  if (!shot.consumed) return height >= deadline ? "lost" : "open";
  if (shot.consumedAt === undefined) return undefined;
  if (!shot.v1) return shot.consumedAt <= deadline + CLAIM_FUZZ ? "won" : "lost";
  const claimedWithRecord = record?.consumedAt === shot.consumedAt && shot.consumedAt < record.storage.expiryBlock;
  return shot.consumedAt < deadline || claimedWithRecord ? "won" : "lost";
}

/** How a record ended: smashed (used before the champion could take it back, which only a winner can do), closed (expired) or open. */
export function recordOutcome(record: ChallengeNote, height: number): "smashed" | "closed" | "open" | undefined {
  const expiry = record.storage.expiryBlock;
  // v1: take-back opened at the expiry itself
  const takeBack = record.v1 ? expiry : expiry + CLAIM_FUZZ + 1;
  if (record.consumed) return record.consumedAt === undefined ? undefined : record.consumedAt < takeBack ? "smashed" : "closed";
  return height >= expiry ? "closed" : "open";
}

// a shot belongs to a record by its full terms (isShotAt), not its record id alone
const shotsAt = (record: ChallengeNote, notes: ChallengeNote[]) => notes.filter((n) => n.kind === "shot" && isShotAt(n.storage, record.storage, record.idWord));
const recordOf = (shot: ChallengeNote, notes: ChallengeNote[]) => notes.find((n) => n.kind === "record" && isShotAt(shot.storage, n.storage, n.idWord));

/** Shots at `record` lost so far, or null while one of them waits for the node. */
export function triesLost(record: ChallengeNote, notes: ChallengeNote[], height: number): number | null {
  const outcomes = shotsAt(record, notes).map((s) => shotOutcome(s, height, record));
  return outcomes.includes(undefined) ? null : outcomes.filter((o) => o === "lost").length;
}

/** Who smashed `record`: the rival of the winning shot used in the same transaction. */
function winner(record: ChallengeNote, notes: ChallengeNote[], height: number): AccountFelts | undefined {
  const shot = shotsAt(record, notes).find((s) => s.consumedAt === record.consumedAt && shotOutcome(s, height, record) === "won");
  return shot?.storage.rival ?? undefined;
}

/** Geocoins a champion took from shots lost at `record`: the lost ones already used. */
const collected = (record: ChallengeNote, notes: ChallengeNote[], height: number) =>
  shotsAt(record, notes).reduce((sum, s) => (s.consumedAt !== undefined && shotOutcome(s, height, record) === "lost" ? sum + s.amount : sum), 0n);

type Tone = "pink" | "mint" | "";
/**
 * A past game: the result leads, `context` is what comes before the score (whose record it was),
 * `money` is what came in or went out, `note` the small line under it. Never a rival's exact score.
 */
export type HistoryItem = { id: string; kind: "record" | "shot"; at: number; result: string; context: string; score: number; detail: string; money: string; note: string; tone: Tone; moneyTone: Tone };

/** My finished games, newest first: my records and my shots once used (live ones stay on the cards). */
export function history(notes: ChallengeNote[], me: AccountFelts, height: number, name: (a: AccountFelts) => string): HistoryItem[] {
  const items: HistoryItem[] = [];
  for (const n of notes) {
    if (n.consumedAt === undefined) continue;
    const base = { id: n.id, kind: n.kind, at: n.consumedAt, score: n.storage.target, context: "", detail: "", note: "" };
    if (n.kind === "record" && same(n.storage.champion, me)) {
      const lost = triesLost(n, notes, height);
      if (lost === null) continue;
      const won = collected(n, notes, height);
      const tries = plural(lost, "try lost", "tries lost");
      if (recordOutcome(n, height) === "smashed") {
        const w = winner(n, notes, height);
        const who = w ? name(w) : "Someone";
        const money = won > 0n ? { money: `${fmtGeocoin(won)} won`, moneyTone: "mint" as const } : { money: `${fmtGeocoin(n.amount)} lost`, moneyTone: "pink" as const };
        items.push({ ...base, result: "Beaten", context: `${who} beat `, detail: tries, tone: "pink", note: `Prize went to ${who}.`, ...money });
      } else if (lost > 0) {
        const money = won > 0n ? { money: `${fmtGeocoin(won)} won`, moneyTone: "mint" as const, note: "Your Geocoin back." } : { money: `${fmtGeocoin(n.amount)} back`, moneyTone: "" as const };
        items.push({ ...base, result: "Defended", detail: tries, tone: "mint", ...money });
      } else items.push({ ...base, result: "Taken back", detail: shotsAt(n, notes).length === 0 ? "Nobody tried." : "", money: `${fmtGeocoin(n.amount)} back`, tone: "", moneyTone: "" });
    } else if (n.kind === "shot" && same(n.storage.rival, me)) {
      const who = name(n.storage.champion);
      const record = recordOf(n, notes);
      const shot = { ...base, context: `${who}'s record: ` };
      if (shotOutcome(n, height, record) === "lost") items.push({ ...shot, result: "You lost", money: `${fmtGeocoin(n.amount)} lost`, note: `Went to ${who}.`, tone: "pink", moneyTone: "pink" });
      // the prize comes with the shot in one transaction: same block
      else if (record && record.consumedAt === n.consumedAt) items.push({ ...shot, result: "You won", money: `${fmtGeocoin(record.amount)} won`, note: "Your Geocoin back.", tone: "mint", moneyTone: "mint" });
      else items.push({ ...shot, result: "You won", detail: record && record.consumedAt !== undefined && record.consumedAt < n.consumedAt ? "Prize already taken." : "", money: `${fmtGeocoin(n.amount)} back`, tone: "mint", moneyTone: "" });
    }
  }
  return items.sort((a, b) => b.at - a.at);
}

export type Ranked = { key: string; who: AccountFelts; value: number; at: number; rank: number };
/** The top 10, and my best row when I am not among them. */
export type Board = { top: Ranked[]; mine: Ranked | null };
type Event = { who: AccountFelts; value: number; at: number };

/** Totals per player; a total's `at` is the block it reached its final value. */
function tally(events: Event[]): Omit<Ranked, "rank">[] {
  const rows = new Map<string, Omit<Ranked, "rank">>();
  for (const e of [...events].sort((a, b) => a.at - b.at)) {
    const key = keyOf(e.who);
    rows.set(key, { key, who: e.who, value: (rows.get(key)?.value ?? 0) + e.value, at: e.at });
  }
  return [...rows.values()];
}

/** High to low; a tie goes to whoever got there first. */
function rank(rows: Omit<Ranked, "rank">[], me: AccountFelts | null): Board {
  const sorted = [...rows].sort((a, b) => b.value - a.value || a.at - b.at || (a.key < b.key ? -1 : 1)).map((r, i) => ({ ...r, rank: i + 1 }));
  const top = sorted.slice(0, 10);
  const mine = top.some((r) => same(r.who, me)) ? null : (sorted.find((r) => same(r.who, me)) ?? null);
  return { top, mine };
}

/**
 * The four boards. Geocoins won: lost shots a champion took, plus prizes (a winner's own Geocoin
 * coming back is not a win). Best records: every record posted, by its score. Defended: every rival who lost at
 * one of the champion's records, open or not. Smashed: records a rival took. Losers: shots a rival
 * lost, the other side of Defended.
 */
export function boards(notes: ChallengeNote[], height: number, me: AccountFelts | null) {
  const gc = (v: bigint) => Number(v) / 10 ** GC_DECIMALS;
  const coins: Event[] = [];
  const defended: Event[] = [];
  const smashed: Event[] = [];
  const losers: Event[] = [];
  for (const n of notes) {
    if (n.kind === "shot") {
      const record = recordOf(n, notes);
      if (!record || shotOutcome(n, height, record) !== "lost") continue;
      defended.push({ who: n.storage.champion, value: 1, at: shotDeadline(n.storage) });
      if (n.storage.rival) losers.push({ who: n.storage.rival, value: 1, at: shotDeadline(n.storage) });
      if (n.consumedAt !== undefined) coins.push({ who: n.storage.champion, value: gc(n.amount), at: n.consumedAt });
      continue;
    }
    const outcome = recordOutcome(n, height);
    const w = outcome === "smashed" ? winner(n, notes, height) : undefined;
    if (w) {
      coins.push({ who: w, value: gc(n.amount), at: n.consumedAt! });
      smashed.push({ who: w, value: 1, at: n.consumedAt! });
    }
  }
  const records = notes.filter((n) => n.kind === "record").map((n) => ({ key: n.id, who: n.storage.champion, value: n.storage.target, at: n.createdAt ?? Infinity }));
  return { coins: rank(tally(coins), me), records: rank(records, me), defended: rank(tally(defended), me), smashed: rank(tally(smashed), me), losers: rank(tally(losers), me) };
}

/** A time, arcade style and local: TODAY 18:42, YESTERDAY 21:10, TOMORROW 09:05, 08 OCT 20:14. */
export function whenLabel(ms: number, now = Date.now()): string {
  const d = new Date(ms);
  const pad = (v: number) => String(v).padStart(2, "0");
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const midnight = (t: Date) => new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
  const days = Math.round((midnight(new Date(now)) - midnight(d)) / 86_400_000);
  if (days === 0) return `TODAY ${time}`;
  if (days === 1) return `YESTERDAY ${time}`;
  if (days === -1) return `TOMORROW ${time}`;
  return `${pad(d.getDate())} ${d.toLocaleString("en", { month: "short" }).toUpperCase()} ${time}`;
}
