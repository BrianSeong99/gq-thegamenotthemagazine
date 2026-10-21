import { AccountId, type TransactionRequest } from "@miden-sdk/miden-sdk";
import { describe, expect, it, vi } from "vitest";
import authVectors from "../../../../rules/auth_vectors.json";
import { GC_FAUCET } from "@/config";
import type { Client } from "../chain";
import type { Word4 } from "../quiz";
import { authArgElements, collect, multisigAuthArgs, type Wallet } from "../bread";

// the node's tip, as the app reads it before building a request
const node = vi.hoisted(() => ({ tip: 0 }));
vi.mock("@miden-sdk/miden-sdk", async (actual) => ({
  ...(await actual<typeof import("@miden-sdk/miden-sdk")>()),
  RpcClient: class {
    getBlockHeaderByNumber = async () => ({ blockNum: () => node.tip });
    free() {}
  },
}));
vi.mock("../chain", async (actual) => ({ ...(await actual<typeof import("../chain")>()), fetchNotesWithProof: async () => ({ inputs: [], files: [] }) }));
vi.mock("@miden-sdk/miden-wallet-adapter-base", () => ({ Transaction: { createCustomTransaction: (_from: string, _to: string, request: TransactionRequest) => request } }));

describe("multisig auth args", () => {
  it("lay out the 12 felts exactly as miden-standards does", () => {
    for (const v of authVectors) {
      const salt = v.salt.map(BigInt) as Word4;
      // the reference vector carries the faucet's felts at positions 8 and 9
      const faucet = { suffix: BigInt(v.elements[8]), prefix: BigInt(v.elements[9]) };
      expect(authArgElements(v.bound_block, salt, faucet).map(String)).toEqual(v.elements);
    }
  });

  it("commit to them with the same Poseidon2 hash as the Rust reference", () => {
    for (const v of authVectors) {
      const { commitment } = multisigAuthArgs(v.bound_block, v.salt.map(BigInt) as Word4, AccountId.fromHex(v.fee_faucet));
      expect(commitment.toHex()).toBe(v.commitment);
    }
  });
});

describe("handing a request to Bread", () => {
  const client = { feeFaucetId: async () => AccountId.fromHex(GC_FAUCET) } as unknown as Client;
  const sent: TransactionRequest[] = [];
  const wallet = (answers: (() => Promise<string>)[]): Wallet => ({
    address: "mtst1me",
    requestAssets: async () => [],
    requestTransaction: async (tx: unknown) => {
      sent.push(tx as TransactionRequest);
      return answers.shift()!();
    },
  });
  const bound = (r: TransactionRequest) => r.blockNumbers();

  it("binds the block the node is at, never one ahead: Bread refuses a block its own sync has not reached", async () => {
    sent.length = 0;
    node.tip = 169676;
    await expect(collect(client, wallet([async () => "0xtx"]), [])).resolves.toMatchObject({ txId: "0xtx" });
    expect(sent.map(bound)).toEqual([[169676]]);
  });

  it("rebuilds at the node's fresh tip when Bread was still behind, and gives up on any other error", async () => {
    sent.length = 0;
    node.tip = 169676;
    const behind = Object.assign(new Error("the Miden client synced to block 169675, below block 169676 the proposal binds; its node has not reached that block yet"), { name: "ChainBehindBoundBlockError" });
    const answers = [async () => ((node.tip = 169677), Promise.reject(behind)), async () => "0xtx"];
    await expect(collect(client, wallet(answers), [])).resolves.toMatchObject({ txId: "0xtx" });
    expect(sent.map(bound)).toEqual([[169676], [169677]]);

    sent.length = 0;
    await expect(collect(client, wallet([async () => Promise.reject(new Error("NOT_GRANTED"))]), [])).rejects.toThrow(/NOT_GRANTED/);
    expect(sent).toHaveLength(1);
  });
});
