import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import ScanViewer from "../components/ScanViewer";
import TranslatedRecipeView from "../components/TranslatedRecipeView";
import { translateRecipe } from "../lib/api";
import { deleteRecipe, getRecipe } from "../lib/store";
import type { Recipe } from "../lib/types";

export default function RecipePage() {
  const { recipeId } = useParams<{ recipeId: string }>();
  const navigate = useNavigate();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(true);
  const [retranslating, setRetranslating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (id: string) => {
    setRecipe((await getRecipe(id)) ?? null);
  }, []);

  useEffect(() => {
    if (!recipeId) return;
    let active = true;
    setLoading(true);
    load(recipeId)
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : String(caught));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [recipeId, load]);

  async function onTranslateAgain() {
    if (!recipe) return;
    setRetranslating(true);
    setError(null);
    try {
      setRecipe(await translateRecipe(recipe));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      await load(recipe.id).catch(() => undefined);
    } finally {
      setRetranslating(false);
    }
  }

  async function onDelete() {
    if (!recipe) return;
    // There is no server copy and no undo, so make the reader mean it.
    const sure = window.confirm(
      `Delete "${recipe.title ?? "this card"}"? The scan and its translation ` +
        "are only in this browser, so they cannot be recovered.",
    );
    if (!sure) return;

    await deleteRecipe(recipe.id);
    navigate("/");
  }

  if (loading) return <p className="note">Loading the card…</p>;
  if (!recipe) return <p className="error">That card is not in this browser.</p>;

  return (
    <article className="recipe-page">
      <header className="recipe-header">
        <div>
          <h2>{recipe.title ?? "Untitled card"}</h2>
          {recipe.attributedTo && <p className="attribution">{recipe.attributedTo}</p>}
          {recipe.sourceNote && <p className="note">{recipe.sourceNote}</p>}
        </div>
        <div className="recipe-actions">
          <Link to="/" className="link">← All cards</Link>
          <button
            type="button"
            className="primary"
            onClick={onTranslateAgain}
            disabled={retranslating}
          >
            {retranslating
              ? "Reading…"
              : recipe.translated
              ? "Translate again"
              : "Translate this card"}
          </button>
          <button type="button" className="link danger" onClick={onDelete}>
            Delete
          </button>
        </div>
      </header>

      {error && <p className="error">{error}</p>}
      {recipe.status === "failed" && recipe.errorMessage && !error && (
        <p className="error">{recipe.errorMessage}</p>
      )}

      <div className="side-by-side">
        <section className="pane">
          <h3 className="pane-title">The original</h3>
          <ScanViewer scan={recipe.scan} />
        </section>

        <section className="pane">
          <h3 className="pane-title">The translation</h3>
          {recipe.translated
            ? <TranslatedRecipeView recipe={recipe} />
            : (
              <p className="note">
                No translation yet. Use “Translate this card” above.
              </p>
            )}
        </section>
      </div>

      {recipe.transcription && (
        <section className="panel">
          <h3>What the card says</h3>
          <pre className="transcription">{recipe.transcription}</pre>
        </section>
      )}

      {recipe.openQuestions.length > 0 && (
        <section className="panel">
          <h3>What the card does not say</h3>
          <p className="note">
            These show where the translation had to guess. Add what you know to
            “Whose recipe” or “Where it came from”, then translate again.
          </p>
          <ul className="questions">
            {recipe.openQuestions.map((question, index) => (
              <li key={index}>
                <p className="question">{question.question}</p>
                {question.rationale && <p className="note">{question.rationale}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
