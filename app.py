"""
Smart Mini-Ledger — Backend
A lightweight full-stack financial ledger with built-in anomaly detection
and pluggable notifications.

Run with: python app.py
Then open http://localhost:5000
"""

from flask import Flask, jsonify, request, send_from_directory
import sqlite3
import os
import statistics
from datetime import datetime, timezone
import requests

app = Flask(__name__, static_folder="static", static_url_path="")
DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ledger.db")

DEFAULT_CATEGORIES = [
    "Food", "Transport", "Bills", "Entertainment",
    "Shopping", "Health", "Salary", "Freelance", "Other"
]


# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            description TEXT NOT NULL,
            amount REAL NOT NULL,
            type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
            category TEXT NOT NULL,
            date TEXT NOT NULL,
            is_anomaly INTEGER DEFAULT 0,
            created_at TEXT NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            message TEXT NOT NULL,
            level TEXT NOT NULL DEFAULT 'info',
            created_at TEXT NOT NULL,
            read INTEGER DEFAULT 0
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        )
    """)
    conn.commit()
    conn.close()


def add_notification(conn, message, level="info"):
    conn.execute(
        "INSERT INTO notifications (message, level, created_at) VALUES (?, ?, ?)",
        (message, level, datetime.now(timezone.utc).isoformat()),
    )
    # fire-and-forget webhook delivery (does not block/crash the request if it fails)
    try:
        row = conn.execute("SELECT value FROM settings WHERE key = 'webhook_url'").fetchone()
        if row and row["value"]:
            requests.post(row["value"], json={"content": message, "text": message}, timeout=3)
    except Exception:
        # Webhook delivery is best-effort. A misconfigured/unreachable webhook
        # should never break the core ledger functionality.
        pass


# ---------------------------------------------------------------------------
# Anomaly detection — the "unique twist"
# ---------------------------------------------------------------------------

def detect_anomaly(conn, category, amount, txn_type):
    """
    Flags a transaction as anomalous if it deviates sharply from the user's
    own historical spending pattern in that category.

    Approach:
      - Needs at least 3 prior transactions in the same category to compute
        a meaningful mean/stddev (avoids false positives on sparse data —
        a naive z-score on 1-2 data points is meaningless and this is exactly
        the kind of thing an AI-generated first pass tends to miss).
      - Primary signal: z-score > 2.5 against category history.
      - Cold-start fallback: if there's not enough category history yet,
        compare against 3x the median of ALL expenses so wildly out-of-place
        transactions still get caught from day one.
    """
    if txn_type != "expense":
        return False, None

    history = conn.execute(
        "SELECT amount FROM transactions WHERE category = ? AND type = 'expense'",
        (category,),
    ).fetchall()
    amounts = [h["amount"] for h in history]

    if len(amounts) >= 3:
        mean = statistics.mean(amounts)
        stdev = statistics.pstdev(amounts) or 1.0  # avoid divide-by-zero
        z = (amount - mean) / stdev
        if z > 2.5:
            return True, f"₹{amount:,.2f} in '{category}' is unusually high — about {z:.1f}x your normal deviation for this category (avg ₹{mean:,.2f})."
        return False, None

    # Cold-start fallback using overall expense median
    all_expenses = conn.execute(
        "SELECT amount FROM transactions WHERE type = 'expense'"
    ).fetchall()
    all_amounts = [e["amount"] for e in all_expenses]
    if len(all_amounts) >= 3:
        median = statistics.median(all_amounts)
        if amount > median * 3:
            return True, f"₹{amount:,.2f} in '{category}' is more than 3x your typical expense (₹{median:,.2f} median) — flagged early since we don't have enough '{category}' history yet."

    return False, None


# ---------------------------------------------------------------------------
# Routes — pages
# ---------------------------------------------------------------------------

@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


# ---------------------------------------------------------------------------
# Routes — API
# ---------------------------------------------------------------------------

@app.route("/api/transactions", methods=["GET"])
def list_transactions():
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM transactions ORDER BY created_at DESC"
    ).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route("/api/transactions", methods=["POST"])
def add_transaction():
    data = request.get_json(silent=True) or {}

    description = (data.get("description") or "").strip()
    amount = data.get("amount")
    txn_type = data.get("type")
    category = (data.get("category") or "Other").strip()
    date = data.get("date") or datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # --- validation (a real app must not trust client input) ---
    errors = []
    if not description:
        errors.append("description is required")
    if txn_type not in ("income", "expense"):
        errors.append("type must be 'income' or 'expense'")
    try:
        amount = float(amount)
        if amount <= 0:
            errors.append("amount must be greater than 0")
    except (TypeError, ValueError):
        errors.append("amount must be a valid number")

    if errors:
        return jsonify({"errors": errors}), 400

    conn = get_db()
    try:
        is_anomaly, anomaly_msg = detect_anomaly(conn, category, amount, txn_type)

        cur = conn.execute(
            """INSERT INTO transactions
               (description, amount, type, category, date, is_anomaly, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (description, amount, txn_type, category, date, int(is_anomaly),
             datetime.now(timezone.utc).isoformat()),
        )

        if is_anomaly:
            add_notification(conn, f"⚠️ Anomaly detected: {anomaly_msg}", level="warning")
        else:
            add_notification(
                conn,
                f"{'💰' if txn_type == 'income' else '💸'} {description} — ₹{amount:,.2f} logged under {category}.",
                level="info",
            )

        conn.commit()
        new_id = cur.lastrowid
        row = conn.execute("SELECT * FROM transactions WHERE id = ?", (new_id,)).fetchone()
        return jsonify(dict(row)), 201
    except Exception as e:
        conn.rollback()
        return jsonify({"errors": [str(e)]}), 500
    finally:
        conn.close()


