// Build-time selection only. Additional faucets must be validated before being added here.
const MAINNET_GAMECOIN = "0x34a3510213533f512ec4abe36baf84";
const TESTNET_GAMECOIN = "0xe1f2c48d5bfa8d5173dfcfdc8ac977";
const VALIDATED_TESTNET_GAMECOIN = "0x97924b9a77ed54917ff6d6364ae661";

export function gamecoinFaucet(network: string | undefined, testnetOverride: string | undefined): string {
  if (network !== "testnet") return MAINNET_GAMECOIN;
  if (testnetOverride === undefined) return TESTNET_GAMECOIN;
  if (testnetOverride === VALIDATED_TESTNET_GAMECOIN) return testnetOverride;
  throw new Error("VITE_TESTNET_GAMECOIN_FAUCET_ID must be the validated Testnet Gamecoin faucet: " + VALIDATED_TESTNET_GAMECOIN);
}
