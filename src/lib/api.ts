import { prepareScan, toBase64 } from "./image";
import { putRecipe } from "./store";
import type { OpenQuestion, Recipe, TranslatedRecipe } from "./types";

// The background function answers 202 at once and keeps working, so the result
// arrives by polling rather than in the reply.
const START_URL = "/.netlify/functions/translate-background";
const RESULT_URL = "/.netlify/functions/translation";

// Each poll is a function invocation, so slow down once the quick cases have
// had their chance rather than hammering for the whole two and a half minutes.
const FIRST_POLLS_MS = 2000;
const LATER_POLLS_MS = 5000;
const SLOW_DOWN_AFTER_MS = 30_000;
const GIVE_UP_AFTER_MS = 150_000;

interface FinishedJob {
  status: "done" | "failed" | "pending";
  error?: string;
  model?: string;
  transcription?: string;
  translated?: TranslatedRecipe;
  open_questions?: OpenQuestion[];
}

export interface NewRecipeInput {
  file: File;
  title?: string;
  attributedTo?: string;
  sourceNote?: string;
}

/** Shrink the photograph, store the card, and hand it back untranslated. */
export async function createRecipe(input: NewRecipeInput): Promise<Recipe> {
  const { blob, mimeType } = await prepareScan(input.file);

  const recipe: Recipe = {
    id: crypto.randomUUID(),
    title: input.title?.trim() || null,
    attributedTo: input.attributedTo?.trim() || null,
    sourceNote: input.sourceNote?.trim() || null,
    status: "translating",
    errorMessage: null,
    createdAt: new Date().toISOString(),
    scan: blob,
    scanMimeType: mimeType,
    transcription: null,
    translated: null,
    openQuestions: [],
    model: null,
  };

  await putRecipe(recipe);
  return recipe;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Send the card to Gemini and store what comes back.
 *
 * Returns the updated recipe. A failure is recorded on the recipe as well as
 * thrown, so the reader can see why on the page rather than only in a toast.
 */
export async function translateRecipe(recipe: Recipe): Promise<Recipe> {
  const working: Recipe = {
    ...recipe,
    status: "translating",
    errorMessage: null,
  };
  await putRecipe(working);

  try {
    // A fresh id each run, so a second attempt never reads the first result.
    const jobId = crypto.randomUUID();

    const started = await fetch(START_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        job_id: jobId,
        image_base64: await toBase64(recipe.scan),
        mime_type: recipe.scanMimeType,
        title: recipe.title,
        attributed_to: recipe.attributedTo,
        source_note: recipe.sourceNote,
      }),
    });

    // Background functions answer 202; anything else means it never ran.
    if (started.status !== 202 && !started.ok) {
      throw new Error(
        `The translator did not start (${started.status}). If this keeps ` +
          "happening the function may not be deployed.",
      );
    }

    const result = await pollUntilFinished(jobId);

    if (result.status === "failed") {
      throw new Error(result.error ?? "The translation failed.");
    }

    const translated = result.translated ?? {};
    const finished: Recipe = {
      ...working,
      status: "translated",
      errorMessage: null,
      title: working.title || translated.title || "Untitled recipe",
      attributedTo: working.attributedTo || translated.attributed_to || null,
      transcription: result.transcription ?? null,
      translated,
      openQuestions: result.open_questions ?? [],
      model: result.model ?? null,
    };

    await putRecipe(finished);
    return finished;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await putRecipe({ ...working, status: "failed", errorMessage: message });
    throw error;
  }
}

async function pollUntilFinished(jobId: string): Promise<FinishedJob> {
  const startedAt = Date.now();
  const deadline = startedAt + GIVE_UP_AFTER_MS;

  while (Date.now() < deadline) {
    const elapsed = Date.now() - startedAt;
    await wait(elapsed < SLOW_DOWN_AFTER_MS ? FIRST_POLLS_MS : LATER_POLLS_MS);

    const response = await fetch(`${RESULT_URL}?job=${jobId}`);
    if (!response.ok) continue;

    const result = (await response.json()) as FinishedJob;
    if (result.status !== "pending") return result;
  }

  throw new Error(
    "The translation took longer than two and a half minutes. It may still " +
      "finish; try again in a moment.",
  );
}