@app.route("/api/transactions/<int:txn_id>", methods=["PUT"])
def update_transaction(txn_id):

    data = request.get_json()

    description = data.get("description", "").strip()
    amount = float(data.get("amount"))
    category = data.get("category")
    txn_type = data.get("type")

    conn = get_db()

    row = conn.execute(
        "SELECT * FROM transactions WHERE id=?",
        (txn_id,)
    ).fetchone()

    if not row:
        conn.close()
        return jsonify({"error": "Transaction not found"}), 404
    is_anomaly, _ = detect_anomaly(conn, category, amount, txn_type)
    conn.execute("""
        UPDATE transactions
        SET description=?,
            amount=?,
            category=?,
            type=?,
            is_anomaly=?
        WHERE id=?
    """, (description, amount, category, txn_type, int(is_anomaly), txn_id))

    conn.commit()

    updated = conn.execute(
        "SELECT * FROM transactions WHERE id=?",
        (txn_id,)
    ).fetchone()

    conn.close()

    return jsonify(dict(updated))


@app.route("/api/transactions/<int:txn_id>", methods=["DELETE"])
def delete_transaction(txn_id):
    conn = get_db()
    row = conn.execute("SELECT * FROM transactions WHERE id = ?", (txn_id,)).fetchone()
    if not row:
        conn.close()
        return jsonify({"errors": ["transaction not found"]}), 404
    conn.execute("DELETE FROM transactions WHERE id = ?", (txn_id,))
    conn.commit()
    conn.close()
    return jsonify({"deleted": txn_id})


@app.route("/api/summary", methods=["GET"])
def summary():
    conn = get_db()
    rows = conn.execute("SELECT * FROM transactions").fetchall()
    conn.close()

    total_income = sum(r["amount"] for r in rows if r["type"] == "income")
    total_expense = sum(r["amount"] for r in rows if r["type"] == "expense")

    by_category = {}
    for r in rows:
        if r["type"] == "expense":
            by_category[r["category"]] = by_category.get(r["category"], 0) + r["amount"]

    anomaly_count = sum(1 for r in rows if r["is_anomaly"])

    return jsonify({
        "total_income": total_income,
        "total_expense": total_expense,
        "balance": total_income - total_expense,
        "by_category": by_category,
        "anomaly_count": anomaly_count,
        "transaction_count": len(rows),
    })


@app.route("/api/notifications", methods=["GET"])
def list_notifications():
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM notifications ORDER BY id DESC LIMIT 50"
    ).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route("/api/notifications/<int:notif_id>/read", methods=["POST"])
def mark_notification_read(notif_id):
    conn = get_db()
    conn.execute("UPDATE notifications SET read = 1 WHERE id = ?", (notif_id,))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app.route("/api/settings/webhook", methods=["GET", "POST"])
def webhook_setting():
    conn = get_db()
    if request.method == "POST":
        data = request.get_json(silent=True) or {}
        url = (data.get("url") or "").strip()
        conn.execute(
            "INSERT INTO settings (key, value) VALUES ('webhook_url', ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (url,),
        )
        conn.commit()
        conn.close()
        return jsonify({"webhook_url": url})

    row = conn.execute("SELECT value FROM settings WHERE key = 'webhook_url'").fetchone()
    conn.close()
    return jsonify({"webhook_url": row["value"] if row else ""})


@app.route("/api/categories", methods=["GET"])
def categories():
    return jsonify(DEFAULT_CATEGORIES)


if __name__ == "__main__":
    init_db()
    app.run(debug=True, port=5000)
