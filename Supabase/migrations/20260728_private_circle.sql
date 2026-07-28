-- Minimal private-circle migration. Review and apply in a staging project first.
begin;

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

-- Existing administrators remain usable. All other pre-existing accounts
-- require an explicit review, which is the secure default for an invite-only site.
update public.profiles
set membership_status = 'approved',
    role = 'admin',
    approved_at = coalesce(approved_at, now())
where is_admin is true;

create or replace function public.is_approved_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
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
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and membership_status = 'approved'
      and (role = 'admin' or is_admin is true)
  );
$$;

revoke execute on function public.is_approved_member() from public, anon;
revoke execute on function public.is_admin_member() from public, anon;
grant execute on function public.is_approved_member() to authenticated;
grant execute on function public.is_admin_member() to authenticated;

create or replace function public.protect_profile_membership()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (
    new.membership_status is distinct from old.membership_status
    or new.role is distinct from old.role
    or new.approved_at is distinct from old.approved_at
    or new.approved_by is distinct from old.approved_by
    or new.is_admin is distinct from old.is_admin
  ) and not public.is_admin_member() then
    raise exception 'Membership fields cannot be changed by this account';
  end if;
  return new;
end;
$$;

revoke execute on function public.protect_profile_membership() from public, anon, authenticated;
drop trigger if exists protect_profile_membership on public.profiles;
create trigger protect_profile_membership
before update on public.profiles
for each row execute function public.protect_profile_membership();

create table if not exists public.membership_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  email text not null check (char_length(email) between 3 and 254),
  note text not null check (char_length(note) between 20 and 1200),
  status text not null default 'pending' check (status in ('pending', 'invited', 'declined')),
  created_at timestamptz not null default now()
);

alter table public.membership_requests enable row level security;
revoke all on public.membership_requests from public, anon, authenticated;

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

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(clean_email, 0));
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

create or replace function public.community_size()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(
    500,
    count(*) filter (where membership_status = 'approved')::integer
  )
  from public.profiles;
$$;

revoke execute on function public.community_size() from public;
grant execute on function public.community_size() to anon, authenticated;

-- Private community content: anonymous grants are removed and every operation
-- is tied to an approved member. Profiles remain self-readable so pending
-- accounts can be denied cleanly by the application.
revoke all on public.blogs, public.comments, public.likes, public.bookmarks, public.profiles from anon;

alter table public.blogs enable row level security;
drop policy if exists "Published blogs are viewable by everyone" on public.blogs;
drop policy if exists "Approved members can read blogs" on public.blogs;
create policy "Approved members can read blogs"
on public.blogs for select to authenticated
using (public.is_approved_member() and status = 'published');
drop policy if exists "Authenticated users can create blogs" on public.blogs;
create policy "Approved members can create blogs"
on public.blogs for insert to authenticated
with check (public.is_approved_member() and author_id = (select auth.uid()));
drop policy if exists "Users can update their own blogs" on public.blogs;
create policy "Approved members can update own blogs"
on public.blogs for update to authenticated
using (public.is_approved_member() and (author_id = (select auth.uid()) or public.is_admin_member()))
with check (public.is_approved_member() and (author_id = (select auth.uid()) or public.is_admin_member()));
drop policy if exists "Users can delete their own blogs" on public.blogs;
create policy "Approved members can delete own blogs"
on public.blogs for delete to authenticated
using (public.is_approved_member() and (author_id = (select auth.uid()) or public.is_admin_member()));

alter table public.comments enable row level security;
drop policy if exists "Comments are viewable by everyone" on public.comments;
create policy "Approved members can read comments"
on public.comments for select to authenticated
using (public.is_approved_member());
drop policy if exists "Authenticated users can post comments" on public.comments;
create policy "Approved members can create comments"
on public.comments for insert to authenticated
with check (public.is_approved_member() and user_id = (select auth.uid()));
drop policy if exists "Users can update their own comments" on public.comments;
create policy "Approved members can update own comments"
on public.comments for update to authenticated
using (public.is_approved_member() and user_id = (select auth.uid()))
with check (public.is_approved_member() and user_id = (select auth.uid()));
drop policy if exists "Users can delete their own comments" on public.comments;
create policy "Approved members can delete own comments"
on public.comments for delete to authenticated
using (public.is_approved_member() and (user_id = (select auth.uid()) or public.is_admin_member()));

