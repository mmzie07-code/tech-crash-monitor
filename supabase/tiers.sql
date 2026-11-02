-- The Analytic: Free / Student / Plus plans. Paste into Supabase > SQL Editor > New query > Run (after subscriptions.sql).

-- Paid plans: student and plus unlock the same features (student is a discount for ages 16 to 22); pro is kept for a later tier.
alter table public.subscriptions drop constraint if exists subscriptions_plan_check;
alter table public.subscriptions add constraint subscriptions_plan_check check (plan in ('free', 'student', 'plus', 'pro'));
alter table public.subscriptions add column if not exists billing_interval text check (billing_interval in ('month', 'year'));
alter table public.subscriptions add column if not exists stripe_subscription_id text;

-- Who would pick which plan, recorded from the pricing page before billing exists. One row per person per plan.
create table if not exists public.plan_interest (
  user_id uuid not null references auth.users(id) on delete cascade,
  plan text not null check (plan in ('student', 'plus', 'pro')),
  interval text check (interval in ('month', 'year')),
  created_at timestamptz not null default now(),
  primary key (user_id, plan)
);
alter table public.plan_interest enable row level security;
drop policy if exists "own interest insert" on public.plan_interest;
create policy "own interest insert" on public.plan_interest for insert with check (auth.uid() = user_id);
drop policy if exists "own interest update" on public.plan_interest;
create policy "own interest update" on public.plan_interest for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own interest read" on public.plan_interest;
create policy "own interest read" on public.plan_interest for select using (auth.uid() = user_id);

-- To see the demand (SQL editor, runs as you, so it sees every row):
--   select plan, interval, count(*) from public.plan_interest group by 1, 2 order by 3 desc;
