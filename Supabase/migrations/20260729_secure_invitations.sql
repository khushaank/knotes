-- High-entropy, single-use, email-bound invitations enforced inside the auth transaction.
begin;

create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null check (
    char_length(email) between 3 and 254
    and email = lower(btrim(email))
  ),
  code_hash bytea not null unique,
  claim_hash bytea,
  claim_expires_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid,
  check (expires_at > created_at)
);

-- Keep this final hardening migration usable after the baseline schema even
-- when a project did not previously run the private-circle migration.
alter table public.profiles
  add column if not exists membership_status text not null default 'pending',
  add column if not exists role text not null default 'member',
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references auth.users(id);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_membership_status_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles add constraint profiles_membership_status_check
      check (membership_status in ('pending', 'approved', 'suspended', 'rejected'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_role_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles add constraint profiles_role_check
      check (role in ('member', 'moderator', 'admin'));
  end if;
end $$;

alter table public.invitations enable row level security;
revoke all on public.invitations from public, anon, authenticated;

-- Run this only from the Supabase SQL editor:
-- select private.create_invitation('person@example.com', 7);
-- The database generates 104 random bits and returns the code once. Never choose a human password.
create or replace function private.create_invitation(
  invite_email text,
  valid_days integer default 7
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_email text := lower(btrim(coalesce(invite_email, '')));
  raw_code text;
  display_code text;
begin
  if clean_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or char_length(clean_email) not between 3 and 254
    or valid_days not between 1 and 30
  then
    raise exception 'Invalid invitation';
  end if;

  raw_code := 'KN' || upper(encode(extensions.gen_random_bytes(13), 'hex'));
  display_code := substr(raw_code, 1, 6) || '-' ||
                  substr(raw_code, 7, 4) || '-' ||
                  substr(raw_code, 11, 4) || '-' ||
                  substr(raw_code, 15, 4) || '-' ||
                  substr(raw_code, 19, 10);

  insert into public.invitations (email, code_hash, expires_at)
  values (
    clean_email,
    extensions.digest(raw_code, 'sha256'),
    pg_catalog.now() + pg_catalog.make_interval(days => valid_days)
  );

  return display_code;
end;
$$;

revoke execute on function private.create_invitation(text, integer) from public, anon, authenticated;

-- This SECURITY DEFINER RPC is intentionally public and narrowly scoped: it exposes no row
-- data, compares a 104-bit bearer secret by hash, and returns only a short-lived random claim.
create or replace function public.begin_invitation(invitation_code text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  supplied_code text;
  matched_id uuid;
  raw_claim text;
begin
  supplied_code := upper(
    pg_catalog.regexp_replace(
      coalesce(invitation_code, ''),
      '[^A-Z0-9]',
      '',
      'g'
    )
  );

  if char_length(supplied_code) <> 28 then
    raise exception 'Invalid invitation';
  end if;

  select id
  into matched_id
  from public.invitations
  where code_hash = extensions.digest(supplied_code, 'sha256')
    and used_at is null
    and expires_at > pg_catalog.now()
  for update;

  if matched_id is null then
    raise exception 'Invalid invitation';
  end if;

  raw_claim := encode(extensions.gen_random_bytes(24), 'hex');
  update public.invitations
  set claim_hash = extensions.digest(raw_claim, 'sha256'),
      claim_expires_at = pg_catalog.now() + interval '15 minutes'
  where id = matched_id;

  return raw_claim;
end;
$$;

revoke execute on function public.begin_invitation(text) from public;
grant execute on function public.begin_invitation(text) to anon, authenticated;

create or replace function private.validate_invited_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  supplied_claim text := coalesce(new.raw_user_meta_data ->> 'invite_claim', '');
  matched_id uuid;
begin
  if supplied_claim !~ '^[a-f0-9]{48}$' then
    raise exception 'A valid invitation is required';
  end if;

  select id
  into matched_id
  from public.invitations
  where email = lower(new.email)
    and claim_hash = extensions.digest(supplied_claim, 'sha256')
    and claim_expires_at > pg_catalog.now()
    and used_at is null
    and expires_at > pg_catalog.now()
  for update;

  if matched_id is null then
    raise exception 'A valid invitation is required';
  end if;

  update public.invitations
  set used_at = pg_catalog.now(),
      used_by = new.id,
      claim_hash = null,
      claim_expires_at = null
  where id = matched_id;

  new.raw_user_meta_data :=
    coalesce(new.raw_user_meta_data, '{}'::jsonb) - 'invite_claim';
  return new;
end;
$$;

revoke execute on function private.validate_invited_signup() from public, anon, authenticated;
drop trigger if exists validate_invited_signup on auth.users;
create trigger validate_invited_signup
before insert on auth.users
for each row execute function private.validate_invited_signup();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  base_username text;
  invited boolean;
begin
  select exists (
    select 1
    from public.invitations
    where used_by = new.id
      and used_at is not null
  ) into invited;

  base_username := left(
    coalesce(
      nullif(pg_catalog.regexp_replace(split_part(new.email, '@', 1), '[^a-zA-Z0-9]', '', 'g'), ''),
      'member'
    ),
    27
  );

  insert into public.profiles (
    id,
    email,
    username,
    membership_status,
    role,
    approved_at
  )
  values (
    new.id,
    new.email,
    lower(base_username) || '-' || left(new.id::text, 8),
    'pending',
    'member',
    null
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- An invitation creates an account, not membership. The account becomes approved
-- only after the same user proves a verified second factor and receives AAL2.
create or replace function public.complete_invited_membership()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null
    or coalesce((select auth.jwt() ->> 'aal'), 'aal1') <> 'aal2'
    or not exists (
      select 1 from public.invitations
      where used_by = (select auth.uid()) and used_at is not null
    )
  then
    return false;
  end if;

  update public.profiles
  set membership_status = 'approved',
      approved_at = pg_catalog.now(),
      approved_by = (select auth.uid())
  where id = (select auth.uid())
    and membership_status = 'pending'
    and role = 'member';

  return exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and membership_status = 'approved'
  );
end;
$$;

revoke execute on function public.complete_invited_membership() from public, anon;
grant execute on function public.complete_invited_membership() to authenticated;

-- Every private-content policy and sensitive RPC routes through these checks.
-- A valid password session (AAL1) can reach only the user's profile to enroll MFA.
create or replace function public.is_approved_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select auth.jwt() ->> 'aal'), 'aal1') = 'aal2'
    and exists (
      select 1 from public.profiles
      where id = (select auth.uid())
        and membership_status = 'approved'
    );
$$;

create or replace function public.is_admin_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_approved_member()
    and exists (
      select 1 from public.profiles
      where id = (select auth.uid())
        and role = 'admin'
        and approved_by is not null
    );
$$;

revoke execute on function public.is_approved_member() from public, anon;
revoke execute on function public.is_admin_member() from public, anon;
grant execute on function public.is_approved_member() to authenticated;
grant execute on function public.is_admin_member() to authenticated;

-- Server owns post identity, publication state, author, counters, and timestamps.
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
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('blog:' || (select auth.uid())::text, 0)
  );
  if coalesce(new.url, '') <> '' and new.url !~* '^https?://' then
    raise exception 'Only HTTP and HTTPS URLs are allowed';
  end if;
  if exists (
    select 1 from public.blogs
    where author_id = (select auth.uid())
      and published_at > pg_catalog.now() - interval '60 seconds'
  ) then
    raise exception 'Please wait before posting again';
  end if;

  select coalesce(username, (select auth.uid())::text)
  into new.author
  from public.profiles
  where id = (select auth.uid());

  new.author_id := (select auth.uid());
  new.slug := encode(extensions.gen_random_bytes(16), 'hex');
  new.status := 'published';
  new.published_at := pg_catalog.now();
  new.likes_count := 0;
  new.comments_count := 0;
  new.clicks_count := 0;
  return new;
end;
$$;

-- Direct clients may edit content, never ranking or ownership fields.
create or replace function public.handle_blog_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not public.is_admin_member() then
    new.author_id := old.author_id;
    new.author := old.author;
    new.slug := old.slug;
    new.status := old.status;
    new.published_at := old.published_at;
    new.likes_count := old.likes_count;
    new.comments_count := old.comments_count;
    new.clicks_count := old.clicks_count;
  end if;
  return new;
end;
$$;

revoke execute on function public.handle_blog_insert() from public, anon, authenticated;
revoke execute on function public.handle_blog_update() from public, anon, authenticated;

drop trigger if exists secure_blog_insert on public.blogs;
create trigger secure_blog_insert
before insert on public.blogs
for each row execute function public.handle_blog_insert();

drop trigger if exists secure_blog_update on public.blogs;
create trigger secure_blog_update
before update on public.blogs
for each row execute function public.handle_blog_update();

-- Comments receive server identity/time, a hard size bound, and per-user pacing.
create or replace function public.handle_comment_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_approved_member()
    or char_length(btrim(coalesce(new.comment_text, ''))) not between 1 and 4000
  then
    raise exception 'Invalid comment';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('comment:' || (select auth.uid())::text, 0)
  );
  if exists (
    select 1 from public.comments
    where user_id = (select auth.uid())
      and created_at > pg_catalog.now() - interval '10 seconds'
  ) then
    raise exception 'Please wait before commenting again';
  end if;

  select coalesce(username, (select auth.uid())::text)
  into new.user_name
  from public.profiles
  where id = (select auth.uid());

  new.user_id := (select auth.uid());
  new.created_at := pg_catalog.now();
  new.comment_text := btrim(new.comment_text);
  return new;
