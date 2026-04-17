# FIRE Progress Tracker

A lightweight web app for tracking Financial Independence / Retire Early (FIRE) progress using UK pension + Stocks & Shares ISA balances.

## Run locally

Because this is a static app, you can open `uk_retirement_planner.html` directly in your browser.

Or run a quick local server:

```bash
python3 -m http.server 8000
```

Then open:

- `http://localhost:8000/uk_retirement_planner.html`

## Features

- Single or partner planning mode
- Birthday-based age calculation (you + partner)
- Quarterly/yearly data point entry
- Progress chart with Chart.js
- Retirement projection assumptions (growth + monthly contributions)
- Estimated drawdown based on safe withdrawal rate
- JSON import/export
- Browser localStorage autosave
