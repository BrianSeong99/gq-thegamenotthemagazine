# GeoQuizz web app: notes for agents

GeoQuizz (GQ) is a Miden mainnet game (testnet for development, `VITE_MIDEN_NETWORK=testnet` in `.env.local`). A champion posts a record note (a score to beat and one
Gamecoin); rivals post shot notes, play the same ten-city quiz, and the note scripts recompute the
score. This folder is the React app; the mechanic lives in `../masm/`, its host-side reference and
MockChain tests in `../integration/`. Read `../README.md` and `../docs/design.md` first.

## Where things are

- `src/lib/`: pure rules and chain access. `flow.ts` (decisions, error text), `notes.ts` (storage
  layout), `chain.ts` (reading notes from the node), `bread.ts` (the four transactions),
  `hub.ts` (history, leaderboards), `rules.ts` and `quiz.ts` (GeoQuizz scoring and city picks).
- `src/components/`: screens; `AppContent.tsx` wires them. `src/theme.css` is the one stylesheet.
- `src/**/__tests__/`: vitest. `src/config.ts`: constants (`CLAIM_FUZZ`, faucet id).
- `public/scripts/`: note scripts from `cargo run --release --bin build_scripts`.

## Commands

```sh
yarn dev        # http://localhost:5173, ?local=1 / ?local=2 for in-app test wallets
yarn test       # the full run can hang: run files one by one with `npx vitest run <file>`
yarn lint && yarn typecheck && yarn build
cargo test --release -p integration            # from the repo root; MockChain, a few minutes
cargo run --release --bin build_scripts        # after any change under masm/
```

## Rules that matter

- Failing test first, then the change. Every decision has a test in `src/lib/__tests__/`.
- Mainnet is the default build; test on testnet first. Never commit `keystore*/`, `store*.sqlite3*` or `proposal*.json`.
- No em dashes in any prose or copy. Copy: less is more.
- Bread binds the node's tip (`submit` in `bread.ts`); the app must behave the same on mobile and desktop.
- Error strings in `masm/` are part of a script's root: never change them. Comments are free.
