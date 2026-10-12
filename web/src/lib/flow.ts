// The app's decisions, as pure functions so they can be tested without React, WASM or Bread.
// Every rule here was once a bug in the component.

import type { ChallengeNote } from "./chain";
import { shotDeadline, ZERO_WORD, type AccountFelts, type ChallengeStorage, type Word4 } from "./notes";
import type { Place } from "./quiz";
import { BLOCK_SECONDS, CLAIM_FUZZ, GC_DECIMALS, GC_FAUCET, RECORD_LIFETIME_BLOCKS, STAKE, V1_ROOTS } from "@/config";
import { QUIZ_MAX, roundScore, type Answer, type City } from "./rules";

export const sameAccount = (a: AccountFelts | null | undefined, b: AccountFelts | null | undefined) =>
  !!a && !!b && a.suffix === b.suffix && a.prefix === b.prefix;

export const isOpen = (n: ChallengeNote, height: number) =>
  !n.consumed && height < (n.kind === "shot" ? shotDeadline(n.storage) : n.storage.expiryBlock);

/** My unconsumed, unexpired shot notes at `record`: one play settles all of them. */
export function myOpenShotsOn(notes: ChallengeNote[], me: AccountFelts | null, record: ChallengeNote, height: number): ChallengeNote[] {
  if (!me) return [];
  return notes.filter(
    (n) =>
      n.kind === "shot" &&
      sameAccount(me, n.storage.rival) &&
      n.storage.recordId.every((f, i) => f === record.idWord[i]) &&
      isOpen(n, height),
  );
}

export type SharedRecordState = "open" | "claimed" | "expired" | "mine" | "already-challenged";

/** What a `?record=<id>` landing page should offer. */
export function sharedRecordState(record: ChallengeNote, me: AccountFelts | null, myOpen: ChallengeNote[], height: number): SharedRecordState {
  if (record.consumed) return "claimed";
  if (height >= record.storage.expiryBlock) return "expired";
  if (sameAccount(me, record.storage.champion)) return "mine";
  if (myOpen.length > 0) return "already-challenged";
  return "open";
}

/** Why a shot cannot be taken right now, or null when it can. */
export function shotRefusal(record: ChallengeNote, height: number, minWindow: number, me?: AccountFelts | null): string | null {
  if (record.consumed) return "This one is over.";
  // the record script runs the champion's path for its own champion: a shot of theirs could never claim it
  if (sameAccount(me, record.storage.champion)) return "This one is yours.";
  if (record.storage.expiryBlock - height < minWindow) return "Too late for this one.";
  const { target, minStake, expiryBlock } = record.storage;
  // terms this game never writes: an unbeatable target, another stake, a record that outlives its day
  if (target >= QUIZ_MAX || minStake !== STAKE || expiryBlock > height + RECORD_LIFETIME_BLOCKS) return "This one is rigged.";
  return null;
}

const sameWord = (a: Word4, b: Word4) => a.every((f, i) => f === b[i]);

export type NoteKind = { kind: "record"; shotRoot: string; v1?: true } | { kind: "shot"; v1?: true };

/** What a note script root means to this app: a record (and the shot script its shots run), a shot, or null for a foreign note. */
export function noteKind(root: string, current: { recordRoot: string; shotRoot: string }): NoteKind | null {
  if (root === current.recordRoot) return { kind: "record", shotRoot: current.shotRoot };
  if (root === current.shotRoot) return { kind: "shot" };
  if (root === V1_ROOTS.record) return { kind: "record", shotRoot: V1_ROOTS.shot, v1: true };
  if (root === V1_ROOTS.shot) return { kind: "shot", v1: true };
  return null;
}

/**
 * Whether a note the node serves under our tag with one of our script roots is one of ours: posted
 * by the account it names (the sender is set by the kernel, the storage by whoever made the note),
 * carrying exactly one asset, the Geocoin, and shaped the way this app writes it. A record names
 * `shotRoot`, the shot script of its own version, so no stranger's script gets to settle shots at it.
 */
export function acceptNote(n: { kind: "record" | "shot"; storage: ChallengeStorage; sender: AccountFelts; assets: { faucet: string; amount: bigint }[] }, shotRoot?: Word4): boolean {
  if (n.assets.length !== 1 || n.assets[0].faucet !== GC_FAUCET) return false;
  const s = n.storage;
  if (n.kind === "record") return sameAccount(n.sender, s.champion) && !s.rival && s.shotDeadline === 0 && sameWord(s.recordId, ZERO_WORD) && !!shotRoot && sameWord(s.shotRoot, shotRoot);
  return sameAccount(n.sender, s.rival) && !sameWord(s.recordId, ZERO_WORD);
}

