"use client";

import type { ReactNode } from "react";
import { IconCheck } from "@/components/atlas/icons";
import type { ProductAuthor } from "@/lib/product-domain";

export function formatRelativeTime(timestamp: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 60_000));
  if (minutes < 1) return "maintenant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  return `il y a ${days} j`;
}

export function ProductAuthorMark({ author, small = false }: { author: ProductAuthor; small?: boolean }) {
  return (
    <span
      className={`product-author-mark${small ? " product-author-mark--small" : ""}`}
      style={{ "--author-accent": author.accent } as never}
      aria-hidden="true"
    >
      {author.initials}
    </span>
  );
}
export function ProductRole({ role }: { role: ProductAuthor["role"] }) {
  if (role === "member") return null;
  const label = role === "association" ? "Organisation" : role === "creator" ? "Créateur" : "Fiable";
  return <span className={`product-role product-role--${role}`}><IconCheck />{label}</span>;
}

export function DemoNotice({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`product-demo-notice${compact ? " is-compact" : ""}`}>
      <i />
      <span><b>Mode local</b>{compact ? "Données de démonstration" : "Les contenus communautaires de cet espace sont des démonstrations enregistrées sur cet appareil."}</span>
    </div>
  );
}

export function ProductToggle({
  checked,
  onChange,
  label,
  detail,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  detail?: string;
}) {
  return (
    <label className="product-setting-row">
      <span><b>{label}</b>{detail && <small>{detail}</small>}</span>
      <span className="product-switch">
        <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
        <i><span /></i>
      </span>
    </label>
  );
}

export function ProductEmpty({
  icon,
  title,
  children,
  action,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="product-empty">
      <span>{icon}</span>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}

export function ProductSectionHeading({
  eyebrow,
  title,
  copy,
  action,
}: {
  eyebrow?: string;
  title: string;
  copy?: string;
  action?: ReactNode;
}) {
  return (
    <header className="product-section-heading">
      <div>
        {eyebrow && <span>{eyebrow}</span>}
        <h2>{title}</h2>
        {copy && <p>{copy}</p>}
      </div>
      {action}
    </header>
  );
}
