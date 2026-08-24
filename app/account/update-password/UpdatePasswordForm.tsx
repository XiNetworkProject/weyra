"use client";

import { useState, type FormEvent } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import styles from "@/app/login/login.module.css";

export default function UpdatePasswordForm() {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (password !== confirmation) {
      setMessage("Les deux mots de passe ne correspondent pas.");
      return;
    }

    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setMessage("Le service de compte Weyra n'est pas configuré.");
      return;
    }

    setPending(true);
    setMessage(null);
    const { error } = await supabase.auth.updateUser({ password });
    setPending(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    window.location.assign("/?space=profile");
  }

  return (
    <section className={styles.panel}>
      <header>
        <span>Sécurité du compte</span>
        <h2>Choisis un nouveau mot de passe</h2>
        <p>Utilise au moins 10 caractères, avec majuscule, minuscule et chiffre.</p>
      </header>
      <form onSubmit={submit}>
        <label>
          Nouveau mot de passe
          <input
            autoComplete="new-password"
            minLength={10}
            onChange={(event) => setPassword(event.target.value)}
            pattern="(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{10,}"
            required
            type="password"
            value={password}
          />
        </label>
        <label>
          Confirmer le mot de passe
          <input
            autoComplete="new-password"
            minLength={10}
            onChange={(event) => setConfirmation(event.target.value)}
            pattern="(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{10,}"
            required
            type="password"
            value={confirmation}
          />
        </label>
        {message && <p className={styles.message} role="status">{message}</p>}
        <button className={styles.submit} disabled={pending} type="submit">
          {pending ? "Mise à jour..." : "Enregistrer le mot de passe"}
        </button>
      </form>
    </section>
  );
}