end;
$$;

revoke execute on function public.handle_comment_insert() from public, anon, authenticated;

drop trigger if exists secure_comment_insert on public.comments;
create trigger secure_comment_insert
before insert on public.comments
for each row execute function public.handle_comment_insert();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'comments_text_length'
      and conrelid = 'public.comments'::regclass
  ) then
    alter table public.comments
      add constraint comments_text_length
      check (char_length(btrim(comment_text)) between 1 and 4000) not valid;
  end if;
end $$;

-- Count at most one click per member/post. Refreshes and scripts cannot inflate rank.
create table if not exists private.blog_clicks (
  user_id uuid not null references auth.users(id) on delete cascade,
  blog_id bigint not null references public.blogs(id) on delete cascade,
  clicked_at timestamptz not null default now(),
  primary key (user_id, blog_id)
);
revoke all on private.blog_clicks from public, anon, authenticated;

create or replace function public.increment_blog_clicks(blog_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_approved_member() then return; end if;

  insert into private.blog_clicks (user_id, blog_id)
  values ((select auth.uid()), increment_blog_clicks.blog_id)
  on conflict do nothing;

  if found then
    update public.blogs
    set clicks_count = coalesce(clicks_count, 0) + 1
    where id = increment_blog_clicks.blog_id and status = 'published';
  end if;
end;
$$;

revoke execute on function public.increment_blog_clicks(bigint) from public, anon;
grant execute on function public.increment_blog_clicks(bigint) to authenticated;

-- ponytail: global public-request cap; use an edge/IP limiter if legitimate volume exceeds this.
create or replace function public.request_membership(
  request_name text,
  request_email text,
  request_note text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_name text := btrim(coalesce(request_name, ''));
  clean_email text := lower(btrim(coalesce(request_email, '')));
  clean_note text := btrim(coalesce(request_note, ''));
begin
  if char_length(clean_name) not between 1 and 80
    or char_length(clean_note) not between 20 and 1200
    or char_length(clean_email) not between 3 and 254
    or clean_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  then
    raise exception 'Invalid membership request';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('membership-requests', 0));
  if (select count(*) from public.membership_requests
      where created_at > pg_catalog.now() - interval '1 minute') >= 20
  then
    raise exception 'Requests are temporarily limited';
  end if;
  if exists (
    select 1 from public.membership_requests
    where email = clean_email
      and created_at > pg_catalog.now() - interval '24 hours'
  ) then
    return;
  end if;

  insert into public.membership_requests (name, email, note)
  values (clean_name, clean_email, clean_note);
end;
$$;

revoke execute on function public.request_membership(text, text, text) from public;
grant execute on function public.request_membership(text, text, text) to anon, authenticated;

-- Media stays private. Owners can inspect drafts; members can read an object only
-- after its stable kn-media reference appears in a published post.
update storage.buckets
set public = false,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    file_size_limit = 10485760
where id = 'media';

drop policy if exists "Approved members can view media" on storage.objects;
create policy "Approved members can view media"
on storage.objects for select to authenticated
using (
  public.is_approved_member()
  and bucket_id = 'media'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or exists (
      select 1 from public.blogs
      where status = 'published'
        and position(('kn-media://' || pg_catalog.replace(name, '/', '%2F')) in content) > 0
    )
  )
);

-- Existing optional hidden-story tables must not retain anonymous grants or RLS gaps.
do $$
begin
  if to_regclass('public.hidden_stories') is not null then
    execute 'alter table public.hidden_stories enable row level security';
    execute 'revoke all on public.hidden_stories from public, anon';
  end if;
end $$;

commit;
