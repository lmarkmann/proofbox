import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

type ApiHealth = { status: string; version: string };

export function App() {
  const [health, setHealth] = useState<ApiHealth | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((response) => response.json())
      .then(setHealth)
      .catch(() => setHealth(null));
  }, []);

  return (
    <main className="flex min-h-svh flex-col items-start gap-4 p-6">
      <img src="/proofbox-wordmark.svg" alt="ProofBox" className="h-10 dark:invert" />
      <p className="text-sm text-muted-foreground">
        API: {health ? `${health.status} (v${health.version})` : "unreachable"}
      </p>
      <Button>Start</Button>
    </main>
  );
}

export default App;
