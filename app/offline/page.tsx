import "@/app/legacy.css";
import "@/app/product.css";
import "@/app/community.css";
import "@/app/weyra-theme.css";
import Link from "next/link";
import styles from "./offline.module.css";

export const metadata = {
  title: "Hors ligne - Weyra",
};

export default function OfflinePage() {
  return (
    <main className={styles.page}>
      <section className={styles.panel}>
        <span className={styles.signal} aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <p className={styles.eyebrow}>CONNEXION INDISPONIBLE</p>
        <h1>
          Le ciel est toujours là.
          <br />
          Le réseau revient bientôt.
        </h1>
        <p className={styles.copy}>
          Weyra ne présente pas de radar périmé comme une donnée en direct. Les pages déjà visitées peuvent rester
          disponibles, mais les observations et le radar attendent une connexion fiable.
        </p>
        <div className={styles.actions}>
          <Link href="/">Réessayer</Link>
          <Link href="/status/radar" className={styles.secondary}>
            État du radar
          </Link>
        </div>
        <small>Les données météo mises en cache affichent toujours leur heure de validité.</small>
      </section>
    </main>
  );
}
