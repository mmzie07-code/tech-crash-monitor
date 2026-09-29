# Backtest results (QQQ, 1999-2026)

Event: QQQ falls >= 15% from a day's close within the next 60 trading days (13% of all days; 8.7% since 2015).
Rules were examined on TRAIN (<=2014) and confirmed on TEST (2015+). Reproduce: `python3 engine/explore.py`, `python3 engine/backtest.py`.
Credit-spread (#6) is untested: FRED history was unreachable.

| Original guess | Result | Action |
|---|---|---|
| #7 "VIX < 15 = complacency" | Lift 0.19x. Low VIX preceded FEWER crashes. | Replaced with "VIX > 1.25x its 50d avg" (lift ~1.5x, both eras) |
| #1 price >15% above 200DMA | Lift 0.5x. Extended markets kept rising over 60 days. | Kept as context, weight 0 |
| #5 10Y +0.4 in 3mo | ~1.0x (no edge) | Context, weight 0 |
| #8 trend breakdown | 1.4-1.7x, but mostly a drawdown already underway; no edge at fresh highs | Weight 1 (confirmation, not early warning) |
| #2 concentration | 1.9x in test, no train data (QQQE starts 2012) | Weight 1, low confidence |
| #10 semis lag QQQ by 5pts/10d | 2.1x overall; 10x train / 2.8x test when market was near highs | Weight 2 (best signal, but only a handful of episodes) |

Combined weighted score >= 25: crash probability about 1.7-1.9x the base rate in both eras.
That is a modest tilt, not a prediction: even at high scores most warnings are not followed by a 15% drop.

## Caveats
- The VIX replacement was chosen after seeing the data, so its edge is partly optimistic.
- Overlapping 60-day windows and ~10 independent crash episodes means small effective sample sizes.
- Valuation-type checks (#1, #3) are long-horizon; a 60-day test cannot confirm or refute them.
