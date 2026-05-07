-- Saved filters (smart albums) per CLAUDE.md.
-- A user can save a filter combo by name, mark it pinned to surface on home,
-- and tap the saved row to apply the filter set.

create table if not exists public.saved_filters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  filters jsonb not null default '{}'::jsonb,
  -- Sets are serialized to arrays for storage:
  --   { categories: string[], urgencies: string[], statuses: string[], resonances: number[] }
  pinned boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists saved_filters_user_pinned_idx
  on public.saved_filters (user_id, pinned, created_at desc);

alter table public.saved_filters enable row level security;

create policy "saved_filters: owner can select"
  on public.saved_filters for select
  using (auth.uid() = user_id);

create policy "saved_filters: owner can insert"
  on public.saved_filters for insert
  with check (auth.uid() = user_id);

create policy "saved_filters: owner can update"
  on public.saved_filters for update
  using (auth.uid() = user_id);

create policy "saved_filters: owner can delete"
  on public.saved_filters for delete
  using (auth.uid() = user_id);
