# Recipe Rosetta

Photograph a handwritten family recipe card. Get back a version you can cook
from — grams, minutes, degrees Celsius, and substitutes for ingredients that
are no longer sold — with the original scan beside it.

## How it works

```
browser (React + Vite, on Netlify)
   │
   ├── shrinks the photograph, stores the card in IndexedDB
   │
   ├── POST /.netlify/functions/translate-background ──► Gemini
   │        (background function, holds GEMINI_API_KEY)     │
   │                                                        ▼
   │                                              Netlify Blobs
   │                                              (result, by job id)
   │
   └── polls GET /.netlify/functions/translation?job=… for the result
```

There is no database and no server-side account. Netlify is the only backend,
and its only job is to hold the Gemini key and make the call.

### Why a background function

A Gemini call on a photograph takes longer than a synchronous Netlify function
is allowed to run. So the request starts a background function, which answers
`202` at once, does the work, and writes the result to Netlify Blobs under a
job id the browser generated. The browser polls for that id until it appears.

The job id is a random UUID, so a result is only reachable by whoever started
it. Nothing is tied to an account, because there are none.

## Where your recipes live

**In one browser, on one device.** Each card — the scan, the transcription and
the translated recipe — is written to IndexedDB. That has consequences worth
knowing before you rely on it:

- Clearing site data deletes every card.
- Nothing syncs. A card added on a laptop is not on a phone.
- Nothing is shared. There is no link you can send to a relative.
- Private browsing may refuse to store anything at all.

Print or save a card as PDF if you want a copy that outlives the browser.

## Layout

| Path | What it holds |
| --- | --- |
| `src/lib/store.ts` | IndexedDB: every card lives here |
| `src/lib/image.ts` | Shrinks a photograph before it is sent |
| `src/lib/api.ts` | Starts a translation and polls for the result |
| `netlify/functions/translate-background.mts` | Calls Gemini, writes to Blobs |
| `netlify/functions/translation.mts` | Serves a result by job id |
| `netlify/lib/prompt.mts` | The instructions and output schema Gemini follows |
| `netlify.toml` | Build command, functions directory, single-page fallback |

## Set up

### The Gemini key

One environment variable, set in the Netlify dashboard under **Site
configuration → Environment variables**:

| Name | Value |
| --- | --- |
| `GEMINI_API_KEY` | your key from Google AI Studio |
| `GEMINI_MODEL` | optional; defaults to `gemini-3.6-flash` |

Do **not** prefix it with `VITE_`. Anything so prefixed is compiled into the
browser bundle and is public. This key is read inside the function only.

Model ids get retired. If translation starts failing with a 404 naming the
model, set `GEMINI_MODEL` to the replacement Google names in the error. No code
change or redeploy is needed.

### Running it locally

```bash
npm install
cp .env.example .env    # then put your real key in it
npm install -g netlify-cli
netlify dev
```

Use `netlify dev`, not `npm run dev`. Plain Vite serves the frontend but not
the functions, so translation will fail with a 404.

## Deploying

Netlify builds from `main` on every push. Nothing else to do.

## What is built, and what is not

Built:

- Photograph a card, have the handwriting read, and get a modern recipe with
  gram measures, timings, substitutions and the assumptions it had to make.
- Side by side: the scan on the left, the translation on the right, with the
  verbatim transcription and the questions the card left open below.
- Translate again, after adding context in "Whose recipe" or "Where it came
  from" — those are passed to Gemini.
- Delete a card.

Not built, and not possible without a backend:

- **Accounts and sharing.** Both need a server that remembers people.
- **Sync between devices.** Same reason.
- **The interview.** Gemini still raises its open questions and they are shown,
  but answering them and feeding the answers back would want somewhere to keep
  them.

If any of those matter later, they need a database again — Netlify Blobs plus
an identity provider, or a hosted Postgres.
