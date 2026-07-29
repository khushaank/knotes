-- Private media metadata and tightly allow-listed document uploads.

update storage.buckets
set public = false,
    file_size_limit = 10485760,
    allowed_mime_types = array[
      'image/jpeg', 'image/png', 'image/webp', 'image/gif',
      'application/pdf', 'text/plain', 'text/csv',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    ]
where id = 'media';

create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  path text not null unique check (char_length(path) between 3 and 260),
  display_name text not null check (char_length(display_name) between 1 and 160),
  alt_text text not null default '' check (char_length(alt_text) <= 500),
  mime_type text not null check (char_length(mime_type) between 3 and 150),
  size_bytes bigint not null check (size_bytes between 0 and 10485760),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint media_assets_owner_path check (path like owner_id::text || '/%')
);

create index if not exists media_assets_owner_created_idx
on public.media_assets (owner_id, created_at desc);

alter table public.media_assets enable row level security;
revoke all on public.media_assets from public, anon;
grant select, insert, update, delete on public.media_assets to authenticated;

drop policy if exists "Owners manage media metadata" on public.media_assets;
create policy "Owners manage media metadata"
on public.media_assets
for all
to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);
