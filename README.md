# Smart Mini-Ledger

A lightweight full-stack financial ledger with built-in **anomaly detection** and
**configurable notifications** — built for the Bytex Fresher Challenge.

## What it does

- Add, view, and categorize income/expense transactions
- Live summary (total income, total expense, balance)
- Category breakdown chart
- **Smart anomaly detection**: every new expense is checked against your own
  historical spending in that category (mean + standard deviation). Unusually
  large transactions are automatically flagged and surfaced as a notification —
  no manual budget rules required.
- **Notifications**: every transaction (and every anomaly) generates an
  in-app notification. You can optionally connect a Discord/Slack incoming
  webhook URL in the sidebar to also receive alerts outside the app.

## Tech stack

- **Backend:** Python, Flask, SQLite (`app.py`)
- **Frontend:** React (via CDN, no build step) + Chart.js, served directly by Flask
- Chosen deliberately to keep the project to a single `python app.py` command —
  no Node build pipeline required to run it, which minimizes setup friction
  for whoever's reviewing it.

## How to run

```bash
pip install -r requirements.txt
python app.py
```

Then open **http://localhost:5000**

## The "unique twist": anomaly detection

Rather than just logging transactions, the ledger builds a per-category
profile of your spending as you go:

- With 3+ prior transactions in a category, it computes a z-score against
  that category's mean and standard deviation. Anything beyond 2.5 standard
  deviations gets flagged.
- With fewer than 3 prior transactions in that category (cold start), it
  falls back to comparing against 3x the median of *all* your expenses, so
  an obviously out-of-place transaction still gets caught on day one instead
  of silently passing because there wasn't "enough data yet."

Flagged transactions get a visual "Flagged" stamp in the ledger and generate
a warning-level notification, optionally relayed to a webhook.

## AI usage disclosure

*(Fill this in honestly based on your own process — this is what Bytex is
actually evaluating. A few prompts to get you started:)*

- **Which AI tools did you use, and for what?**
  e.g. "I used Claude to scaffold the Flask backend, the React frontend, and
  the initial anomaly-detection logic, then iterated on it myself."
- **Where did the AI's first pass fall short, and what did you change?**
  Some real candidates from this build you can speak to if true for you:
  - A naive anomaly check would z-score against category history with *any*
    amount of data, which is statistically meaningless with 1–2 data points
    and would misfire constantly for new categories. Did you catch that, or
    did you ask for the cold-start fallback? Explain your reasoning.
  - The webhook delivery is wrapped in a try/except so a bad/unreachable
    webhook URL can't crash the core app — did you notice the first draft
    didn't isolate that failure mode, or did you have to add it?
  - Check the validation in `add_transaction()` — does it cover every edge
    case you'd expect (empty strings, negative/zero amounts, wrong type)?
    What would you add?
- **What would you change with more time?**
  e.g. user accounts/auth, recurring transactions, exporting to CSV, a
  proper production WSGI server instead of Flask's dev server, tests.

## Project structure

```
mini-ledger/
├── app.py              # Flask backend (routes, DB, anomaly detection)
├── requirements.txt
├── static/
│   └── index.html       # React frontend (single file, CDN-based)
├── .gitignore
└── README.md
```
