// Mock of @miden-sdk/react, only the hooks this app uses:
//   vi.mock("@miden-sdk/react", () => import("@/__tests__/mocks/miden-sdk-react"));
// Override one in a test with vi.mocked(useMint).mockReturnValue(...).

import { vi } from "vitest";

const mutation = (key: string) =>
  vi.fn(() => ({ [key]: vi.fn(async () => ({ transactionId: "0xtx" })), result: null, isLoading: false, stage: "idle" as const, error: null, reset: vi.fn() }));

export const useMint = mutation("mint");
export const useConsume = mutation("consume");
export const useTransaction = mutation("execute");

export const useCreateWallet = vi.fn(() => ({ createWallet: vi.fn(async () => ({})), wallet: null, isCreating: false, error: null, reset: vi.fn() }));

// one value across renders, as the real provider memoises them: effects keyed on them run once
const miden = {
  client: null,
  isReady: true,
  isInitializing: false,
  error: null,
  sync: vi.fn(),
  runExclusive: vi.fn(async <T>(fn: () => Promise<T>) => fn()),
  prover: null,
  signerAccountId: null,
  signerConnected: null,
};
export const useMiden = vi.fn(() => miden);

const client = {};
export const useMidenClient = vi.fn(() => client);

export function MidenProvider({ children }: { children: React.ReactNode }) {
  return children;
}
