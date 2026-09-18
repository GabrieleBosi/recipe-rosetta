import { useEffect, useState, type FormEvent } from "react";

import { supabase } from "../lib/supabase";

export default function SignIn() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // A failed confirmation link lands here with the reason in the URL fragment.
  // Without this the user sees an ordinary sign-in form and no explanation.
  useEffect(() => {
    const fragment = window.location.hash.replace(/^#/, "");
    if (!fragment) return;

    const params = new URLSearchParams(fragment);
    const description = params.get("error_description");
    if (!description) return;

    setError(
      params.get("error_code") === "otp_expired"
        ? `${description}. These links work only once, and mail providers often ` +
          "open them first. If you already confirmed, just sign in below."
        : description,
    );

    // Drop the fragment so a reload does not show a stale error.
    window.history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search,
    );
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      if (mode === "signup") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (signUpError) throw signUpError;
        if (!data.session) {
          setMessage("Check your inbox and confirm the address, then sign in.");
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw signInError;
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="centred">
      <section className="panel auth">
        <h1 className="wordmark">Recipe Rosetta</h1>
        <p className="lede">
          Photograph a handwritten recipe card. Get back a version you can cook
          from, with the original beside it.
        </p>

        <form onSubmit={onSubmit}>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />

          <button type="submit" className="primary" disabled={busy}>
            {busy ? "Working…" : mode === "signup" ? "Create account" : "Sign in"}
          </button>
        </form>

        {error && <p className="error">{error}</p>}
        {message && <p className="note">{message}</p>}

        <button
          type="button"
          className="link"
          onClick={() => {
            setMode(mode === "signup" ? "signin" : "signup");
            setError(null);
            setMessage(null);
          }}
        >
          {mode === "signup"
            ? "I already have an account"
            : "Create an account instead"}
        </button>
      </section>
    </main>
  );
}
