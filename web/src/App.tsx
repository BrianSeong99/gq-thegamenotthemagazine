import { useState } from "react";
import { AppProviders } from "@/providers";
import { AppContent } from "@/components/AppContent";

export default function App() {
  // Bread reconnects by itself only once the splash is behind
  const [inGame, setInGame] = useState(false);
  return (
    <AppProviders autoConnect={inGame}>
      <AppContent onStarted={() => setInGame(true)} />
    </AppProviders>
  );
}