export type SettlePlan = { won: boolean; claimPrize: boolean; text: string };

/**
 * After a play: a win settles the open shots (and claims the prize if it is still there);
 * a loss sends nothing to the chain, the Geocoin waits for the champion at the deadline.
 */
export function settlePlan(shots: ChallengeNote[], record: ChallengeNote | undefined, score: number, height: number): SettlePlan {
  if (shots.length === 0) throw new Error("no shot note to settle");
  const target = shots[0].storage.target;
  const won = score > target;
  const claimPrize = won && !!record && !record.consumed && record.storage.expiryBlock > height;
  const text = claimPrize
    ? `${score} points. You win!`
    : won
      ? `${score} points. You beat it, but the prize is gone. Your Geocoin comes back.`
      : `${score} points. Not enough. Your Geocoin goes to the champion.`;
  return { won, claimPrize, text };
}

/**
 * The wallet took the request but the chain never showed its effect. Bread answers a dApp as soon
 * as the user approves and can still fail afterwards in its own queue, without telling the dApp.
 */
export const NOT_FINISHED = "It did not go through yet. Nothing is spent until it does, so try again.";

/** A block count as m:ss, at testnet's ~3 s per block. */
export const blocksToClock = (blocks: number) => secondsToClock(Math.max(0, blocks) * BLOCK_SECONDS);

/** m:ss, or h:mm:ss from an hour on. */
export const secondsToClock = (s: number) => {
  const pad = (v: number) => String(v).padStart(2, "0");
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h ? `${h}:${pad(m)}` : m}:${pad(s % 60)}`;
};

/**
 * Before sending a claim: what the chain already says about the shot(s). Before its deadline only
 * the rival can use a shot, and only with a winning answer; from the deadline on only the champion.
 * So a shot used before its deadline was claimed by its rival, one used later was taken.
 */
export function claimVerdict(shots: { consumedAt?: number; deadline: number; v1?: true }[]): "open" | "claimed" | "lost" {
  // the champion collects from deadline + CLAIM_FUZZ (v1: from the deadline); a shot used earlier was ours
  if (shots.some((s) => s.consumedAt !== undefined && s.consumedAt >= s.deadline + (s.v1 ? 0 : CLAIM_FUZZ + 1))) return "lost";
  if (shots.length > 0 && shots.every((s) => s.consumedAt !== undefined)) return "claimed";
  return "open";
}
export const SHOT_LOST = "Too late: your shot ended before the claim. The champion can take your Geocoin.";

export type TroubleKind =
  | "said-no"
  | "no-wallet"
  | "funds"
  | "out-of-step"
  | "not-finished"
  | "network"
  | "not-found"
  | "already-done"
  | "too-late"
  | "other-cities"
  | "refused"
  | "unknown";
/** What went wrong, in one plain sentence, plus the raw text for "What happened?". */
export type Trouble = { kind: TroubleKind; title: string; detail?: string };

const message = (e: unknown) => (e instanceof Error ? `${e.name !== "Error" ? `${e.name}: ` : ""}${e.message}` : String(e));

/** Turns any failure into words a player understands. The raw text stays in `detail`. */
export function explain(e: unknown): Trouble {
  const raw = message(e);
  const t = (kind: TroubleKind, title: string, withDetail = true): Trouble => (withDetail && raw && raw !== title ? { kind, title, detail: raw } : { kind, title });
  if (raw.includes(NOT_FINISHED)) return t("not-finished", NOT_FINISHED, false);
  if (/NOT_GRANTED|reject|declin|denied|cancel/i.test(raw)) return t("said-no", "You said no in your wallet. Nothing was sent.");
  if (/WalletNotReady|not installed/i.test(raw)) return t("no-wallet", "We can't find the Bread wallet. Install it, then try again.");
  if (/WalletNotConnected|not connected|WalletDisconnected/i.test(raw)) return t("no-wallet", "Connect your wallet first.");
  if (/^(\w+: )?You need .*Geocoin/.test(raw)) return t("funds", raw.replace(/^\w+: /, ""), false);
  if (/SummaryAnchorMismatch|chain anchor|ChainBehindBoundBlock|block header for block \d+ not found/i.test(raw))
    return t("out-of-step", "Your wallet was out of step with the network. Try again.");
  if (/^Too late: /.test(raw)) return t("too-late", raw, false);
  if (/already been consumed|already consumed/i.test(raw)) return t("already-done", "This was already done.");
  if (/deadline has passed|too late|is over/i.test(raw)) return t("too-late", "Too late: this one is over.");
  if (/quiz does not match|dataset/i.test(raw)) return t("other-cities", "This record uses another city list. It can't be played here.");
  if (/not found on chain|is not public|not a record or shot|not GeoQuizz game data|Not found/i.test(raw)) return t("not-found", "We can't find that record. Check the link.");
  if (/assertion failed|error code/i.test(raw)) return t("refused", "The game said no to this move.");
  if (/fetch|network|timed out|timeout|deadline exceeded|unavailable|transport|ECONN|50[234]|load failed|faucet|mempool/i.test(raw))
    return t("network", "The Miden network is slow or busy right now. Try again in a moment.");
  return t("unknown", "Something went wrong.");
}

/** Rejects with "<what> timed out" (a network trouble) when `p` takes longer than `ms`. */
export function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} timed out after ${Math.round(ms / 1000)} s`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

