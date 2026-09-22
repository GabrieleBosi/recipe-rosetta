import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { createRecipe, translateRecipe } from "../lib/api";

export default function UploadCard({ onAdded }: { onAdded: () => void }) {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [attributedTo, setAttributedTo] = useState("");
  const [sourceNote, setSourceNote] = useState("");
  const [stage, setStage] = useState<"idle" | "preparing" | "reading">("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!file) return;

    setError(null);
    setStage("preparing");

    let recipeId: string | null = null;
    try {
      const recipe = await createRecipe({ file, title, attributedTo, sourceNote });
      recipeId = recipe.id;
      onAdded();

      setStage("reading");
      await translateRecipe(recipe);
      navigate(`/recipe/${recipe.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      // The card is saved either way, so let the reader open it and retry
      // from there rather than lose the photograph.
      if (recipeId) navigate(`/recipe/${recipeId}`);
    } finally {
      setStage("idle");
    }
  }

  const busy = stage !== "idle";

  return (
    <section className="panel">
      <h2>Add a card</h2>
      <form onSubmit={onSubmit}>
        <label htmlFor="scan">Photograph of the card</label>
        <input
          id="scan"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          required
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />

        <div className="field-row">
          <div>
            <label htmlFor="title">Name (optional)</label>
            <input
              id="title"
              type="text"
              placeholder="Torta di mele"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <div>
            <label htmlFor="attributed">Whose recipe (optional)</label>
            <input
              id="attributed"
              type="text"
              placeholder="Nonna Rosa"
              value={attributedTo}
              onChange={(event) => setAttributedTo(event.target.value)}
            />
          </div>
        </div>

        <label htmlFor="source">Where it came from (optional)</label>
        <input
          id="source"
          type="text"
          placeholder="Index card from the kitchen drawer, about 1958"
          value={sourceNote}
          onChange={(event) => setSourceNote(event.target.value)}
        />

        <button type="submit" className="primary" disabled={busy || !file}>
          {stage === "preparing"
            ? "Preparing the photograph…"
            : stage === "reading"
            ? "Reading the handwriting…"
            : "Translate this card"}
        </button>
      </form>

      {stage === "reading" && (
        <p className="note">This takes about half a minute. Keep the tab open.</p>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  );
}
