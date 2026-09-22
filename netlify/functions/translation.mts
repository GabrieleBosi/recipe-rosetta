// translation
//
// Serves the result that translate-background wrote, by job id. The browser
// polls this until the status stops being "pending".
//
// Served from the default /.netlify/functions/ path, which Netlify matches
// before any redirect rule, so the single-page fallback cannot shadow it.
//
// A job id is a random UUID the browser makes, so a result is only reachable by
// whoever started it. Nothing here is tied to an account, because the app has
// none.

import { getStore } from "@netlify/blobs";

export default async (req: Request) => {
  const jobId = new URL(req.url).searchParams.get("job") ?? "";

  if (!/^[0-9a-f-]{36}$/i.test(jobId)) {
    return Response.json({ status: "failed", error: "Unknown job." }, { status: 400 });
  }

  const store = getStore("translations");
  const result = await store.get(jobId, { type: "json" });

  // Nothing written yet means Gemini is still reading the card.
  if (!result) return Response.json({ status: "pending" });

  return Response.json(result);
};
