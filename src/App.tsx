import { Route, Routes } from "react-router-dom";

import SignIn from "./components/SignIn";
import Library from "./pages/Library";
import RecipePage from "./pages/RecipePage";
import { supabase, supabaseConfigError } from "./lib/supabase";
import { useSession } from "./lib/useSession";

export default function App() {
  const { session, loading } = useSession();

  if (supabaseConfigError) {
    return (
      <main className="centred">
        <section className="panel">
          <h1 className="wordmark">Recipe Rosetta</h1>
          <p className="error">{supabaseConfigError}</p>
        </section>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="centred">
        <p className="note">Loading…</p>
      </main>
    );
  }

  if (!session) return <SignIn />;

  const user = session.user;
  const displayName =
    (user.user_metadata?.display_name as string | undefined) ??
    user.email?.split("@")[0] ??
    null;

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="wordmark">Recipe Rosetta</h1>
        <div className="app-header-right">
          <span className="note">{user.email}</span>
          <button
            type="button"
            className="link"
            onClick={() => void supabase.auth.signOut()}
          >
            Sign out
          </button>
        </div>
      </header>

      <main>
        <Routes>
          <Route
            path="/"
            element={<Library userId={user.id} displayName={displayName} />}
          />
          <Route
            path="/recipe/:recipeId"
            element={<RecipePage userId={user.id} />}
          />
          <Route
            path="*"
            element={<p className="note">That page does not exist.</p>}
          />
        </Routes>
      </main>
    </div>
  );
}
