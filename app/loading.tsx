export default function Loading() {
  return (
    <main className="weyra-system-state" aria-busy="true" aria-live="polite">
      <div className="weyra-system-state__brand">
        <strong>weyra</strong>
        <span>atlas</span>
      </div>
      <div className="weyra-system-state__signal" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <p>Chargement de ton territoire</p>
    </main>
  );
}
