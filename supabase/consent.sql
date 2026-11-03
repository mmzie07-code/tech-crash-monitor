-- The Analytic: written email consent. Paste into Supabase > SQL Editor > New query > Run.
-- Rule: no marketing, alert or reminder email is ever sent unless a row here says granted = true for that person. No text messages are sent at all.
-- (Account emails the person asks for themselves, like the sign-up confirmation and password reset, are sent by Supabase Auth and are not covered by this table.)
create table if not exists public.email_consent (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted boolean not null default false,
  granted_at timestamptz,
  withdrawn_at timestamptz,
  consent_text text,                    -- the exact wording they agreed to, kept as proof
  source text,                          -- which page they agreed on
  updated_at timestamptz not null default now()
);
alter table public.email_consent enable row level security;
drop policy if exists "own consent read" on public.email_consent;
create policy "own consent read" on public.email_consent for select using (auth.uid() = user_id);
drop policy if exists "own consent insert" on public.email_consent;
create policy "own consent insert" on public.email_consent for insert with check (auth.uid() = user_id);
drop policy if exists "own consent update" on public.email_consent;
create policy "own consent update" on public.email_consent for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- The pricing page's "tell me when it opens" counts as consent to one email about that, and only that.
alter table public.plan_interest add column if not exists email_consent_at timestamptz;

-- Nobody starts opted in: any follow created before this fix is switched off.
do $$ begin
  if to_regclass('public.follows') is not null then
    alter table public.follows alter column notify_email set default false;
    update public.follows set notify_email = false;
  end if;
end $$;