/** The outcome line after Bread accepted a request: only a chain-confirmed effect is "confirmed". */
export function outcomeText(action: string, seenOnChain: boolean): string {
  const sentence = /[.!?]$/.test(action) ? action : `${action}.`;
  return seenOnChain ? `${sentence} Done!` : `${action}… not done yet. Check your wallet.`;
}

/** Bread had not synced up to the block the request binds yet. */
export const isChainBehind = (e: unknown) => /ChainBehindBoundBlock|has not reached that block/i.test(e instanceof Error ? e.message : String(e));

/** Submits up to `retries` times, retrying only while Bread is behind; `attempt(n)` rebuilds at the fresh tip. */
export async function submitWithRetry<T>(attempt: (n: number) => Promise<T>, retries: number): Promise<T> {
  for (let n = 1; ; n++) {
    try {
      return await attempt(n);
    } catch (e) {
      if (!isChainBehind(e) || n >= retries) throw e;
    }
  }
}

/** An amount of Geocoin in words: "1 Geocoin", "10 Geocoins". */
export function fmtGeocoin(v: bigint): string {
  const n = Number(v) / 10 ** GC_DECIMALS;
  return `${n.toLocaleString(undefined, { maximumFractionDigits: GC_DECIMALS })} Geocoin${n === 1 ? "" : "s"}`;
}

/** The page's address without the record it was opened for (other parameters, like ?local=, stay). */
export function withoutRecord(href: string): string {
  const url = new URL(href);
  url.searchParams.delete("record");
  url.searchParams.delete("prize");
  return url.toString();
}

