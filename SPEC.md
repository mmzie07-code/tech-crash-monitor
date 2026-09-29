# Market Lab (working name): spec and roadmap

## Product (v0.3)
An educational site for ages 16+ that covers the whole market, with AI/tech bubble tracking as one featured section.
- **Learn**: 8-lesson crash course (lesson 1 built), glossary, quizzes, progress saved on-device. Paper trading planned.
- **Markets**: indices, 11 sectors, rates/dollar/oil/gold/bitcoin, global indices (live). Daily brief and Today-to-next-year outlook (planned, scenario-based, never point predictions).
- **AI & Tech Watch**: the 10-check crash-risk monitor described below.
- Guardrails: no stock tips, no ads/tracking, no personal data, disclaimer on every page, honest about forecast limits.

## Crash monitor (AI & Tech Watch)

Goal: a daily 0-100 crash-risk score for AI/tech stocks, from a 10-item checklist, split into
**stretch** (how fragile) and **trigger** (what could pop it). Web + iOS, later multi-user.

## Layout
- `engine/`  Python 3 (stdlib only). `run_daily.py` fetches data, scores checks, writes `data/latest.json` + `data/history.json`.
- `web/`     The site (hash-routed static app: index.html, css/, js/). Content lives in `js/content.js`. Reads `data/latest.json` and `data/markets.json`.
- `ios/`     SwiftUI source (needs full Xcode, not installed here; create an iOS App project and drop these files in).

## Check status (v0.1)
| # | Check | State |
|---|---|---|
| 1 | Valuation | Proxy (price vs 200DMA). TODO: forward P/E percentile |
| 2 | Concentration | Proxy (QQQ/QQQE ratio). TODO: real top-10 weight |
| 3 | AI capex vs revenue | Not connected (SEC filings / earnings) |
| 4 | Earnings deterioration | Not connected (analyst revisions API) |
| 5 | Rates | Live (^TNX) |
| 6 | Credit | Live via FRED, but FRED timed out on the first run, so it needs retry/cache |
| 7 | Sentiment | Proxy (VIX only). TODO: put/call, margin debt |
| 8 | Trend | Live |
| 9 | Insider selling | Not connected (EDGAR Form 4 / 13F) |
| 10 | Narrative/regulatory shock | Proxy (SMH vs QQQ). TODO: news NLP |

Unknown checks are excluded from the score and shown greyed out, so the score never pretends to cover them.

## Roadmap
1. Backtest: replay checks over 2000, 2018, 2022 and 2024-25 drawdowns; tune thresholds; measure false-alarm rate. Thresholds now are unvalidated guesses.
2. Add real data: forward P/E, EDGAR Form 4, earnings revisions, news sentiment (LLM).
3. Schedule the daily run (cron/GitHub Actions) and host `data/` on static storage.
4. Alerts: push/email when score crosses a level.
5. Multi-user: accounts, watchlists, notification prefs (e.g. Supabase). Legal review, disclaimers, no personalized advice.

## Run
    python3 engine/run_daily.py
