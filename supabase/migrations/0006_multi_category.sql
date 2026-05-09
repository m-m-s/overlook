-- 0006_multi_category.sql
-- Allow multiple categories per screenshot (was: single text column).
-- Backfills existing single-category rows into the array.

alter table screenshots
  add column if not exists categories text[] not null default '{}';

update screenshots
set categories = array[category]
where category is not null
  and categories = '{}';

-- Index so category filters stay fast on large libraries.
create index if not exists screenshots_categories_gin_idx
  on screenshots using gin (categories);
