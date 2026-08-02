-- Use readable post URLs while retaining a stable suffix only when titles collide.
create or replace function public.next_blog_slug(raw_title text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  base text := lower(regexp_replace(coalesce(raw_title, ''), '[^a-zA-Z0-9]+', '-', 'g'));
  candidate text;
  suffix integer := 1;
begin
  base := trim(both '-' from base);
  base := left(coalesce(nullif(base, ''), 'post'), 72);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('slug:' || base, 0));
  candidate := base;
  while exists (select 1 from public.blogs where slug = candidate) loop
    suffix := suffix + 1;
    candidate := left(base, 72 - length(suffix::text) - 1) || '-' || suffix;
  end loop;
  return candidate;
end;
$$;

-- Repair legacy UUID-style slugs without changing existing readable URLs.
alter table public.blogs disable trigger secure_blog_update;
update public.blogs
set slug = coalesce(
  nullif(left(trim(both '-' from lower(regexp_replace(title, '[^a-zA-Z0-9]+', '-', 'g'))), 64), ''),
  'post'
) || '-' || id
where slug ~ '^[0-9a-f]{32}$';
alter table public.blogs enable trigger secure_blog_update;

create or replace function public.handle_blog_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_approved_member() then
    raise exception 'Approved AAL2 membership required';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('blog:' || (select auth.uid())::text, 0));
  if coalesce(new.url, '') <> '' and new.url !~* '^https?://' then
    raise exception 'Only HTTP and HTTPS URLs are allowed';
  end if;
  if exists (select 1 from public.blogs where author_id = (select auth.uid()) and published_at > pg_catalog.now() - interval '60 seconds') then
    raise exception 'Please wait before posting again';
  end if;
  select coalesce(username, (select auth.uid())::text) into new.author from public.profiles where id = (select auth.uid());
  new.author_id := (select auth.uid());
  new.slug := public.next_blog_slug(new.title);
  new.status := 'published'; new.published_at := pg_catalog.now();
  new.likes_count := 0; new.comments_count := 0; new.clicks_count := 0;
  return new;
end;
$$;

revoke execute on function public.next_blog_slug(text) from public, anon, authenticated;
