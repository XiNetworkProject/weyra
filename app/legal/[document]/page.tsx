import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LEGAL_DOCUMENTS, legalDocument } from "@/lib/legal-documents";
import styles from "../legal.module.css";

type PageProps = { params: Promise<{ document: string }> };

export function generateStaticParams() {
  return LEGAL_DOCUMENTS.map((document) => ({ document: document.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const value = legalDocument((await params).document);
  return value ? { title: `${value.title} - Weyra`, description: value.summary } : {};
}

export default async function LegalDocumentPage({ params }: PageProps) {
  const document = legalDocument((await params).document);
  if (!document) notFound();

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}>
          weyra
        </Link>
        <Link href="/legal">Tous les documents</Link>
      </header>
      <article className={styles.document}>
        <div className={styles.documentTitle}>
          <p>CADRE DE CONFIANCE</p>
          <h1>{document.title}</h1>
          <p>{document.summary}</p>
          <small>{document.status}</small>
        </div>
        <aside className={styles.notice}>
          Document de pré-bêta. Il structure le produit mais ne remplace pas la validation d’un professionnel du droit
          avant publication au public.
        </aside>
        {document.sections.map((section) => (
          <section className={styles.section} key={section.title}>
            <h2>{section.title}</h2>
            {section.paragraphs?.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
            {section.bullets && (
              <ul>
                {section.bullets.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
          </section>
        ))}
        {document.references && (
          <footer className={styles.references}>
            <h2>Références officielles</h2>
            {document.references.map((reference) => (
              <a href={reference.href} target="_blank" rel="noreferrer" key={reference.href}>
                {reference.label}
              </a>
            ))}
          </footer>
        )}
      </article>
    </main>
  );
}
