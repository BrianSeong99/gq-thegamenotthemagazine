import { type ReactNode, useState } from "react";
import { MidenProvider } from "@miden-sdk/react";
import { MidenFiSignerProvider } from "@miden-sdk/miden-wallet-adapter-react";
import { WalletAdapterNetwork } from "@miden-sdk/miden-wallet-adapter-base";
import { APP_NAME, MAINNET, MIDEN_RPC_URL, MIDEN_PROVER } from "@/config";

// MidenProvider sits outside the signer provider: with a signer above it, it would wait for the
// wallet to connect before creating its client, and the app reads the chain before anyone connects.
// One config object for the app's life: a new one makes MidenProvider re-create its client, which
// unmounts the game (the splash click re-renders this, as it turns autoConnect on).
const MIDEN_CONFIG = { rpcUrl: MIDEN_RPC_URL, prover: MIDEN_PROVER, useWorker: true };
/** `autoConnect`: once the game is on (not on the splash), Bread reconnects by itself. */
export function AppProviders({ children, autoConnect }: { children: ReactNode; autoConnect: boolean }) {
  // One refused auto-connect ends them (Bread on another network, a declined sheet): the adapter would
  // otherwise retry without pause. The Connect wallet button still works.
  const [refused, setRefused] = useState(false);
  return (
    <MidenProvider config={MIDEN_CONFIG} loadingComponent={<div>Loading Miden WASM...</div>}>
      <MidenFiSignerProvider
        appName={APP_NAME}
        // the adapter's enum stops at testnet; Bread reads the string and only warns when its own network differs
        network={MAINNET ? ("mainnet" as WalletAdapterNetwork) : WalletAdapterNetwork.Testnet}
        autoConnect={autoConnect && !refused}
        onError={(e) => {
          if (e.name === "WalletConnectionError") setRefused(true);
          console.error(e);
        }}
      >
        {children}
      </MidenFiSignerProvider>
    </MidenProvider>
  );
}
