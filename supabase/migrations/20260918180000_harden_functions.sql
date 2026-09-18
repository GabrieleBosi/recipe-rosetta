-- Close the two findings from the Supabase security linter.
--
-- 1. Pin search_path on the functions that did not set one, so a caller cannot
--    change which schema a bare name resolves to.
-- 2. Take the helper functions off the public REST surface. Every function in
--    the `public` schema is exposed at /rest/v1/rpc/<name>, and PUBLIC holds
--    EXECUTE by default, so anon could call them.
--
-- Careful: a row level security policy is evaluated with the privileges of the
-- role running the query. `authenticated` must keep EXECUTE on the helpers the
-- policies call, or every policy that uses them starts failing. Trigger
-- functions are different: Postgres checks EXECUTE when the trigger is created,
-- not when it fires, so those can be revoked from everyone.

alter function public.safe_uuid(text) set search_path = '';
alter function public.set_updated_at() set search_path = '';

-- Called only by triggers.
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.handle_new_family() from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;

-- Called by policies, so `authenticated` keeps EXECUTE and anon loses it.
revoke all on function public.is_family_member(uuid) from public, anon;
revoke all on function public.is_family_owner(uuid) from public, anon;
revoke all on function public.safe_uuid(text) from public, anon;

grant execute on function public.is_family_member(uuid) to authenticated, service_role;
grant execute on function public.is_family_owner(uuid) to authenticated, service_role;
grant execute on function public.safe_uuid(text) to authenticated, service_role;

-- After this migration the linter still reports is_family_member and
-- is_family_owner as callable by `authenticated`. That is deliberate and must
-- stay: the policies need it. The residue is small, because a signed-in user
-- can only learn whether they themselves belong to a family id they already
-- hold, which their own queries tell them anyway.
