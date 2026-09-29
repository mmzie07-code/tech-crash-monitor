# Deploying the daily update (GitHub Actions + Pages)

Nothing here has been pushed anywhere yet. To go live:

1. Create a GitHub repo and push this folder as the repo root.
   (Public repo = free Pages hosting; the data and code are then public. Private repo needs a paid plan for Pages.)
2. Repo Settings > Pages > Source: **GitHub Actions**.
3. Repo Settings > Secrets > Actions > add `SEC_USER_AGENT` = `CrashMonitor your-email@example.com` (SEC requires a contact).
4. Actions tab > "Daily update" > Run workflow once to test. After that it runs every weekday at 21:30 UTC.
5. Point `ios/CrashMonitor/Models.swift` `API.url` at `https://<you>.github.io/<repo>/data/latest.json`.

Note: price history caches are not committed. The daily job only needs ~2 years of prices from Yahoo, which it fetches live.
