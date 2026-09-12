import "@/app/legacy.css";
import "@/app/product.css";
import "@/app/community.css";
import "@/app/weyra-theme.css";
import type { Metadata } from "next";
import Link from "next/link";
import UpdatePasswordForm from "@/app/account/update-password/UpdatePasswordForm";
import styles from "@/app/login/login.module.css";

export const metadata: Metadata = {
  title: "Nouveau mot de passe | Weyra",
};

export default function UpdatePasswordPage() {
  return (
    <main className={`${styles.page} ${styles.single}`}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}>
          weyra
        </Link>
        <Link href="/" className={styles.back}>
          Retour à l&apos;Atlas
        </Link>
      </header>
      <UpdatePasswordForm />
    </main>
  );
}
