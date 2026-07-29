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
    case when invited then 'approved' else 'pending' end,
    'member',
    case when invited then pg_catalog.now() else null end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

commit;
