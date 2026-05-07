-- Restore data-model fields that were sprint-cut but are trivially additive.
-- Per CLAUDE.md these are first-class fields, not optional extras.
--
-- Run this after 0001_initial.sql via the Supabase SQL editor.

alter table public.screenshots
  add column if not exists difficulty text
    check (difficulty in ('beginner', 'intermediate', 'advanced')),
  add column if not exists time_to_complete text
    check (time_to_complete in ('quick', 'afternoon', 'full_day', 'multi_day', 'long_term')),
  add column if not exists source_url text,
  add column if not exists source_url_manual text,
  add column if not exists action_url text,
  add column if not exists action_url_type text
    check (action_url_type in ('tickets', 'directions', 'buy', 'recipe', 'listen', 'watch', 'read', 'search'));
