import "@/app/legacy.css";
import "@/app/product.css";
import "@/app/community.css";
import "@/app/weyra-theme.css";
import Link from "next/link";
import { LEGAL_DOCUMENTS } from "@/lib/legal-documents";
import styles from "./legal.module.css";

export const metadata = {
  title: "Cadre juridique - Weyra",
  description: "Conditions, confidentialité et règles communautaires de Weyra.",
};

export default function LegalHubPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}>
          weyra
        </Link>
        <span>CADRE DE CONFIANCE</span>
      </header>
      <section className={styles.hero}>
        <p>DOCUMENTS BÊTA</p>
        <h1>Des règles lisibles avant de demander la confiance.</h1>
        <p>
          Ce socle rend les choix produit explicites. Les mentions d’identité juridique et les durées définitives
          doivent encore être validées avant l’ouverture publique.
        </p>
      </section>
      <section className={styles.grid}>
        {LEGAL_DOCUMENTS.map((document, index) => (
          <Link href={`/legal/${document.slug}`} key={document.slug}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <h2>{document.title}</h2>
            <p>{document.summary}</p>
            <small>{document.status}</small>
          </Link>
        ))}
      </section>
    </main>
  );
}
