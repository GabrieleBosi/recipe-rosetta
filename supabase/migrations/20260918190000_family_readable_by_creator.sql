-- Let a family's creator read it, not only its members.
--
-- Why this is needed:
--
-- public.families has an AFTER INSERT trigger that adds the creator to
-- family_members as owner. PostgreSQL queues AFTER ROW triggers until the end
-- of the statement, but it applies the SELECT policy to a RETURNING clause
-- while the row is still being inserted. At that moment the creator is not yet
-- a member, so is_family_member(id) is false and
--
--   insert into public.families (...) returning *
--
-- fails with "new row violates row-level security policy for table families",
-- even though the INSERT check itself passed. PostgREST uses RETURNING whenever
-- the client asks for the created row, which is what supabase-js does by
-- default. That broke the first action every new account takes.
--
-- Verified: the same insert without RETURNING returns 201.
--
-- This grants no lasting access the creator does not get anyway, because the
-- trigger makes them owner in the same statement.

drop policy "families readable by members" on public.families;

create policy "families readable by members" on public.families
  for select to authenticated
  using (public.is_family_member(id) or created_by = auth.uid());
