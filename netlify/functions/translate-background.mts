// translate-background
//
// Reads a photographed recipe card and writes the translation to Netlify Blobs
// under the caller's job id.
//
// This is a background function because a Gemini call on a photograph takes
// longer than a synchronous function is allowed to run. Netlify returns 202 to
// the browser at once and this keeps working; the browser then polls the
// `translation` function until the result appears.

import { getStore } from "@netlify/blobs";

import { callGemini } from "../lib/gemini.mts";
import { buildPrompt, RESPONSE_SCHEMA, SYSTEM_INSTRUCTION } from "../lib/prompt.mts";

// Roughly what a downscaled photograph costs once base64 has inflated it by a
// third. The browser shrinks images before sending, so this should never be
// reached by an ordinary card; it is here to reject a runaway payload.
const MAX_BASE64_LENGTH = 6_000_000;

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

export default async (req: Request) => {
  const store = getStore("translations");
  let jobId = "";

  try {
    const body = await req.json();
    jobId = String(body?.job_id ?? "");

    // Without a job id there is nowhere to report to, so fail silently rather
    // than write a result nobody can find.
    if (!/^[0-9a-f-]{36}$/i.test(jobId)) {
      console.error("translate-background called without a usable job_id");
      return;
    }

    const base64 = String(body?.image_base64 ?? "");
    const mimeType = String(body?.mime_type ?? "image/jpeg");

    if (!base64) throw new Error("No photograph was sent.");
    if (base64.length > MAX_BASE64_LENGTH) {
      throw new Error(
        "That photograph is too large. Try a smaller one, or crop it to the card.",
      );
    }

    const { data: result, model } = await callGemini<TranslationPayload>({
      systemInstruction: SYSTEM_INSTRUCTION,
      prompt: buildPrompt({
        title: body?.title ?? null,
        attributedTo: body?.attributed_to ?? null,
        sourceNote: body?.source_note ?? null,
      }),
      images: [{ mimeType, base64 }],
      responseSchema: RESPONSE_SCHEMA as unknown as Record<string, unknown>,
    });

    const { open_questions: openQuestions = [], transcription, ...translated } = result;

    await store.setJSON(jobId, {
      status: "done",
      model,
      transcription,
      translated,
      open_questions: openQuestions,
      finished_at: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("translate-background failed", message);

    if (jobId) {
      await store.setJSON(jobId, {
        status: "failed",
        error: message.slice(0, 1000),
        finished_at: new Date().toISOString(),
      });
    }
  }
};
