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

### 5. Auth

A new Supabase project asks for email confirmation on sign-up. For quick
testing, turn it off under **Authentication → Sign In / Providers → Email →
Confirm email**, or confirm the address from the inbox.

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
- The questions Gemini could not answer are stored, ready for the interview.

Next:

1. **Interview** — a form that answers `interview_questions` and runs the
   translation again. The Edge Function already reads the answers back and
   feeds them to Gemini, so this is a UI change.
2. **Sharing** — `recipes.is_public` and `recipes.share_slug` exist. Sharing
   needs a read policy for anonymous users on the public rows, a matching
   Storage policy for their scans, and a `/share/:slug` route.
3. **Invites** — adding another person to a family. `family_members` and its
   policies are in place; the invitation flow is not.

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
