import { type ReactNode } from "react";
import { MidenProvider } from "@miden-sdk/react";
import { MidenFiSignerProvider } from "@miden-sdk/miden-wallet-adapter-react";
import { WalletAdapterNetwork } from "@miden-sdk/miden-wallet-adapter-base";
import { APP_NAME, MIDEN_RPC_URL, MIDEN_PROVER } from "@/config";

// MidenProvider sits outside the signer provider: with a signer above it, it would wait for the
// wallet to connect before creating its client, and the app reads the chain before anyone connects.
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <MidenProvider
      config={{ rpcUrl: MIDEN_RPC_URL, prover: MIDEN_PROVER, useWorker: true }}
      loadingComponent={<div className="loading">Loading Miden WASM...</div>}
    >
      <MidenFiSignerProvider
        appName={APP_NAME}
        network={WalletAdapterNetwork.Testnet}
        autoConnect={false}
      >
        {children}
      </MidenFiSignerProvider>
    </MidenProvider>
  );
}