alter table public.likes enable row level security;
drop policy if exists "Users can manage their own likes" on public.likes;
create policy "Approved members manage own likes"
on public.likes for all to authenticated
using (public.is_approved_member() and user_id = (select auth.uid()))
with check (public.is_approved_member() and user_id = (select auth.uid()));

alter table public.bookmarks enable row level security;
drop policy if exists "Users can view their own bookmarks" on public.bookmarks;
drop policy if exists "Users can manage their own bookmarks" on public.bookmarks;
create policy "Approved members manage own bookmarks"
on public.bookmarks for all to authenticated
using (public.is_approved_member() and user_id = (select auth.uid()))
with check (public.is_approved_member() and user_id = (select auth.uid()));

alter table public.profiles enable row level security;
drop policy if exists "Users can view their own profile" on public.profiles;
create policy "Accounts can view own profile"
on public.profiles for select to authenticated
using (id = (select auth.uid()));
drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Accounts can insert own pending profile"
on public.profiles for insert to authenticated
with check (
  id = (select auth.uid())
  and membership_status = 'pending'
  and role = 'member'
  and is_admin is not true
);
drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Approved members can update own profile"
on public.profiles for update to authenticated
using (public.is_approved_member() and id = (select auth.uid()))
with check (public.is_approved_member() and id = (select auth.uid()));

do $$
begin
  if to_regclass('public.hidden_stories') is not null then
    execute 'drop policy if exists "Users can view their hidden stories" on public.hidden_stories';
    execute 'drop policy if exists "Users can hide stories" on public.hidden_stories';
    execute 'drop policy if exists "Users can restore hidden stories" on public.hidden_stories';
    execute 'create policy "Approved members manage hidden stories" on public.hidden_stories
      for all to authenticated
      using (public.is_approved_member() and user_id = (select auth.uid()))
      with check (public.is_approved_member() and user_id = (select auth.uid()))';
  end if;
end $$;

-- SECURITY DEFINER search previously bypassed RLS. Run it as the caller and
-- remove anonymous execution so the blogs policy remains authoritative.
alter function public.search_all_content(text, integer, integer) security invoker;
revoke execute on function public.search_all_content(text, integer, integer) from public, anon;
grant execute on function public.search_all_content(text, integer, integer) to authenticated;

update storage.buckets set public = false where id in ('avatars', 'media');
drop policy if exists "Media is publicly viewable" on storage.objects;
drop policy if exists "Approved members can view media" on storage.objects;
create policy "Approved members can view media"
on storage.objects for select to authenticated
using (
  public.is_approved_member()
  and (
    bucket_id = 'media'
    or (
      bucket_id = 'avatars'
      and (storage.foldername(name))[1] = (select auth.uid())::text
    )
  )
);

drop policy if exists "Users can view their own avatar" on storage.objects;
drop policy if exists "Users can upload their own avatar" on storage.objects;
drop policy if exists "Users can update their own avatar" on storage.objects;
drop policy if exists "Users can delete their own avatar" on storage.objects;
create policy "Approved members can upload own avatar"
on storage.objects for insert to authenticated
with check (
  public.is_approved_member()
  and bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
create policy "Approved members can update own avatar"
on storage.objects for update to authenticated
using (
  public.is_approved_member()
  and bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  public.is_approved_member()
  and bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
create policy "Approved members can delete own avatar"
on storage.objects for delete to authenticated
using (
  public.is_approved_member()
  and bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Users can upload media" on storage.objects;
drop policy if exists "Users can manage their media" on storage.objects;
create policy "Approved members can upload media"
on storage.objects for insert to authenticated
with check (
  public.is_approved_member()
  and bucket_id = 'media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
create policy "Approved members can manage own media"
on storage.objects for update to authenticated
using (
  public.is_approved_member()
  and bucket_id = 'media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  public.is_approved_member()
  and bucket_id = 'media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
create policy "Approved members can delete own media"
on storage.objects for delete to authenticated
using (
  public.is_approved_member()
  and bucket_id = 'media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

commit;
