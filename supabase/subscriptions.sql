-- The Analytic: paid plans. Paste into Supabase > SQL Editor > New query > Run.

-- One row per paying user. Only the edge function (service role) writes it; users can read their own row.
create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'pro')),
  status text not null default 'inactive',
  current_period_end timestamptz,
  stripe_customer_id text,
  updated_at timestamptz not null default now()
);
alter table public.subscriptions enable row level security;
drop policy if exists "own subscription read" on public.subscriptions;
create policy "own subscription read" on public.subscriptions for select using (auth.uid() = user_id);

-- The paid parts of each company's analysis. RLS on and NO policies: nobody can read it from the browser, only the edge function (service role).
create table if not exists public.pro_data (
  sym text primary key,
  doc jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.pro_data enable row level security;
