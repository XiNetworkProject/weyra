"use client";

import { useEffect } from "react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Weyra application error", error);
  }, [error]);

  return (
    <main className="weyra-system-state weyra-system-state--error">
      <div className="weyra-system-state__brand">
        <strong>weyra</strong>
        <span>atlas</span>
      </div>
      <span className="weyra-system-state__code">Connexion interrompue</span>
      <h1>Le territoire ne répond pas encore.</h1>
      <p>Weyra a rencontré un problème temporaire. Tes données locales restent intactes.</p>
      <button type="button" onClick={reset}>Réessayer</button>
    </main>
  );
}
