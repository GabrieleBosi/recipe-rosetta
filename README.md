# Recipe Rosetta

Photograph a handwritten family recipe card. Get back a version you can cook
from — grams, minutes, degrees Celsius, and substitutes for ingredients that
are no longer sold — with the original scan beside it.

## How it works

```
browser (React + Vite, on Netlify)
   │  upload scan            ┌─────────────────────────────┐
   ├────────────────────────►│ Supabase Storage            │
   │                         │ recipe-scans (private)      │
   │  rows                   └─────────────────────────────┘
   ├────────────────────────► Supabase Postgres (RLS by family)
   │
   │  invoke translate-recipe
   └────────────────────────► Supabase Edge Function ──► Gemini
                                (holds GEMINI_API_KEY)
```

The Gemini key is a Supabase secret. It is read inside the Edge Function only,
so it never reaches the browser.

## Layout

| Path | What it holds |
| --- | --- |
| `src/` | React app: sign in, upload, card list, side-by-side view |
| `src/lib/api.ts` | Every database and storage call the UI makes |
| `supabase/migrations/` | Schema and row level security |
| `supabase/functions/translate-recipe/` | Reads the scan, calls Gemini, stores the result |
| `supabase/functions/_shared/prompt.ts` | The instructions and output schema Gemini follows |
| `netlify.toml` | Build command and single-page-app redirect |

## Data model

- `families` and `family_members` — a family owns recipes; membership decides
  every read and write.
- `profiles` — display name per auth user, created by trigger on sign-up.
- `recipes` — one card, with the family context the reader supplies.
- `recipe_images` — object keys in the `recipe-scans` bucket. The key starts
  with the family id, which is what the Storage policies check.
- `translations` — one row per run, versioned. `transcription` is what the card
  says; `translated` is the modern recipe as JSON.
- `interview_questions` and `interview_answers` — what the card does not say.

Row level security is on for every table. A user reads a row only if they are a
member of that row's family. The Edge Function proves membership with the
caller's own token before it writes anything with the service role.

## Set up

### 1. Supabase

The hosted project already exists:

- URL: `https://pwruhqpefkbbrkgmgehn.supabase.co`
- Schema and the `recipe-scans` bucket are applied.

To work on it from a clone:

```bash
npm install -g supabase
supabase login
supabase link --project-ref pwruhqpefkbbrkgmgehn
```

### 2. The Gemini key

This is the one step that cannot be scripted from the repository, because the
key must not be committed. Run either of these:

```bash
supabase secrets set GEMINI_API_KEY=your-key-here
```

or set it in the dashboard, under **Project settings → Edge Functions →
Secrets**. Get a key from Google AI Studio.

Optional: set `GEMINI_MODEL` to use another multimodal model. The default is
`gemini-3.6-flash`.

Check it took:

```bash
supabase secrets list
```

### 3. The frontend

```bash
npm install
cp .env.example .env.local
npm run dev
```

`.env.local` holds only the project URL and the publishable key. Both are safe
in the browser: they can do only what row level security allows.

### 4. Netlify

Connect the repository, then set these build settings (they are already in
`netlify.toml`):

- Build command: `npm run build`
- Publish directory: `dist`

Add the two `VITE_` variables from `.env.example` under **Site configuration →
Environment variables**. Do not add `GEMINI_API_KEY` — Netlify never needs it.

The live site is https://recipe-rosetta.netlify.app. It builds from `main`,
and both `VITE_` variables are already set on it.

### 5. Auth URLs

Do this before the first sign-up, or confirmation links go nowhere.

A new Supabase project sets its Site URL to `http://localhost:3000`. That is
the default target for confirmation and password-reset links, so every link
sends the user to a port nothing listens on.

Under **Authentication → URL Configuration**:

- **Site URL**: `https://recipe-rosetta.netlify.app`
- **Redirect URLs**: add `https://recipe-rosetta.netlify.app/**` and
  `http://localhost:5173/**` for local work. The dev server uses port 5173,
  not 3000.

Sign-up also passes `emailRedirectTo: window.location.origin`, so a link
returns to whichever origin the person signed up from. That origin must still
appear in the Redirect URLs list, or Supabase falls back to the Site URL.

Two things about confirmation links:

- They work once. Mail providers scan links before the reader clicks, which
  can spend the link. The reader then sees `otp_expired` although the account
  is already confirmed. They can simply sign in.
- To skip email confirmation while testing, turn off **Authentication →
  Sign In / Providers → Email → Confirm email**.

## Deploying changes

```bash
supabase db push                              # migrations
supabase functions deploy translate-recipe    # the Gemini function
git push                                      # Netlify builds the frontend
```

## What is built, and what is next

Built:

- Email and password accounts, one family per new account.
- Upload a scan to the private bucket.
- One call to Gemini that transcribes the handwriting and writes the modern
  recipe, with substitutions and the assumptions it had to make.
- Side-by-side view: the scan on the left, the translation on the right.
- **The interview.** Gemini writes the questions the card leaves open. The
  family answers them, and the next translation gets those answers in its
  prompt, so memory decides what the handwriting could not. Answers replace
  rather than accumulate, and each run is stored as a new version, so nothing
  earlier is lost.

Next:

1. **Sharing** — `recipes.is_public` and `recipes.share_slug` exist. Sharing
   needs a read policy for anonymous users on the public rows, a matching
   Storage policy for their scans, and a `/share/:slug` route.
2. **Invites** — adding another person to a family. `family_members` and its
   policies are in place; the invitation flow is not.
3. **Version history** — every translation is kept, but only the newest is
   shown. Nothing yet lets the reader compare two runs.

## Security notes

- Row level security is on for all eight tables and for the `recipe-scans`
  bucket. A user reads and writes only rows that belong to a family they are a
  member of.
- The Edge Function proves membership with the caller's own token before it
  uses the service role for any write.
- `GEMINI_API_KEY` is a Supabase secret. It is not in the repository, not in
  `.env.example`, and not in the Netlify build.
- The Supabase security linter reports two remaining warnings, for
  `is_family_member` and `is_family_owner`. Leave them. A row level security
  policy runs with the privileges of the querying role, so `authenticated`
  must keep `EXECUTE` on both, or every policy that calls them fails.

## Generated types

The client is untyped today. To generate types from the live schema:

```bash
supabase gen types typescript --project-id pwruhqpefkbbrkgmgehn > src/lib/database.types.ts
```

Then pass the `Database` type to `createClient<Database>` in `src/lib/supabase.ts`.
