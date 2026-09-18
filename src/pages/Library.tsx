import { useCallback, useEffect, useState } from "react";

import RecipeList from "../components/RecipeList";
import UploadCard from "../components/UploadCard";
import { ensureFamily, listRecipes } from "../lib/api";
import type { Family, Recipe } from "../lib/types";

interface Props {
  userId: string;
  displayName: string | null;
}

export default function Library({ userId, displayName }: Props) {
  const [family, setFamily] = useState<Family | null>(null);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (familyId: string) => {
    setRecipes(await listRecipes(familyId));
  }, []);

  useEffect(() => {
    let active = true;
    ensureFamily(userId, displayName)
      .then(async (found) => {
        if (!active) return;
        setFamily(found);
        await refresh(found.id);
      })
      .catch((caught) => {
        if (active) {
          setError(caught instanceof Error ? caught.message : String(caught));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [userId, displayName, refresh]);

  if (loading) return <p className="note">Loading your kitchen…</p>;
  if (error) return <p className="error">{error}</p>;
  if (!family) return <p className="error">No family found for this account.</p>;

  return (
    <>
      <UploadCard
        familyId={family.id}
        userId={userId}
        onUploaded={() => void refresh(family.id)}
      />
      <RecipeList recipes={recipes} />
    </>
  );
}
