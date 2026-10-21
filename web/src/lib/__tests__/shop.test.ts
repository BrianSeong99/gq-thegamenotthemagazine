// The Gamecoin shop: sale notes (PSWAP) anyone may post; the game buys from the cheapest one at or under the price.
import { describe, expect, it } from "vitest";
import { GC_FAUCET, GC_PRICE } from "@/config";
import { acceptSale, payFor, pickSale, pswapTag, type Sale } from "../shop";

const PAY = "0x4cbdcaffe75f0a317482224dae6436";
const GC = 1_000_000n;
// 10 GC for 0.01 of the pay asset: the official price
const sale = (over: Partial<Sale> = {}): Sale => ({ id: "0xs", creator: "0xc", gcFaucet: GC_FAUCET, payFaucet: PAY, offered: 10n * GC, asked: 10n * GC_PRICE, minFill: 0n, ...over });

describe("a sale note the game buys from", () => {
  it("is found under the pair's PSWAP tag (the tag of the sale notes posted on testnet)", () => {
    expect(pswapTag(PAY)).toBe(1663724108);
  });


  it("offers Gamecoin, asks the pay asset, at or under the official price", () => {
    expect(acceptSale(sale(), PAY)).toBe(true);
    expect(acceptSale(sale({ asked: 10n * GC_PRICE - 1n }), PAY)).toBe(true);
    expect(acceptSale(sale({ asked: 10n * GC_PRICE + 1n }), PAY)).toBe(false);
    expect(acceptSale(sale({ gcFaucet: "0xother" }), PAY)).toBe(false);
    expect(acceptSale(sale({ payFaucet: "0xother" }), PAY)).toBe(false);
    expect(acceptSale(sale({ offered: 0n }), PAY)).toBe(false);
    expect(acceptSale(sale({ asked: 0n }), PAY)).toBe(false);
  });

  it("charges the sale's own price, rounded up to the base unit", () => {
    expect(payFor(2n * GC, sale())).toBe(2n * GC_PRICE);
    expect(payFor(1n, sale())).toBe(1n);
    expect(payFor(3n * GC, sale({ asked: 10n * GC_PRICE - 1n }))).toBe(3n * GC_PRICE);
  });

  it("picks the cheapest sale with enough left and a fill floor the buy clears, the largest among equals", () => {
    const cheap = sale({ id: "cheap", asked: 5n * GC_PRICE });
    const big = sale({ id: "big", offered: 100n * GC, asked: 100n * GC_PRICE });
    const small = sale({ id: "small", offered: 1n * GC, asked: 1n * GC_PRICE });
    const floored = sale({ id: "floored", asked: 4n * GC_PRICE, minFill: 3n * GC_PRICE });
    expect(pickSale([small, big, cheap], 2n * GC)?.id).toBe("cheap");
    expect(pickSale([small, big], 2n * GC)?.id).toBe("big");
    expect(pickSale([small, sale({ id: "ten" })], 2n * GC)?.id).toBe("ten");
    expect(pickSale([small], 2n * GC)).toBeUndefined();
    // the floor is in the pay asset: 3 GC at this price pays 1.2, under the floor of 3
    expect(pickSale([floored, big], 3n * GC)?.id).toBe("big");
    expect(pickSale([floored, big], 8n * GC)?.id).toBe("floored");
    expect(pickSale([], 1n * GC)).toBeUndefined();
  });

  it("never picks the buyer's own sale (its creator consuming it takes the whole remainder back)", () => {
    expect(pickSale([sale()], 1n * GC, "0xc")).toBeUndefined();
    expect(pickSale([sale(), sale({ id: "other", creator: "0xd" })], 1n * GC, "0xc")?.id).toBe("other");
  });
});
