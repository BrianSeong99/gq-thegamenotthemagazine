import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResultShareButtons, ShareButtons } from "../ShareButtons";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("copy sharing", () => {
  it("copies the free score and clean play link, confirming only after the write succeeds", async () => {
    let finish!: () => void;
    const writeText = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<ResultShareButtons score={4200} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy result" }));
    expect(writeText).toHaveBeenCalledWith(`4200 points on GQ! Play for free.\n${location.origin}/`);
    expect(screen.queryByText("Copied!")).not.toBeInTheDocument();
    finish();
    await screen.findByRole("button", { name: "Copied!" });
  });

  it("keeps copying available after the browser rejects clipboard permission", async () => {
    const writeText = vi.fn().mockRejectedValueOnce(new Error("NotAllowedError")).mockResolvedValueOnce(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<ResultShareButtons score={4200} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy result" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("Copied!")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Copy result" }));
    await screen.findByRole("button", { name: "Copied!" });
  });

  it("still copies a paid challenge's record link alone", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<ShareButtons recordId="0xpaid" score={4200} expiresAt={1000} cities={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    await screen.findByRole("button", { name: "Copied!" });
    expect(writeText).toHaveBeenCalledWith(`${location.origin}/?record=0xpaid`);
  });
});
