-- Sprint v1 schema for Overlook.
-- Subset of CLAUDE.md data model: omits difficulty, time_to_complete, source_url, action_url.
-- Run via Supabase SQL editor or `supabase db push` if using Supabase CLI.

-- Screenshots table -----------------------------------------------------------

create table if not exists public.screenshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null, -- key inside `screenshots` bucket
  file_hash text,
  created_at timestamptz not null default now(),
  file_created_at timestamptz,
  analyzed boolean not null default false,
  ai_reviewed boolean not null default false,
  local_only boolean not null default false,

  -- AI generated (sprint subset)
  ai_typed_tags jsonb not null default '[]'::jsonb, -- [{type, value}, ...]
  ai_suggested_subjects text[] not null default '{}',
  ai_suggested_category text,

  -- User set
  category text,
  subject text,
  urgency text,
  urgency_date date,
  resonance smallint check (resonance in (1, 2, 3)),
  status text,
  manual_typed_tags jsonb not null default '[]'::jsonb, -- [{type?, value}, ...]
  notes text
);

create index if not exists screenshots_user_created_idx
  on public.screenshots (user_id, created_at desc);
create index if not exists screenshots_user_category_idx
  on public.screenshots (user_id, category);
create index if not exists screenshots_user_resonance_idx
  on public.screenshots (user_id, resonance);

-- Row Level Security ----------------------------------------------------------

alter table public.screenshots enable row level security;

create policy "screenshots: owner can select"
  on public.screenshots for select
  using (auth.uid() = user_id);

create policy "screenshots: owner can insert"
  on public.screenshots for insert
  with check (auth.uid() = user_id);

create policy "screenshots: owner can update"
  on public.screenshots for update
  using (auth.uid() = user_id);

create policy "screenshots: owner can delete"
  on public.screenshots for delete
  using (auth.uid() = user_id);

-- Storage bucket --------------------------------------------------------------
-- Files are stored under `<user_id>/<screenshot_id>.<ext>` inside `screenshots` bucket.

insert into storage.buckets (id, name, public)
values ('screenshots', 'screenshots', false)
on conflict (id) do nothing;

create policy "screenshots bucket: owner can read"
  on storage.objects for select
  using (
    bucket_id = 'screenshots'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "screenshots bucket: owner can insert"
  on storage.objects for insert
  with check (
    bucket_id = 'screenshots'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "screenshots bucket: owner can delete"
  on storage.objects for delete
  using (
    bucket_id = 'screenshots'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
