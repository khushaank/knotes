begin;

revoke execute on function public.community_size() from public, anon, authenticated;
drop function if exists public.community_size();

commit;
