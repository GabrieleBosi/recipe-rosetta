// Gemini request helpers.
//
// The key is read from the GEMINI_API_KEY environment variable inside the
// function, so it never reaches the browser.

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

// Override with the GEMINI_MODEL environment variable to move to another
// multimodal model. Google retires these, so expect to change it eventually.
export const DEFAULT_MODEL = "gemini-3.6-flash";

export interface InlineImage {
  mimeType: string;
  base64: string;
}

export interface GeminiCall {
  systemInstruction: string;
  prompt: string;
  images: InlineImage[];
  responseSchema: Record<string, unknown>;
  temperature?: number;
}

export async function callGemini<T>(
  call: GeminiCall,
): Promise<{ data: T; model: string }> {
  const apiKey = Netlify.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not set. Add it under Site configuration, " +
        "Environment variables, in the Netlify dashboard.",
    );
  }
  const model = Netlify.env.get("GEMINI_MODEL") ?? DEFAULT_MODEL;

  const parts: Record<string, unknown>[] = call.images.map((image) => ({
    inline_data: { mime_type: image.mimeType, data: image.base64 },
  }));
  parts.push({ text: call.prompt });

  const response = await fetch(
    `${GEMINI_ENDPOINT}/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: call.systemInstruction }] },
        contents: [{ role: "user", parts }],
        generationConfig: {
          temperature: call.temperature ?? 0.2,
          responseMimeType: "application/json",
          responseSchema: call.responseSchema,
        },
      }),
    },
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Gemini returned ${response.status}: ${detail.slice(0, 600)}`);
  }

  const payload = await response.json();
  const text = payload?.candidates?.[0]?.content?.parts
    ?.map((part: { text?: string }) => part.text ?? "")
    .join("");

  if (!text) {
    const reason = payload?.candidates?.[0]?.finishReason ??
      payload?.promptFeedback?.blockReason ?? "unknown";
    throw new Error(`Gemini returned no content (reason: ${reason}).`);
  }

  try {
    return { data: JSON.parse(text) as T, model };
  } catch {
    throw new Error(`Gemini returned text that is not JSON: ${text.slice(0, 400)}`);
  }
}
