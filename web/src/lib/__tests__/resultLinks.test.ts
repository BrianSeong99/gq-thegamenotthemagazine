import { describe, expect, it } from "vitest";
import { resultLinks } from "../flow";
import { STAGES } from "../stages";

describe("free result sharing", () => {
  it("links to free play without carrying record, admin or test-wallet parameters", () => {
    history.replaceState(null, "", "/?record=0xpaid&local=1&admin=1");
    const links = resultLinks(4200, STAGES[3]);
    expect(links.url).toBe(`${location.origin}/`);
    const post = new URL(links.x).searchParams.get("text")!;
    expect(post).toBe(`4200 points on GQ Europe! Play for free.\n${location.origin}/`);
    expect(new URL(links.weibo).searchParams.get("url")).toBe(links.url);
    history.replaceState(null, "", "/");
  });
});
