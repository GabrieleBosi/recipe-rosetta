import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { createRecipeWithScan, translateRecipe } from "../lib/api";

interface Props {
  familyId: string;
  userId: string;
  onUploaded: () => void;
}

export default function UploadCard({ familyId, userId, onUploaded }: Props) {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [attributedTo, setAttributedTo] = useState("");
  const [sourceNote, setSourceNote] = useState("");
  const [stage, setStage] = useState<"idle" | "uploading" | "reading">("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!file) return;

    setError(null);
    setStage("uploading");

    let recipeId: string | null = null;
    try {
      const recipe = await createRecipeWithScan({
        familyId,
        userId,
        file,
        title,
        attributedTo,
        sourceNote,
      });
      recipeId = recipe.id;
      onUploaded();

      setStage("reading");
      await translateRecipe(recipe.id);
      navigate(`/recipe/${recipe.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      // The scan is saved either way, so let the reader open the recipe and
      // try the translation again from there.
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
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
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
          {stage === "uploading"
            ? "Uploading…"
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
