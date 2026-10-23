import { afterEach, describe, expect, it, vi } from "vitest";

const ownTestnetGamecoin = "0x97924b9a77ed54917ff6d6364ae661";

async function config(network: string | undefined, faucet: string | undefined) {
  vi.resetModules();
  vi.stubEnv("VITE_MIDEN_NETWORK", network);
  vi.stubEnv("VITE_TESTNET_GAMECOIN_FAUCET_ID", faucet);
  return import("../config");
}

afterEach(() => vi.unstubAllEnvs());

describe("Gamecoin network configuration", () => {
  it("keeps canonical Mainnet Gamecoin by default", async () => {
    expect((await config(undefined, undefined)).GC_FAUCET).toBe("0x34a3510213533f512ec4abe36baf84");
  });

  it.each([ownTestnetGamecoin, "invalid", ""])("ignores Testnet override %j on Mainnet", async (faucet) => {
    expect((await config("mainnet", faucet)).GC_FAUCET).toBe("0x34a3510213533f512ec4abe36baf84");
  });

  it("keeps the upstream Testnet faucet without an override", async () => {
    expect((await config("testnet", undefined)).GC_FAUCET).toBe("0xe1f2c48d5bfa8d5173dfcfdc8ac977");
  });

  it("selects the validated Testnet Gamecoin only for an explicit Testnet build", async () => {
    expect((await config("testnet", ownTestnetGamecoin)).GC_FAUCET).toBe(ownTestnetGamecoin);
  });

  it.each(["", "invalid", "0x97924b9a77ed54917ff6d6364ae66", "0x071d3da3ad56d88175b628f76073cb", "0x34a3510213533f512ec4abe36baf84"])(
    "rejects an empty, malformed or unvalidated Testnet override %j", async (faucet) => {
      await expect(config("testnet", faucet)).rejects.toThrow("VITE_TESTNET_GAMECOIN_FAUCET_ID");
    },
  );
});
