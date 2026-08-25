import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import AuthPanel from "@/app/login/AuthPanel";
import { IconCloudRain, IconCompass, IconUsers } from "@/components/atlas/icons";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import styles from "@/app/login/login.module.css";

export const metadata: Metadata = {
  title: "Connexion | Weyra",
  description: "Rejoins Weyra et contribue aux observations météo de ton territoire.",
};

export default function LoginPage() {
  return (
    <main className={styles.page}>
      <div className={styles.map} aria-hidden="true">
        <i />
        <i />
        <i />
      </div>

      <header className={styles.header}>
        <Link href="/" className={styles.brand}>weyra</Link>
        <Link href="/" className={styles.back}>Retour à l&apos;Atlas</Link>
      </header>

      <section className={styles.intro}>
        <span className={styles.kicker}>Le ciel, vécu ensemble</span>
        <h1>Ton territoire.<br />Tes observations.</h1>
        <p>Retrouve tes lieux, contribue aux signaux locaux et rejoins les communautés météo qui comptent pour toi.</p>
        <div className={styles.features}>
          <span><IconCompass /><b>Atlas personnel</b><small>Lieux, alertes et carnet synchronisés</small></span>
          <span><IconCloudRain /><b>Observations utiles</b><small>Signaux terrain horodatés et modérés</small></span>
          <span><IconUsers /><b>Communautés locales</b><small>Espaces organisés autour d&apos;un territoire</small></span>
        </div>
      </section>

      <Suspense fallback={<div className={styles.panel}>Préparation de ton espace Weyra...</div>}>
        <AuthPanel configured={isSupabaseConfigured()} />
      </Suspense>
    </main>
  );
}
