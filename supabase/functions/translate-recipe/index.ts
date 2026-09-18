// translate-recipe
//
// Reads the scans of one recipe from Storage, sends them to Gemini together
// with whatever the family has told us, and stores the result as a new row in
// public.translations.
//
// The caller must send a user JWT. Access to the recipe is decided by RLS: the
// function reads the recipe through a client that carries the caller's token,
// so a user who is not in the family gets nothing. Only the writes use the
// service role.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";

import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { callGemini } from "../_shared/gemini.ts";
import { buildPrompt, RESPONSE_SCHEMA, SYSTEM_INSTRUCTION } from "../_shared/prompt.ts";

const BUCKET = "recipe-scans";
const MAX_IMAGES = 4;

interface TranslationPayload {
  title: string;
  transcription: string;
  attributed_to?: string;
  servings?: string;
  total_time_minutes?: number;
  ingredients: unknown[];
  steps: unknown[];
  substitutions?: unknown[];
  assumptions?: string[];
  open_questions?: { question: string; rationale: string }[];
  confidence: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Use POST." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ error: "The function is missing its Supabase environment." }, 500);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ error: "Sign in first." }, 401);
  }

  let recipeId: string;
  try {
    const body = await req.json();
    recipeId = String(body?.recipe_id ?? "");
  } catch {
    return jsonResponse({ error: "Send a JSON body." }, 400);
  }
  if (!recipeId) {
    return jsonResponse({ error: "recipe_id is required." }, 400);
  }

  // Caller's own permissions. RLS applies to every read below.
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user) {
    return jsonResponse({ error: "Sign in first." }, 401);
  }
  const userId = userData.user.id;

  const { data: recipe, error: recipeError } = await userClient
    .from("recipes")
    .select("id, family_id, title, attributed_to, source_note")
    .eq("id", recipeId)
    .maybeSingle();

  if (recipeError) {
    return jsonResponse({ error: recipeError.message }, 400);
  }
  if (!recipe) {
    return jsonResponse({ error: "Recipe not found." }, 404);
  }

  const { data: images, error: imagesError } = await userClient
    .from("recipe_images")
    .select("storage_path, mime_type, position")
    .eq("recipe_id", recipeId)
    .order("position", { ascending: true })
    .limit(MAX_IMAGES);

  if (imagesError) {
    return jsonResponse({ error: imagesError.message }, 400);
  }
  if (!images || images.length === 0) {
    return jsonResponse({ error: "Upload a scan of the card first." }, 400);
  }

  // Answers already given, so the model does not ask them twice.
  const { data: answerRows } = await userClient
    .from("interview_answers")
    .select("answer, interview_questions ( question )")
    .eq("recipe_id", recipeId);

  const answers = (answerRows ?? [])
    .map((row: Record<string, unknown>) => {
      const question = (row.interview_questions as { question?: string } | null)?.question;
      return question ? { question, answer: String(row.answer) } : null;
    })
    .filter((entry): entry is { question: string; answer: string } => entry !== null);

  // Writes bypass RLS. Membership was already proved by the reads above.
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  await admin
    .from("recipes")
    .update({ status: "processing", error_message: null })
    .eq("id", recipeId);

  try {
    const inlineImages = [];
    for (const image of images) {
      const { data: blob, error: downloadError } = await admin.storage
        .from(BUCKET)
        .download(image.storage_path);
      if (downloadError || !blob) {
        throw new Error(`Could not read ${image.storage_path}: ${downloadError?.message}`);
      }
      inlineImages.push({
        mimeType: image.mime_type ?? blob.type ?? "image/jpeg",
        base64: encodeBase64(await blob.arrayBuffer()),
      });
    }

    const { data: result, model } = await callGemini<TranslationPayload>({
      systemInstruction: SYSTEM_INSTRUCTION,
      prompt: buildPrompt({
        title: recipe.title,
        attributedTo: recipe.attributed_to,
        sourceNote: recipe.source_note,
        answers,
      }),
      images: inlineImages,
      responseSchema: RESPONSE_SCHEMA as unknown as Record<string, unknown>,
    });

    const { data: latest } = await admin
      .from("translations")
      .select("version")
      .eq("recipe_id", recipeId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    const version = (latest?.version ?? 0) + 1;
    const { open_questions: openQuestions = [], transcription, ...translated } = result;

    const { data: translation, error: insertError } = await admin
      .from("translations")
      .insert({
        recipe_id: recipeId,
        version,
        transcription,
        translated,
        notes: (result.assumptions ?? []).join("\n"),
        model,
        created_by: userId,
      })
      .select()
      .single();

    if (insertError) {
      throw new Error(`Could not save the translation: ${insertError.message}`);
    }

    // Keep the open questions for the interview, without repeating ones we
    // already asked.
    if (openQuestions.length > 0) {
      const { data: existing } = await admin
        .from("interview_questions")
        .select("question, position")
        .eq("recipe_id", recipeId);

      const known = new Set((existing ?? []).map((row) => row.question));
      let position = (existing ?? []).reduce((max, row) => Math.max(max, row.position), -1);

      const fresh = openQuestions
        .filter((entry) => entry.question && !known.has(entry.question))
        .map((entry) => ({
          recipe_id: recipeId,
          question: entry.question,
          rationale: entry.rationale ?? null,
          position: ++position,
        }));

      if (fresh.length > 0) {
        await admin.from("interview_questions").insert(fresh);
      }
    }

    await admin
      .from("recipes")
      .update({
        status: "translated",
        error_message: null,
        title: recipe.title || result.title || "Untitled recipe",
        attributed_to: recipe.attributed_to || result.attributed_to || null,
      })
      .eq("id", recipeId);

    return jsonResponse({ translation, open_questions: openQuestions });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await admin
      .from("recipes")
      .update({ status: "failed", error_message: message.slice(0, 1000) })
      .eq("id", recipeId);
    console.error("translate-recipe failed", message);
    return jsonResponse({ error: message }, 502);
  }
});
