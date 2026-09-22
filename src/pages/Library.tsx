import { useCallback, useEffect, useState } from "react";

import RecipeList from "../components/RecipeList";
import UploadCard from "../components/UploadCard";
import { listRecipes } from "../lib/store";
import type { Recipe } from "../lib/types";

export default function Library() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setRecipes(await listRecipes());
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  if (loading) return <p className="note">Loading your kitchen…</p>;

  return (
    <>
      {error && <p className="error">{error}</p>}
      <UploadCard onAdded={() => void refresh()} />
      <RecipeList recipes={recipes} />
    </>
  );
}
