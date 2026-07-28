-- Knotes production hardening migration
-- Apply with the Supabase CLI after reviewing against a staging project.
-- Fails closed when legacy feedback rows require manual cleanup.

begin;

-- Avatars remain private; clients use short-lived signed URLs. Media attached
-- to public posts remains public, but both buckets enforce type and size limits.
update storage.buckets
set public = false,
    file_size_limit = 2097152,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
where id = 'avatars';

-- Bucket privacy does not override storage.objects RLS. Remove the reachable
-- legacy public-read policy and reinstall explicit owner-only policies.
drop policy if exists "Avatar images are publicly accessible" on storage.objects;
drop policy if exists "Users can view their own avatar" on storage.objects;
create policy "Users can view their own avatar"
on storage.objects for select to authenticated
using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can upload their own avatar" on storage.objects;
create policy "Users can upload their own avatar"
on storage.objects for insert to authenticated
with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can update their own avatar" on storage.objects;
create policy "Users can update their own avatar"
on storage.objects for update to authenticated
using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can delete their own avatar" on storage.objects;
create policy "Users can delete their own avatar"
on storage.objects for delete to authenticated
using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
);

update storage.buckets
set public = true,
    file_size_limit = 10485760,
    allowed_mime_types = array[
        'image/jpeg', 'image/png', 'image/webp', 'image/gif',
        'application/pdf', 'text/plain', 'text/csv'
    ]
where id = 'media';

create table if not exists public.feedback (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id) on delete set null default auth.uid(),
    name text not null,
    type text not null,
    message text not null,
    page_url text,
    created_at timestamptz not null default now()
);

-- Support upgrades from older, partially defined feedback tables.
alter table public.feedback add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.feedback add column if not exists name text;
alter table public.feedback add column if not exists type text;
alter table public.feedback add column if not exists message text;
alter table public.feedback add column if not exists page_url text;
alter table public.feedback add column if not exists created_at timestamptz;
alter table public.feedback alter column user_id set default auth.uid();
alter table public.feedback alter column created_at set default now();

-- Do not silently rewrite historical records. Stop before changing grants or
-- policies when required fields need an operator-reviewed cleanup.
do $$
begin
    if exists (
        select 1 from public.feedback
        where name is null or type is null or message is null or created_at is null
    ) then
        raise exception 'feedback contains NULL required fields; clean legacy rows before applying hardening';
    end if;
end $$;

alter table public.feedback alter column name set not null;
alter table public.feedback alter column type set not null;
alter table public.feedback alter column message set not null;
alter table public.feedback alter column created_at set not null;
alter table public.feedback enable row level security;

-- Allow clients to provide only content and their authenticated user ID. The
-- trigger owns id/created_at, preventing timestamp-based rate-limit bypasses.
revoke all on table public.feedback from anon;
revoke all on table public.feedback from authenticated;
grant insert (user_id, name, type, message, page_url) on table public.feedback to authenticated;

do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'feedback_name_length'
          and conrelid = 'public.feedback'::regclass
    ) then
        alter table public.feedback add constraint feedback_name_length
            check (char_length(name) between 1 and 120) not valid;
    end if;
    if not exists (
        select 1 from pg_constraint
        where conname = 'feedback_message_length'
          and conrelid = 'public.feedback'::regclass
    ) then
        alter table public.feedback add constraint feedback_message_length
            check (char_length(message) between 10 and 2000) not valid;
    end if;
    if not exists (
        select 1 from pg_constraint
        where conname = 'feedback_type_allowlist'
          and conrelid = 'public.feedback'::regclass
    ) then
        alter table public.feedback add constraint feedback_type_allowlist
            check (type in ('feedback', 'bug', 'feature', 'question', 'other')) not valid;
    end if;
    if not exists (
        select 1 from pg_constraint
        where conname = 'feedback_page_url_length'
          and conrelid = 'public.feedback'::regclass
    ) then
        alter table public.feedback add constraint feedback_page_url_length
            check (page_url is null or char_length(page_url) <= 500) not valid;
    end if;
end $$;

drop policy if exists "Anyone can submit feedback" on public.feedback;
drop policy if exists "Anonymous users can submit feedback" on public.feedback;
drop policy if exists "Authenticated users can submit feedback" on public.feedback;
create policy "Authenticated users can submit feedback"
on public.feedback for insert
to authenticated
with check (user_id = auth.uid());

-- Serialize submissions per account and force a trusted timestamp. The
-- transaction-scoped advisory lock prevents concurrent requests from all
-- observing the same pre-insert count.
create or replace function public.enforce_feedback_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    request_user uuid := auth.uid();
begin
    if request_user is null or new.user_id is distinct from request_user then
        raise exception 'Authentication required';
    end if;

    perform pg_advisory_xact_lock(hashtextextended(request_user::text, 0));
    new.user_id := request_user;
    new.created_at := clock_timestamp();

    if (
        select count(*) from public.feedback
        where user_id = request_user
          and created_at > new.created_at - interval '10 minutes'
    ) >= 5 then
        raise exception 'Feedback rate limit exceeded';
    end if;

    return new;
end;
$$;

revoke all on function public.enforce_feedback_rate_limit() from public, anon, authenticated;

drop trigger if exists feedback_rate_limit on public.feedback;
create trigger feedback_rate_limit
before insert on public.feedback
for each row execute function public.enforce_feedback_rate_limit();

commit;

-- Existing rows can be validated after operator review:
-- alter table public.feedback validate constraint feedback_name_length;
-- alter table public.feedback validate constraint feedback_message_length;
-- alter table public.feedback validate constraint feedback_type_allowlist;
-- alter table public.feedback validate constraint feedback_page_url_length;
