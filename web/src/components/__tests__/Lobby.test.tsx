// The lobby is a pure view: given notes, the connected account and the chain height, it must
// show exactly the actions the rules allow.
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GC_FAUCET } from "@/config";
import type { ChallengeNote } from "@/lib/chain";
import type { ChallengeStorage } from "@/lib/notes";
import { encodeGame } from "@/lib/quiz";
import { Lobby } from "../Lobby";

const champion = { suffix: 1n, prefix: 2n };
const me = { suffix: 3n, prefix: 4n };
const base: ChallengeStorage = {
  expiryBlock: 1000,
  target: 2000,
  minStake: 1_000_000n,
  champion,
  rival: null,
  recordId: [0n, 0n, 0n, 0n],
  shotRoot: [1n, 1n, 1n, 1n],
  game: [],
  shotDeadline: 0,
};
const places = [{ name: "Funafuti", country: "Tuvalu", lat: 0, lon: 0 }];
const game = encodeGame({ seed: [0n, 0n, 0n, 0n], dataset: [0n, 0n, 0n, 0n], cities: Array.from({ length: 10 }, () => ({ idx: 0, lat: 0, lon: 0, cos: 0 })) });
const prize: ChallengeNote = { id: "0xp", idWord: [9n, 9n, 9n, 9n], kind: "record", storage: { ...base, game }, faucet: GC_FAUCET, amount: 1_000_000n, consumed: false };
const myShot: ChallengeNote = {
  id: "0xc",
  idWord: [1n, 1n, 1n, 1n],
  kind: "shot",
  storage: { ...prize.storage, rival: me, recordId: [9n, 9n, 9n, 9n], shotDeadline: 200 },
  faucet: GC_FAUCET,
  amount: 1_000_000n,
  consumed: false,
};

const handlers = () => ({ onSettle: vi.fn(), onCollect: vi.fn() });

describe("Lobby", () => {
  it("never lists other people's records: those are in Champion vs Rival", () => {
    render(<Lobby me={me} notes={[prize]} places={places} height={100} {...handlers()} />);
    expect(screen.queryByText(/3750|2000/)).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows the champion their own record, and take-it-back only CLAIM_FUZZ blocks past expiry (a claim may land until then)", () => {
    const h = handlers();
    const { rerender } = render(<Lobby me={champion} notes={[prize]} places={places} height={100} {...h} />);
    expect(screen.queryByRole("button", { name: /take it back/i })).toBeNull();
    expect(screen.getByText(/waiting for a rival/i)).toBeInTheDocument();
    // 900 blocks left: 45 minutes from now, as a clock time like the history's
    expect(screen.getByText(/^My record \/ open until (TODAY|TOMORROW) \d\d:\d\d$/)).toBeInTheDocument();
    // an open record can be shared again from the hub
    const href = screen.getByRole("link", { name: /share on x/i }).getAttribute("href")!;
    expect(href).toContain(encodeURIComponent("?record=0xp"));
    expect(decodeURIComponent(href)).toContain("Funafuti");
    expect(screen.queryByText(/on it/i)).toBeNull();
    rerender(<Lobby me={champion} notes={[prize]} places={places} height={1063} {...h} />);
    expect(screen.queryByRole("button", { name: /take it back/i })).toBeNull();
    rerender(<Lobby me={champion} notes={[prize]} places={places} height={1064} {...h} />);
    fireEvent.click(screen.getByRole("button", { name: /take it back/i }));
    expect(h.onCollect).toHaveBeenCalledWith([prize]);
  });

  it("offers Play & settle on my open shot with its record; once its deadline passed the card is gone (it is history)", () => {
    const h = handlers();
    const { rerender } = render(<Lobby me={me} notes={[prize, myShot]} places={places} height={100} {...h} />);
    fireEvent.click(screen.getByRole("button", { name: /^play$/i }));
    expect(h.onSettle).toHaveBeenCalledWith(myShot, prize);
    rerender(<Lobby me={me} notes={[prize, myShot]} places={places} height={200} {...h} />);
    expect(screen.queryByText(/my shot/i)).toBeNull();
  });

  it("never offers to take a shot I posted at my own record: the script serves its rival first, so it stays locked", () => {
    const own = { ...myShot, storage: { ...myShot.storage, rival: champion } };
    render(<Lobby me={champion} notes={[prize, own]} places={places} height={1000} {...handlers()} />);
    expect(screen.queryByRole("button", { name: /take it/i })).toBeNull();
  });

  it("lets the champion collect a shot only from its deadline + CLAIM_FUZZ on", () => {
    const h = handlers();
    const { rerender } = render(<Lobby me={champion} notes={[prize, myShot]} places={places} height={263} {...h} />);
    expect(screen.queryByRole("button", { name: /take it/i })).toBeNull();
    rerender(<Lobby me={champion} notes={[prize, myShot]} places={places} height={264} {...h} />);
    fireEvent.click(screen.getByRole("button", { name: /take it/i }));
    expect(h.onCollect).toHaveBeenCalledWith([myShot]);
    expect(screen.queryByRole("button", { name: /take all/i })).toBeNull();
  });

  it("takes everything the champion is owed in one go: lost shots and expired records", () => {
    const h = handlers();
    const second = { ...myShot, id: "0xc2", idWord: [2n, 2n, 2n, 2n] as [bigint, bigint, bigint, bigint] };
    render(<Lobby me={champion} notes={[prize, myShot, second]} places={places} height={1064} {...h} />);
    fireEvent.click(screen.getByRole("button", { name: /take all/i }));
    expect(h.onCollect).toHaveBeenCalledWith([prize, myShot, second]);
  });

  it("blinks every take button: Gamecoins are waiting", () => {
    render(<Lobby me={champion} notes={[prize, myShot]} places={places} height={1064} {...handlers()} />);
    for (const b of screen.getAllByRole("button", { name: /take/i })) expect(b.className).toContain("blink");
  });

  it("counts the tries lost so far on my open record, never naming who lost", () => {
    const lost = { ...myShot, storage: { ...myShot.storage, rival: { suffix: 7n, prefix: 7n } } };
    const { rerender } = render(<Lobby me={champion} notes={[prize, lost]} places={places} height={199} {...handlers()} />);
    expect(screen.queryByText(/lost so far/i)).toBeNull();
    rerender(<Lobby me={champion} notes={[prize, lost, { ...lost, id: "0xc2" }]} places={places} height={200} {...handlers()} />);
    expect(screen.getByText("2 tries lost so far")).toBeInTheDocument();
  });

  it("hides consumed notes", () => {
    render(<Lobby me={me} notes={[{ ...prize, consumed: true }]} places={places} height={100} {...handlers()} />);
    expect(screen.queryByRole("button", { name: /play/i })).toBeNull();
  });
});
