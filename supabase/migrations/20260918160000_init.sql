-- recipe-rosetta: core schema
--
-- Families own recipes. Every row is scoped to a family, and RLS keys off
-- membership of that family.
--
-- Order matters: Postgres validates SQL function bodies at CREATE time, so the
-- tables come before the helpers that read them.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- helpers with no table dependencies
-- ---------------------------------------------------------------------------

-- Cast text to uuid without raising. Storage paths are user-supplied, so a bad
-- prefix must fail the policy check instead of aborting the statement.
create or replace function public.safe_uuid(p_text text)
returns uuid
language plpgsql
immutable
as $$
begin
  return p_text::uuid;
exception when others then
  return null;
end;
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.families (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 1 and 120),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.family_members (
  family_id  uuid not null references public.families (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (family_id, user_id)
);

create index family_members_user_id_idx on public.family_members (user_id);

create table public.recipes (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid not null references public.families (id) on delete cascade,
  created_by    uuid references auth.users (id) on delete set null,
  title         text,
  -- Family context the handwriting does not give.
  attributed_to text,          -- whose recipe it was
  source_note   text,          -- e.g. "index card, kitchen drawer, c. 1958"
  status        text not null default 'uploaded'
                  check (status in ('uploaded', 'processing', 'translated', 'failed')),
  error_message text,
  -- Sharing. Policies for anonymous read arrive with the sharing feature.
  is_public     boolean not null default false,
  share_slug    text unique,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index recipes_family_id_idx on public.recipes (family_id, created_at desc);

create table public.recipe_images (
  id           uuid primary key default gen_random_uuid(),
  recipe_id    uuid not null references public.recipes (id) on delete cascade,
  -- Object key in the private "recipe-scans" bucket:
  --   <family_id>/<recipe_id>/<uuid>.<ext>
  storage_path text not null unique,
  position     int  not null default 0,
  mime_type    text,
  byte_size    bigint,
  created_at   timestamptz not null default now()
);

create index recipe_images_recipe_id_idx on public.recipe_images (recipe_id, position);

create table public.translations (
  id            uuid primary key default gen_random_uuid(),
  recipe_id     uuid not null references public.recipes (id) on delete cascade,
  version       int  not null default 1,
  -- What Gemini read off the card, as written.
  transcription text,
  -- The modern, cookable version. See src/lib/types.ts for the shape.
  translated    jsonb not null default '{}'::jsonb,
  -- Assumptions and substitutions the model made, for the reader to check.
  notes         text,
  model         text,
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (recipe_id, version)
);

create index translations_recipe_id_idx on public.translations (recipe_id, version desc);

create table public.interview_questions (
  id         uuid primary key default gen_random_uuid(),
  recipe_id  uuid not null references public.recipes (id) on delete cascade,
  question   text not null,
  -- Why the model asks: which gap in the card this closes.
  rationale  text,
  position   int  not null default 0,
  created_at timestamptz not null default now()
);

create index interview_questions_recipe_id_idx
  on public.interview_questions (recipe_id, position);

create table public.interview_answers (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null unique references public.interview_questions (id) on delete cascade,
  recipe_id   uuid not null references public.recipes (id) on delete cascade,
  answer      text not null,
  answered_by uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

create index interview_answers_recipe_id_idx on public.interview_answers (recipe_id);

-- ---------------------------------------------------------------------------
-- membership helpers
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER so membership policies can read family_members without
-- recursing into that table's own RLS policy.
create or replace function public.is_family_member(p_family_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.family_members fm
    where fm.family_id = p_family_id
      and fm.user_id = auth.uid()
  );
$$;

create or replace function public.is_family_owner(p_family_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.family_members fm
    where fm.family_id = p_family_id
      and fm.user_id = auth.uid()
      and fm.role = 'owner'
  );
$$;

-- ---------------------------------------------------------------------------
-- triggers
-- ---------------------------------------------------------------------------

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger families_set_updated_at
  before update on public.families
  for each row execute function public.set_updated_at();

create trigger recipes_set_updated_at
  before update on public.recipes
  for each row execute function public.set_updated_at();

-- Give every new auth user a profile row.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- The creator of a family becomes its owner.
create or replace function public.handle_new_family()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.family_members (family_id, user_id, role)
  values (new.id, coalesce(new.created_by, auth.uid()), 'owner')
  on conflict do nothing;
  return new;
end;
$$;

create trigger on_family_created
  after insert on public.families
  for each row execute function public.handle_new_family();

-- ---------------------------------------------------------------------------
-- row level security
-- ---------------------------------------------------------------------------

alter table public.profiles            enable row level security;
alter table public.families            enable row level security;
alter table public.family_members      enable row level security;
alter table public.recipes             enable row level security;
alter table public.recipe_images       enable row level security;
alter table public.translations        enable row level security;
alter table public.interview_questions enable row level security;
alter table public.interview_answers   enable row level security;

-- profiles: read anyone you share a family with; write only yourself.
create policy "profiles readable by family" on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1
      from public.family_members mine
      join public.family_members theirs on theirs.family_id = mine.family_id
      where mine.user_id = auth.uid()
        and theirs.user_id = public.profiles.id
    )
  );

create policy "profiles insert own" on public.profiles
  for insert to authenticated with check (id = auth.uid());

create policy "profiles update own" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- families
create policy "families readable by members" on public.families
  for select to authenticated using (public.is_family_member(id));

create policy "families insert by creator" on public.families
  for insert to authenticated with check (created_by = auth.uid());

create policy "families update by owner" on public.families
  for update to authenticated
  using (public.is_family_owner(id)) with check (public.is_family_owner(id));

create policy "families delete by owner" on public.families
  for delete to authenticated using (public.is_family_owner(id));

-- family_members
create policy "members readable by family" on public.family_members
  for select to authenticated using (public.is_family_member(family_id));

create policy "members insert by owner" on public.family_members
  for insert to authenticated with check (public.is_family_owner(family_id));

create policy "members update by owner" on public.family_members
  for update to authenticated
  using (public.is_family_owner(family_id)) with check (public.is_family_owner(family_id));

-- An owner can remove anyone; a member can remove themselves.
create policy "members delete by owner or self" on public.family_members
  for delete to authenticated
  using (public.is_family_owner(family_id) or user_id = auth.uid());

-- recipes
create policy "recipes readable by family" on public.recipes
  for select to authenticated using (public.is_family_member(family_id));

create policy "recipes insert by family" on public.recipes
  for insert to authenticated
  with check (public.is_family_member(family_id) and created_by = auth.uid());

create policy "recipes update by family" on public.recipes
  for update to authenticated
  using (public.is_family_member(family_id)) with check (public.is_family_member(family_id));

create policy "recipes delete by family" on public.recipes
  for delete to authenticated using (public.is_family_member(family_id));

-- recipe_images
create policy "images readable by family" on public.recipe_images
  for select to authenticated
  using (exists (
    select 1 from public.recipes r
    where r.id = recipe_id and public.is_family_member(r.family_id)
  ));

create policy "images insert by family" on public.recipe_images
  for insert to authenticated
  with check (exists (
    select 1 from public.recipes r
    where r.id = recipe_id and public.is_family_member(r.family_id)
  ));

create policy "images delete by family" on public.recipe_images
  for delete to authenticated
  using (exists (
    select 1 from public.recipes r
    where r.id = recipe_id and public.is_family_member(r.family_id)
  ));

-- translations: the Edge Function writes these with the service role, which
-- bypasses RLS. Clients read only.
create policy "translations readable by family" on public.translations
  for select to authenticated
  using (exists (
    select 1 from public.recipes r
    where r.id = recipe_id and public.is_family_member(r.family_id)
  ));

-- interview_questions: written by the Edge Function, read by the family.
create policy "questions readable by family" on public.interview_questions
  for select to authenticated
  using (exists (
    select 1 from public.recipes r
    where r.id = recipe_id and public.is_family_member(r.family_id)
  ));

-- interview_answers: the family answers.
create policy "answers readable by family" on public.interview_answers
  for select to authenticated
  using (exists (
    select 1 from public.recipes r
    where r.id = recipe_id and public.is_family_member(r.family_id)
  ));

create policy "answers insert by family" on public.interview_answers
  for insert to authenticated
  with check (
    answered_by = auth.uid()
    and exists (
      select 1 from public.recipes r
      where r.id = recipe_id and public.is_family_member(r.family_id)
    )
  );

create policy "answers update by family" on public.interview_answers
  for update to authenticated
  using (exists (
    select 1 from public.recipes r
    where r.id = recipe_id and public.is_family_member(r.family_id)
  ))
  with check (exists (
    select 1 from public.recipes r
    where r.id = recipe_id and public.is_family_member(r.family_id)
  ));
