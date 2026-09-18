import { SCANS_BUCKET, supabase } from "./supabase";
import type {
  Family,
  InterviewAnswer,
  InterviewQuestion,
  Recipe,
  RecipeImage,
  Translation,
} from "./types";

function fail(message: string, error: { message: string } | null): void {
  if (error) throw new Error(`${message}: ${error.message}`);
}

/**
 * Every recipe belongs to a family. A new account gets one on first use, so
 * nobody has to think about families before uploading a card.
 */
export async function ensureFamily(
  userId: string,
  displayName: string | null,
): Promise<Family> {
  const { data: memberships, error: readError } = await supabase
    .from("family_members")
    .select("families ( id, name, created_by, created_at )")
    .eq("user_id", userId)
    .limit(1);
  fail("Could not read your families", readError);

  const existing = memberships?.[0]?.families as Family | undefined;
  if (existing) return existing;

  const name = displayName ? `${displayName}'s family` : "My family";
  const { data: created, error: createError } = await supabase
    .from("families")
    .insert({ name, created_by: userId })
    .select("id, name, created_by, created_at")
    .single();
  fail("Could not create your family", createError);

  return created as Family;
}

export async function listRecipes(familyId: string): Promise<Recipe[]> {
  const { data, error } = await supabase
    .from("recipes")
    .select("*")
    .eq("family_id", familyId)
    .order("created_at", { ascending: false });
  fail("Could not list the recipes", error);
  return (data ?? []) as Recipe[];
}

export async function getRecipe(recipeId: string): Promise<Recipe | null> {
  const { data, error } = await supabase
    .from("recipes")
    .select("*")
    .eq("id", recipeId)
    .maybeSingle();
  fail("Could not read the recipe", error);
  return (data as Recipe) ?? null;
}

export async function getImages(recipeId: string): Promise<RecipeImage[]> {
  const { data, error } = await supabase
    .from("recipe_images")
    .select("*")
    .eq("recipe_id", recipeId)
    .order("position", { ascending: true });
  fail("Could not read the scans", error);
  return (data ?? []) as RecipeImage[];
}

export async function getLatestTranslation(
  recipeId: string,
): Promise<Translation | null> {
  const { data, error } = await supabase
    .from("translations")
    .select("*")
    .eq("recipe_id", recipeId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  fail("Could not read the translation", error);
  return (data as Translation) ?? null;
}

export async function getOpenQuestions(
  recipeId: string,
): Promise<InterviewQuestion[]> {
  const { data, error } = await supabase
    .from("interview_questions")
    .select("*")
    .eq("recipe_id", recipeId)
    .order("position", { ascending: true });
  fail("Could not read the questions", error);
  return (data ?? []) as InterviewQuestion[];
}

export async function getAnswers(recipeId: string): Promise<InterviewAnswer[]> {
  const { data, error } = await supabase
    .from("interview_answers")
    .select("*")
    .eq("recipe_id", recipeId);
  fail("Could not read the answers", error);
  return (data ?? []) as InterviewAnswer[];
}

export interface AnswerInput {
  questionId: string;
  answer: string;
}

/**
 * Store the family's answers. One answer per question, so answering again
 * replaces the previous one. The Edge Function reads these back into the
 * prompt on the next translation.
 */
export async function saveAnswers(
  recipeId: string,
  userId: string,
  entries: AnswerInput[],
): Promise<void> {
  const rows = entries
    .filter((entry) => entry.answer.trim().length > 0)
    .map((entry) => ({
      question_id: entry.questionId,
      recipe_id: recipeId,
      answer: entry.answer.trim(),
      answered_by: userId,
    }));

  if (rows.length === 0) return;

  const { error } = await supabase
    .from("interview_answers")
    .upsert(rows, { onConflict: "question_id" });
  fail("Could not save the answers", error);
}

/** Short-lived URL for a private scan. The bucket is never public. */
export async function signedScanUrl(
  storagePath: string,
  seconds = 3600,
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(SCANS_BUCKET)
    .createSignedUrl(storagePath, seconds);
  fail("Could not open the scan", error);
  return data!.signedUrl;
}

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

export interface NewRecipeInput {
  familyId: string;
  userId: string;
  file: File;
  title?: string;
  attributedTo?: string;
  sourceNote?: string;
}

/**
 * Create the recipe row, put the scan in Storage, and record the image.
 * The object key starts with the family id, which is what the Storage policies
 * check.
 */
export async function createRecipeWithScan(
  input: NewRecipeInput,
): Promise<Recipe> {
  const { data: recipe, error: recipeError } = await supabase
    .from("recipes")
    .insert({
      family_id: input.familyId,
      created_by: input.userId,
      title: input.title?.trim() || null,
      attributed_to: input.attributedTo?.trim() || null,
      source_note: input.sourceNote?.trim() || null,
      status: "uploaded",
    })
    .select("*")
    .single();
  fail("Could not create the recipe", recipeError);

  const mimeType = input.file.type || "image/jpeg";
  const extension = EXTENSIONS[mimeType] ??
    input.file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const storagePath =
    `${input.familyId}/${recipe!.id}/${crypto.randomUUID()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from(SCANS_BUCKET)
    .upload(storagePath, input.file, { contentType: mimeType, upsert: false });

  if (uploadError) {
    // Do not leave a recipe with no scan behind.
    await supabase.from("recipes").delete().eq("id", recipe!.id);
    throw new Error(`Could not upload the scan: ${uploadError.message}`);
  }

  const { error: imageError } = await supabase.from("recipe_images").insert({
    recipe_id: recipe!.id,
    storage_path: storagePath,
    position: 0,
    mime_type: mimeType,
    byte_size: input.file.size,
  });
  fail("Could not record the scan", imageError);

  return recipe as Recipe;
}

/** Ask the Edge Function to read the card and write a translation. */
export async function translateRecipe(recipeId: string): Promise<void> {
  const { error } = await supabase.functions.invoke("translate-recipe", {
    body: { recipe_id: recipeId },
  });
  if (!error) return;

  // invoke() reports a bare "non-2xx status"; the reason is in the body.
  const response = (error as { context?: Response }).context;
  if (response && typeof response.json === "function") {
    const body = await response.json().catch(() => null);
    if (body?.error) throw new Error(body.error);
  }
  throw new Error(error.message);
}
