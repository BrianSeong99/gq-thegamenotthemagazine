// GQ (GeoQuizz) on Miden testnet v0.17.

export const APP_NAME = "GQ GeoQuizz";

// Gamecoin (GC): a fungible faucet on testnet anyone may mint from (`cargo run --bin gamecoin deploy`).
export const GC_FAUCET = import.meta.env.VITE_GC_FAUCET ?? "0x6a8e2ccb2090bcd1071cea18da2cce";
// Geocoin, the coin before 2026-10-14: nothing new is minted, what people hold still plays. A shot
// must stake the asset of its record (the script checks), so a Geocoin record wants Geocoin shots.
export const GEOCOIN_FAUCET = "0x2a85bbc7c655b6d116381742015892";
export const STAKE_FAUCETS = [GC_FAUCET, GEOCOIN_FAUCET];
export const GC_DECIMALS = 6;

// The stake of the GeoQuizz UI: the champion puts it in the record note, each rival puts the
// same amount in their shot note. The contracts only know `min_stake`.
export const STAKE: bigint = BigInt(import.meta.env.VITE_GC_STAKE ?? "1000000"); // 1 GC
// Testnet makes a block about every 3 s.
export const BLOCK_SECONDS = 3;
// A record stays open about a day: time for people to see the post and come play.
export const RECORD_LIFETIME_BLOCKS = Math.round((24 * 3600) / BLOCK_SECONDS); // 28 800
// A shot must be settled within ~1 play of the game (10 cities x 15 s, plus proving), so a
// rival cannot sit on a stake and rehearse the same ten cities.
export const SHOT_WINDOW_BLOCKS = Math.round((3 * 60) / BLOCK_SECONDS); // 60
// Refuse a shot at a record that will expire before the shot window ends.
export const MIN_SHOT_WINDOW_BLOCKS = SHOT_WINDOW_BLOCKS + 20;

// The two development wallets (?local=1 and ?local=2): their test rounds stay off the leaderboards
// and out of the nickname order.
export const TEST_ACCOUNTS = ["0x071d3da3ad56d88175b628f76073cb", "0x35b6665ae257d50144a45872cf5b50"];

// Where the assembled note scripts live (written by `cargo run --bin build_scripts`).
export const RECORD_SCRIPT_URL = "/scripts/record.bin";
export const SHOT_SCRIPT_URL = "/scripts/shot.bin";
// The v1 scripts: the champion collected at the deadline itself, not CLAIM_FUZZ blocks later. Their
// notes stay on the boards and in histories for good, so their roots stay here; the v1 shot script
// is what a shot at a v1 record runs, so the app serves it too.
export const V1_ROOTS = {
  record: "0xf5c76231f25a67b72beb4044d34387ef9f54e163303c896a2ca7847ace21227f",
  shot: "0xc0dca0ae35c0f0aa35c48f388b282b08902399353405078742d5aba63f797367",
};
export const SHOT_SCRIPT_V1_URL = "/scripts/v1/shot.bin";
// masm/challenge/challenge_core.masm CLAIM_FUZZ: how late a claim proved before a deadline may land.
export const CLAIM_FUZZ = 64;
export const CITIES_URL = "/cities.json";
// The cities' names and countries in a language, by index of cities.json (shown, never hashed).
export const placesUrl = (lang: string) => `/places.${lang}.json`;

export const NETWORK_POLL_INTERVAL_MS = 2_500;
export const NETWORK_POLL_TIMEOUT_MS = 120_000;

// Miden SDK configuration, overridable through environment variables
export const MIDEN_RPC_URL = import.meta.env.VITE_MIDEN_RPC_URL ?? "testnet";
export const MIDEN_FAUCET_URL =
  import.meta.env.VITE_MIDEN_FAUCET_URL ?? (MIDEN_RPC_URL === "testnet" ? "https://faucet-api.testnet.miden.io" : "");
export const MIDEN_PROVER = (import.meta.env.VITE_MIDEN_PROVER as "devnet" | "testnet" | "local") ?? "testnet";
