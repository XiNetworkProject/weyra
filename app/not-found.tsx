import Link from "next/link";

export default function NotFound() {
  return (
    <main className="weyra-system-state weyra-system-state--error">
      <div className="weyra-system-state__brand">
        <strong>weyra</strong>
        <span>atlas</span>
      </div>
      <span className="weyra-system-state__code">404 · Hors zone</span>
      <h1>Cette destination n’existe pas.</h1>
      <p>Reviens à l’Atlas pour retrouver tes lieux, tes observations et tes communautés.</p>
      <Link href="/">Ouvrir Weyra</Link>
    </main>
  );
}
