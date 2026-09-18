import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import ScanViewer from "../components/ScanViewer";
import TranslatedRecipeView from "../components/TranslatedRecipeView";
import {
  getImages,
  getLatestTranslation,
  getOpenQuestions,
  getRecipe,
  translateRecipe,
} from "../lib/api";
import type {
  InterviewQuestion,
  Recipe,
  RecipeImage,
  Translation,
} from "../lib/types";

export default function RecipePage() {
  const { recipeId } = useParams<{ recipeId: string }>();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [images, setImages] = useState<RecipeImage[]>([]);
  const [translation, setTranslation] = useState<Translation | null>(null);
  const [questions, setQuestions] = useState<InterviewQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [retranslating, setRetranslating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (id: string) => {
    const [found, scans, latest, open] = await Promise.all([
      getRecipe(id),
      getImages(id),
      getLatestTranslation(id),
      getOpenQuestions(id),
    ]);
    setRecipe(found);
    setImages(scans);
    setTranslation(latest);
    setQuestions(open);
  }, []);

  useEffect(() => {
    if (!recipeId) return;
    let active = true;
    setLoading(true);
    load(recipeId)
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
  }, [recipeId, load]);

  async function onTranslateAgain() {
    if (!recipeId) return;
    setRetranslating(true);
    setError(null);
    try {
      await translateRecipe(recipeId);
      await load(recipeId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      await load(recipeId).catch(() => undefined);
    } finally {
      setRetranslating(false);
    }
  }

  if (loading) return <p className="note">Loading the card…</p>;
  if (!recipe) return <p className="error">That recipe is not available.</p>;

  return (
    <article className="recipe-page">
      <header className="recipe-header">
        <div>
          <h2>{recipe.title ?? "Untitled card"}</h2>
          {recipe.attributed_to && (
            <p className="attribution">{recipe.attributed_to}</p>
          )}
          {recipe.source_note && <p className="note">{recipe.source_note}</p>}
        </div>
        <div className="recipe-actions">
          <Link to="/" className="link">
            ← All cards
          </Link>
          <button
            type="button"
            className="primary"
            onClick={onTranslateAgain}
            disabled={retranslating}
          >
            {retranslating
              ? "Reading…"
              : translation
              ? "Translate again"
              : "Translate this card"}
          </button>
        </div>
      </header>

      {error && <p className="error">{error}</p>}
      {recipe.status === "failed" && recipe.error_message && !error && (
        <p className="error">{recipe.error_message}</p>
      )}

      <div className="side-by-side">
        <section className="pane">
          <h3 className="pane-title">The original</h3>
          <ScanViewer images={images} />
        </section>

        <section className="pane">
          <h3 className="pane-title">The translation</h3>
          {translation
            ? <TranslatedRecipeView translation={translation} />
            : (
              <p className="note">
                No translation yet. Use “Translate this card” above.
              </p>
            )}
        </section>
      </div>

      {translation?.transcription && (
        <section className="panel">
          <h3>What the card says</h3>
          <pre className="transcription">{translation.transcription}</pre>
        </section>
      )}

      {questions.length > 0 && (
        <section className="panel">
          <h3>What the card does not say</h3>
          <p className="note">
            Answering these will be the next step. For now they show where the
            translation had to guess.
          </p>
          <ul className="questions">
            {questions.map((question) => (
              <li key={question.id}>
                <p className="question">{question.question}</p>
                {question.rationale && (
                  <p className="note">{question.rationale}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
