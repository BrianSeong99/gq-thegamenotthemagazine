// The Miden client is re-created whenever MidenProvider's config changes identity, which unmounts
// the whole game: the config must be the same object across renders (the splash click flips autoConnect).
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const configs: unknown[] = [];
vi.mock("@miden-sdk/react", () => ({ MidenProvider: ({ config, children }: { config: unknown; children: React.ReactNode }) => (configs.push(config), children) }));
vi.mock("@miden-sdk/miden-wallet-adapter-react", () => ({ MidenFiSignerProvider: ({ children }: { children: React.ReactNode }) => children }));

import { AppProviders } from "@/providers";

describe("AppProviders", () => {
  it("hands MidenProvider the same config object when autoConnect flips", () => {
    const { rerender } = render(<AppProviders autoConnect={false}>x</AppProviders>);
    rerender(<AppProviders autoConnect={true}>x</AppProviders>);
    expect(configs.length).toBeGreaterThanOrEqual(2);
    expect(configs[1]).toBe(configs[0]);
  });
});
