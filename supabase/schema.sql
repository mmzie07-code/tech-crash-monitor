-- The Analytic: database schema. Paste into Supabase > SQL Editor > New query > Run.

-- One row per signed-up user. Created automatically at sign-up.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  age_confirmed_16_plus boolean not null default false,
  terms_accepted_at timestamptz,
  created_at timestamptz not null default now()
);

-- Saved practice portfolio (one JSON document per user) and lesson progress.
create table if not exists public.paper_portfolios (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create table if not exists public.lesson_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Row Level Security: users can only ever see and change their OWN rows.
alter table public.profiles enable row level security;
alter table public.paper_portfolios enable row level security;
alter table public.lesson_progress enable row level security;

drop policy if exists "own profile read" on public.profiles;
create policy "own profile read" on public.profiles for select using (auth.uid() = id);
drop policy if exists "own profile update" on public.profiles;
create policy "own profile update" on public.profiles for update using (auth.uid() = id);

drop policy if exists "own portfolio all" on public.paper_portfolios;
create policy "own portfolio all" on public.paper_portfolios for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own progress all" on public.lesson_progress;
create policy "own progress all" on public.lesson_progress for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Create a profile row when someone signs up. The sign-up form sends the 16+ confirmation in user metadata.
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, age_confirmed_16_plus, terms_accepted_at)
  values (new.id, new.email, coalesce((new.raw_user_meta_data->>'age_16_plus')::boolean, false),
          case when (new.raw_user_meta_data->>'age_16_plus')::boolean then now() end);
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
