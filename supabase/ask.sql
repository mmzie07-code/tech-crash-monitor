-- The Analytic: daily usage counter for the ask-the-site assistant (keeps the API bill bounded). Paste into Supabase > SQL Editor > New query > Run.
create table if not exists public.ask_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  n int not null default 0,
  primary key (user_id, day)
);
alter table public.ask_usage enable row level security;   -- no policies: only the edge function (service role) reads or writes it
