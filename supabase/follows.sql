-- The Analytic: follows (hearted stocks and events). Paste into Supabase > SQL Editor > New query > Run.
create table if not exists public.follows (
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('stock', 'event')),
  ref text not null,                      -- stock symbol, or event id
  label text,                             -- display name when followed
  event_date date,                        -- events only (used later for reminder emails)
  event_time text,
  notify_email boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (user_id, kind, ref)
);
alter table public.follows enable row level security;
drop policy if exists "own follows" on public.follows;
create policy "own follows" on public.follows for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
