import path from "node:path";
import { defineConfig, loadEnv } from "vite";
import { gamecoinFaucet } from "./src/gamecoinConfig";
import react from "@vitejs/plugin-react";
import { midenVitePlugin } from "@miden-sdk/vite-plugin";

// The site's public address, for link previews (absolute URLs in index.html). SITE_URL wins; on
// Vercel the production domain is known at build time (a custom domain once one is added);
// otherwise the vercel.app address.
const siteUrl =
  process.env.SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "https://gq-thegamenotthemagazine.vercel.app");

// On iPhone (Safari and every iOS browser) the SDK runs its classic worker, which fetches
// "assets/miden_client_web.wasm" relative to its own /assets/ URL, a path Vite never emits: a 404 there,
// which Safari reports as a wasm MIME type error. Emit the wasm right there instead; Vercel serves every
// asset with must-revalidate, so the missing hash costs nothing. `yarn build` fails if it goes missing.
const assetFileNames = (a: { names?: string[] }) =>
  (a.names?.[0] ?? "").endsWith(".wasm") ? "assets/assets/miden_client_web.wasm" : "assets/[name]-[hash][extname]";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  // Reject an invalid Testnet asset before producing a build or starting the dev server.
  gamecoinFaucet(env.VITE_MIDEN_NETWORK, env.VITE_TESTNET_GAMECOIN_FAUCET_ID);
  return {
    // page and worker builds both emit the wasm at the one path the classic worker can find
    build: { rollupOptions: { output: { assetFileNames } } },
    worker: { rollupOptions: { output: { assetFileNames } } },
    plugins: [
      react(),
      midenVitePlugin({ crossOriginIsolation: true }),
      { name: "site-url", transformIndexHtml: (html) => html.replaceAll("%SITE_URL%", siteUrl.replace(/\/$/, "")) },
    ],
    resolve: {
      dedupe: ["react", "react-dom", "react/jsx-runtime"],
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
