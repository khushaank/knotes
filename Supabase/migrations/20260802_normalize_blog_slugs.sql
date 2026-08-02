-- Convert every existing post to one readable, stable URL shape.
-- The id suffix keeps equal titles unique without random-looking text.
alter table public.blogs disable trigger secure_blog_update;

-- Move every current value out of the unique index before assigning canonical values.
update public.blogs
set slug = 'tmp-' || id || '-' || substr(md5(random()::text), 1, 12);

update public.blogs
set slug = coalesce(
  nullif(left(trim(both '-' from lower(regexp_replace(title, '[^a-zA-Z0-9]+', '-', 'g'))), 64), ''),
  'post'
) || '-' || id;

alter table public.blogs enable trigger secure_blog_update;
