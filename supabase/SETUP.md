# Connecting The Analytic to Supabase (accounts + live data)

You do steps 1-3 (they need your login). I do the rest once I have the two public values.

## 1. Create the project (2 minutes)
1. Go to https://supabase.com, sign up, click **New project**.
2. Name it `the-analytic`, choose a strong database password (save it in your password manager, you will not need it day to day), pick the region closest to you, **Free** plan.
3. Wait for it to finish starting.

## 2. Send me two values (both are safe to share)
In the project: **Project Settings > API**. Copy:
- **Project URL** (looks like `https://abcd1234.supabase.co`)
- **anon public** key (a long string starting `eyJ...`)

NEVER send or share the **service_role** key. It stays in Supabase/GitHub only.

## 3. Auth settings (Authentication > ...)
- **Providers > Email**: enabled, "Confirm email" ON, minimum password length 10.
- **URL Configuration**: Site URL = `https://mmzie07-code.github.io/tech-crash-monitor/`; add the same URL under Redirect URLs.

## 4. I prepare, you run (needs a terminal)
```
brew install supabase/tap/supabase
supabase login                      # opens your browser
supabase link --project-ref <ref>   # the "abcd1234" part of your URL
# schema: open Supabase > SQL Editor, paste supabase/schema.sql, click Run
supabase secrets set OWNER_KEY=<a long random string you make up> ALLOWED_ORIGIN=https://mmzie07-code.github.io
supabase functions deploy market
```
Make your owner key with: `openssl rand -hex 24`. Keep it private. You enter it once on each of your devices at **Sign in > Owner access**.