/** A moment in UTC, for readers anywhere: 13 Oct 14:05 UTC. */
export function utcLabel(ms: number): string {
  const d = new Date(ms);
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${pad(d.getUTCDate())} ${d.toLocaleString("en", { month: "short", timeZone: "UTC" })} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

// the X post: one of these, the record picks which (so a record always shares the same line)
const POSTS: ((score: number, until: string) => string)[] = [
  (score, until) => `${score} points on GQ 😎\nInstall @joinbread & beat my record before ${until}:`,
  (score, until) => `My GQ record: ${score} points, open until ${until}.\nInstall @joinbread & beat it:`,
  (score, until) => `${score} points. One Geocoin says you can't beat it before ${until}.\nInstall @joinbread & prove me wrong:`,
  (score, until) => `Know your geography? ${score} points to beat on GQ until ${until}.\nInstall @joinbread & take a shot:`,
  (score, until) => `10 cities, 15 seconds each, ${score} points. Your move, until ${until}.\nInstall @joinbread & play GQ:`,
  (score, until) => `Champion of GQ with ${score} points, for now. Record expires ${until}.\nInstall @joinbread & come take it:`,
  (score, until) => `I set ${score} points on GQ. Beat it before ${until} and my Geocoin is yours.\nInstall @joinbread & try:`,
  (score, until) => `Rivals wanted: ${score} points on GQ, open until ${until} 🌍\nInstall @joinbread & take your shot:`,
];

// a run with one of these gets a line about it: hard ones to brag, easy ones to tease
const HARD_CITIES = ["Funafuti", "Palikir", "Melekeok", "Majuro", "Tarawa", "Nuku'alofa", "Apia", "Honiara", "Port Vila", "Moroni", "Malé", "Bir Lehlou", "Lobamba", "Mbabane", "Maseru", "Sri Jayawardenepura Kotte", "Bandar Seri Begawan", "Naypyidaw", "Thimphu", "Ashgabat", "Dushanbe", "Bishkek", "Nur-Sultan", "Dili", "Basseterre", "Castries", "Roseau", "Kingstown", "Saint George's", "Saint John's", "Belmopan", "Paramaribo", "Bujumbura", "Lilongwe", "Gaborone", "Bissau", "Banjul", "Praia", "São Tomé", "Malabo", "Hargeisa", "Laayoune", "Vaduz", "Podgorica", "Chișinău", "Sucre", "Putrajaya", "Ürümqi", "Baguio", "Dodoma", "Bloemfontein"];
const EASY_CITIES = ["Paris", "London", "New York", "Tokyo", "Rome", "Berlin", "Madrid", "Moscow", "Beijing", "Sydney", "Cairo", "Rio de Janeiro", "Los Angeles", "San Francisco", "Dubai", "Istanbul", "Amsterdam", "Singapore", "Hong Kong", "Mexico City", "Buenos Aires", "Lisbon", "Athens", "Mumbai", "Bangkok", "Seoul", "Shanghai", "Cape Town", "Toronto", "Chicago", "Miami", "Vienna", "Prague", "Dublin"];
const HARD_POSTS: ((score: number, until: string, city: string) => string)[] = [
  (score, until, city) => `${city}. Yes, I know where that is. ${score} points on GQ until ${until}.\nInstall @joinbread & find it faster:`,
  (score, until, city) => `Can you place ${city} in 15 seconds? I did. ${score} points to beat before ${until}.\nInstall @joinbread & try:`,
];
const EASY_POSTS: ((score: number, until: string, city: string) => string)[] = [
  (score, until, city) => `You know where ${city} is, right? ${score} points to beat before ${until}.\nInstall @joinbread & play GQ:`,
  (score, until, city) => `My run had ${city} in it. ${score} points on GQ, open until ${until}.\nInstall @joinbread & do better:`,
];

/**
 * The shareable link to a record, and the X post that carries it; `expiresAt` is the record's expiry
 * in ms, `cities` the names of its run. A hard city gets bragged about, an easy one teased with.
 */
export function recordLinks(recordId: string, score: number, expiresAt: number, cities: string[] = []) {
  const url = `${location.origin}${location.pathname}?record=${recordId}`;
  const pick = [...recordId].reduce((sum, c) => sum + c.charCodeAt(0), 0);
  const hard = cities.filter((c) => HARD_CITIES.includes(c));
  const easy = cities.filter((c) => EASY_CITIES.includes(c));
  const until = utcLabel(expiresAt);
  const text = hard.length
    ? HARD_POSTS[pick % HARD_POSTS.length](score, until, hard[pick % hard.length])
    : easy.length
      ? EASY_POSTS[pick % EASY_POSTS.length](score, until, easy[pick % easy.length])
      : POSTS[pick % POSTS.length](score, until);
  return { url, x: `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}` };
}

export type ReportRow = { name: string; seconds: string; points: number };

/** The run report: one row per city, time as the player saw it, points as the chain scores them. */
export function reportRows(cities: City[], answers: Answer[], places: Place[]): ReportRow[] {
  return cities.map((c, i) => ({
    name: places[c.idx]?.name ?? `city #${c.idx}`,
    seconds: `${(answers[i].t / 100).toFixed(1)}s`,
    points: roundScore(c, answers[i]),
  }));
}

/**
 * What a pasted code means: a record id from a GeoQuizz link, from our X share link (the GeoQuizz
 * link travels inside it, URL-encoded), or typed as is. A posted X status URL cannot be read from
 * the browser, so it gets a hint instead.
 */
export function parseCode(text: string): { id: string } | { hint: string } {
  const decoded = (() => {
    try {
      return decodeURIComponent(text);
    } catch {
      return text;
    }
  })();
  const id = /0x[0-9a-f]{64}/i.exec(decoded)?.[0];
  if (id) return { id: id.toLowerCase() };
  if (/x\.com\/[^/]+\/status\/|twitter\.com\/[^/]+\/status\//i.test(text)) return { hint: "Open the post and copy the GeoQuizz link." };
  return { hint: "That is not a GeoQuizz code." };
}
