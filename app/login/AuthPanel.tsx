"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import styles from "@/app/login/login.module.css";

type AuthMode = "signin" | "signup";

const ERROR_MESSAGES: Record<string, string> = {
  auth_callback: "La connexion n'a pas pu être finalisée. Réessaie depuis cet écran.",
  auth_confirmation: "Ce lien de confirmation est invalide ou a expiré.",
  supabase_unavailable: "Le service de compte Weyra auto-hébergé n'est pas encore disponible.",
};

export default function AuthPanel({ configured }: { configured: boolean }) {
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [pending, setPending] = useState(false);
  const [resetPending, setResetPending] = useState(false);
  const [message, setMessage] = useState<string | null>(() => {
    const error = searchParams.get("error");
    return error ? (ERROR_MESSAGES[error] ?? "Une erreur d'authentification est survenue.") : null;
  });
  const [success, setSuccess] = useState(false);

  const nextPath = useMemo(() => {
    const next = searchParams.get("next");
    return next?.startsWith("/") && !next.startsWith("//") ? next : "/";
  }, [searchParams]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!configured || pending) return;

    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setMessage("Le service de compte Weyra n'est pas configuré sur cet environnement.");
      return;
    }

    setPending(true);
    setMessage(null);
    setSuccess(false);

    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setPending(false);
      if (error) {
        setMessage(error.message);
        return;
      }
      window.location.assign(nextPath);
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName.trim() },
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
      },
    });
    setPending(false);
    if (error) {
      setMessage(error.message);
      return;
    }

    if (data.session) {
      window.location.assign(nextPath);
      return;
    }

    setSuccess(true);
    setMessage("Compte créé. Consulte ta boîte mail pour confirmer ton adresse.");
  }

  async function requestPasswordReset() {
    if (!configured || resetPending) return;
    if (!email.trim()) {
      setSuccess(false);
      setMessage("Renseigne d'abord ton adresse e-mail.");
      return;
    }

    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;

    setResetPending(true);
    setMessage(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback?next=/account/update-password`,
    });
    setResetPending(false);
    setSuccess(!error);
    setMessage(error?.message ?? "Un lien de récupération vient d'être envoyé.");
  }

  return (
    <section className={styles.panel} aria-labelledby="auth-title">
      <header>
        <span>Compte Weyra</span>
        <h2 id="auth-title">{mode === "signin" ? "Bon retour parmi nous" : "Rejoins le réseau"}</h2>
        <p>
          {mode === "signin"
            ? "Retrouve ton Atlas et tes communautés."
            : "Crée un profil public simple. Tu gardes le contrôle de tes données."}
        </p>
      </header>

      <div className={styles.tabs} role="tablist" aria-label="Mode d'authentification">
        <button
          type="button"
          className={mode === "signin" ? styles.active : ""}
          onClick={() => {
            setMode("signin");
            setMessage(null);
          }}
        >
          Connexion
        </button>
        <button
          type="button"
          className={mode === "signup" ? styles.active : ""}
          onClick={() => {
            setMode("signup");
            setMessage(null);
          }}
        >
          Inscription
        </button>
      </div>

      <form onSubmit={submit}>
        {mode === "signup" && (
          <label>
            Nom affiché
            <input
              autoComplete="nickname"
              maxLength={32}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Ex. Camille du Nord"
              required
              value={displayName}
            />
          </label>
        )}
        <label>
          Adresse e-mail
          <input
            autoComplete="email"
            inputMode="email"
            onChange={(event) => setEmail(event.target.value)}
            placeholder="toi@exemple.fr"
            required
            type="email"
            value={email}
          />
        </label>
        <label>
          Mot de passe
          <input
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            minLength={mode === "signup" ? 10 : undefined}
            onChange={(event) => setPassword(event.target.value)}
            pattern={mode === "signup" ? "(?=.*[a-z])(?=.*[A-Z])(?=.*\\d).{10,}" : undefined}
            placeholder={mode === "signup" ? "10 caractères, majuscule, minuscule et chiffre" : "Ton mot de passe"}
            required
            type="password"
            value={password}
          />
        </label>
        {mode === "signin" && (
          <button
            className={styles.forgot}
            disabled={!configured || resetPending}
            onClick={() => void requestPasswordReset()}
            type="button"
          >
            {resetPending ? "Envoi en cours..." : "Mot de passe oublié ?"}
          </button>
        )}

        {message && (
          <p className={`${styles.message} ${success ? styles.success : ""}`} role="status">
            {message}
          </p>
        )}
        {!configured && (
          <p className={styles.notice}>
            Le backend auto-hébergé Weyra est en préparation. Le mode démo local reste disponible.
          </p>
        )}

        <button className={styles.submit} disabled={!configured || pending} type="submit">
          {pending ? "Connexion en cours..." : mode === "signin" ? "Se connecter" : "Créer mon compte"}
        </button>
      </form>

      <footer>
        <Link href="/">Continuer en mode démo</Link>
        <small>En continuant, tu acceptes les règles communautaires et la politique de confidentialité de Weyra.</small>
      </footer>
    </section>
  );
}
