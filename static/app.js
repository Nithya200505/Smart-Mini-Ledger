// Smart Mini-Ledger — Frontend (vanilla JS, no build step, no framework CDN dependency)

const CATEGORY_COLORS = [
  "#C9A227", "#C4483B", "#3F8F6F", "#5B7DB1", "#9C6B98",
  "#B87A3D", "#6A8A5E", "#A65D57", "#4C7A8C", "#8A8578"
];

let categories = [];
let categoryColorMap = {};
let chartInstance = null;
let selectedType = "expense";
let allTransactions = [];

let transactionToDelete = null;
let editingTransaction = null;
function showToast(message){

    const toast=document.getElementById("toast");

    toast.textContent=message;

    toast.classList.add("show");

    setTimeout(()=>{
        toast.classList.remove("show");
    },2000);

}

function formatMoney(n) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n);
}

function timeAgo(iso) {
  // Backend sends timezone-aware ISO strings (with +00:00); older data may be naive.
  const hasOffset = /[+-]\d{2}:\d{2}$|Z$/.test(iso);
  const parsed = hasOffset ? iso : iso + "Z";
  const diff = (Date.now() - new Date(parsed).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return Math.floor(diff / 60) + "m ago";
  if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
  return Math.floor(diff / 86400) + "d ago";
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

async function api(path, options) {
  const res = await fetch(path, options);
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

// ---------------------------------------------------------------------------
// Loaders
// ---------------------------------------------------------------------------

async function loadCategories() {
  const { data } = await api("/api/categories");
  categories = data;
  categoryColorMap = {};
  categories.forEach((c, i) => { categoryColorMap[c] = CATEGORY_COLORS[i % CATEGORY_COLORS.length]; });

  const select = document.getElementById("category-select");
  select.innerHTML = categories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
}

async function loadTransactions() {

  document.getElementById("loading").style.display = "block";
  document.getElementById("ledger-list").style.display = "none";

  const { data } = await api("/api/transactions");

  allTransactions = data;

  updateTransactionView();

  document.getElementById("loading").style.display = "none";
  document.getElementById("ledger-list").style.display = "block";
}

async function loadSummary() {
  const { data } = await api("/api/summary");
  renderSummary(data);
  renderChart(data.by_category);
}

async function loadNotifications() {
  const { data } = await api("/api/notifications");
  renderNotifications(data);
}

async function loadWebhook() {
  const { data } = await api("/api/settings/webhook");
  const input = document.getElementById("webhook-input");
  input.placeholder = data.webhook_url ? "Webhook connected" : "Discord/Slack webhook URL (optional)";
}

async function loadAll() {
  await Promise.all([loadTransactions(), loadSummary(), loadNotifications(), loadWebhook()]);
}

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------

function renderSummary(summary) {
  document.getElementById("summary-income").textContent = "₹" + formatMoney(summary.total_income);
  document.getElementById("summary-expense").textContent = "₹" + formatMoney(summary.total_expense);
  document.getElementById("summary-balance").textContent = "₹" + formatMoney(summary.balance);
  document.getElementById("anomaly-count").textContent = summary.anomaly_count + " flagged";
  document.getElementById("summary-transactions").textContent = summary.transaction_count;
}

function renderChart(byCategory) {
  const labels = Object.keys(byCategory);
  const data = Object.values(byCategory);
  const emptyState = document.getElementById("chart-empty");
  const canvas = document.getElementById("category-chart");

  if (chartInstance) { chartInstance.destroy(); chartInstance = null; }

  if (labels.length === 0) {
    emptyState.style.display = "block";
    canvas.style.display = "none";
    return;
  }
  emptyState.style.display = "none";
  canvas.style.display = "block";

  chartInstance = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: labels.map(l => categoryColorMap[l] || "#C9A227"),
        borderWidth: 2,
        borderColor: "#F7F4EC",
      }],
    },
    options: {
      animation: {
        duration: 1000,
        easing: "easeOutQuart"
      },
      plugins: {
        legend: {
          position: "bottom",
          labels: { font: { family: "IBM Plex Mono", size: 10 }, color: "#0F1B2B", padding: 12 },
        },
      },
      cutout: "65%",
    },
  });
}

function sortTransactions(transactions, sortType) {

  let sorted = [...transactions];

    switch(sortType){

        case "oldest":
            sorted.sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
            break;

        case "high":
            sorted.sort((a,b)=>b.amount-a.amount);
            break;

        case "low":
            sorted.sort((a,b)=>a.amount-b.amount);
            break;

        default:
            sorted.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
    }

    return sorted;
}

function renderTransactions(transactions) {
  const list = document.getElementById("ledger-list");

  if (transactions.length === 0) {
    list.innerHTML = `<div class="empty-state">No entries yet. Add your first transaction above.</div>`;
    return;
  }

  list.innerHTML = transactions.map(t => `
<div class="ledger-row" data-id="${t.id}">

    <div class="cat-dot" style="background:${categoryColorMap[t.category] || "#C9A227"}"></div>

    <div class="info">
    <div class="desc">${t.description}</div>
    <div class="meta">
        ${t.category} · ${new Date(t.created_at).toLocaleString("en-IN")}
    </div>
</div>

${t.is_anomaly ? `
    <div class="flag-stamp">FLAGGED</div>
` : ""}

<div class="amt ${t.type}">
    ₹${Number(t.amount).toLocaleString("en-IN")}
</div>

<div class="action-buttons">
    <button class="edit-btn">✏️</button>
    <button class="del-btn">🗑️</button>
</div>

</div>
`).join("");

  list.querySelectorAll(".del-btn").forEach(btn => {

    btn.onclick = (e) => {

        const row = e.target.closest(".ledger-row");

        transactionToDelete = row.dataset.id;

        document.getElementById("delete-modal")
            .classList.add("show");

    };

});
list.querySelectorAll(".edit-btn").forEach(btn => {

    btn.onclick = (e) => {
        alert("Edit clicked");
        setTimeout(() => {
    document.getElementById("description-input").scrollIntoView({
        behavior: "smooth"
    });
}, 100);
        const row = e.target.closest(".ledger-row");
       console.log("Row:", row);

        const id = row.dataset.id;
        console.log("ID:", id);

        const transaction = allTransactions.find(t => t.id == id);
        console.log(transaction);

        editingTransaction = id;

        document.getElementById("description-input").value = transaction.description;
        console.log(document.getElementById("description-input"));
        document.getElementById("amount-input").value = transaction.amount;
        console.log(document.getElementById("amount-input"));
        document.getElementById("category-select").value = transaction.category;
        console.log(document.getElementById("category-select"));

        setType(transaction.type);

        document.getElementById("submit-btn").textContent = "Update Transaction";
    };

});
}

function renderNotifications(notifications) {
  const list = document.getElementById("notif-list");
  if (notifications.length === 0) {
    list.innerHTML = `<div class="empty-state">Nothing yet.</div>`;
    return;
  }
  list.innerHTML = notifications.map(n => `
    <div class="notif-row ${n.level}">
      <div style="flex:1">${escapeHtml(n.message)}</div>
      <div class="notif-time">${timeAgo(n.created_at)}</div>
    </div>
  `).join("");
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

function setType(type) {
  selectedType = type;
  document.getElementById("btn-expense").classList.toggle("active", type === "expense");
  document.getElementById("btn-expense").classList.toggle("expense", type === "expense");
  document.getElementById("btn-income").classList.toggle("active", type === "income");
  document.getElementById("btn-income").classList.toggle("income", type === "income");
}

async function handleSubmit(e) {
  e.preventDefault();
  const errorBox = document.getElementById("form-error");
  const amountError = document.getElementById("amount-error");
  const submitBtn = document.getElementById("submit-btn");
  errorBox.textContent = "";
  amountError.textContent = "";
  const description = document.getElementById("description-input").value.trim();
  const amountRaw = document.getElementById("amount-input").value.trim();
  const category = document.getElementById("category-select").value;
  const amount = parseFloat(amountRaw);

  if (!description) { errorBox.textContent = "Enter a description."; return; }
console.log("Amount Raw:", amountRaw);
if (amountRaw === "") {
    amountError.textContent = "Amount is required.";
    return;
}

if (isNaN(amount) || amount <= 0) {
    amountError.textContent = "Amount must be greater than 0.";
    return;
}

  submitBtn.disabled = true;

if (editingTransaction) {
    submitBtn.textContent = "Updating...";
} else {
    submitBtn.textContent = "Adding...";
}

  try {
      let url = "/api/transactions";
let method = "POST";

if (editingTransaction) {
    url = "/api/transactions/" + editingTransaction;
    method = "PUT";
}

const { ok, data } = await api(url, {
    method: method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description, amount, type: selectedType, category }),
    });
    if (!ok) {
    errorBox.textContent =
        data.error ||
        (data.errors || ["Something went wrong."]).join(", ");
    return;
}
    document.getElementById("description-input").value = "";
    document.getElementById("amount-input").value = "";
    document.getElementById("category-select").selectedIndex = 0;

    const wasEditing = editingTransaction;

await loadAll();

editingTransaction = null;
submitBtn.textContent = "Add to ledger";

if (wasEditing) {
    showToast("✏️ Transaction updated!");
} else {
    showToast("✅ Transaction added successfully!");
}
  } catch (err) {
    errorBox.textContent = "Could not reach the server. Is app.py running?";
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Add to ledger";
  }
}

async function saveWebhook() {
  const input = document.getElementById("webhook-input");
  const url = input.value.trim();
  await api("/api/settings/webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  input.value = "";
  input.placeholder = url ? "Webhook connected" : "Discord/Slack webhook URL (optional)";
}

function exportCSV() {

    if (allTransactions.length === 0) {

        showToast("⚠️ No transactions to export!");

        return;
    }

    const headers = [
        "Description",
        "Amount",
        "Type",
        "Category",
        "Date"
    ];

    const rows = allTransactions.map(t => [
        t.description,
        "₹" + Number(t.amount).toFixed(2),
        t.type,
        t.category,
        new Date(t.created_at).toLocaleDateString("en-IN")
    ]);

    const csv = [
        headers.join(","),
        ...rows.map(row => row.join(","))
    ].join("\n");

    const blob = new Blob(
    ["\uFEFF" + csv],
    {
        type: "text/csv;charset=utf-8;"
    }
);

    const url = window.URL.createObjectURL(blob);

    const a = document.createElement("a");

    a.href = url;

    a.download = "transactions.csv";

    a.click();

    window.URL.revokeObjectURL(url);

    showToast("📥 CSV exported successfully!");

}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

function updateTransactionView(){

    const keyword = document.getElementById("search-input").value.toLowerCase();

    const sortType = document.getElementById("sort-select").value;

    const filtered = allTransactions.filter(t =>
        t.description.toLowerCase().includes(keyword) ||
        t.category.toLowerCase().includes(keyword) ||
        t.type.toLowerCase().includes(keyword)
    );

    renderTransactions(sortTransactions(filtered, sortType));
}

document.addEventListener("DOMContentLoaded", async () => {

    const today = new Date().toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    });
    document.getElementById("today-date").textContent = today;

    document.getElementById("btn-expense").addEventListener("click", () => setType("expense"));
    document.getElementById("btn-income").addEventListener("click", () => setType("income"));
    document.getElementById("entry-form").addEventListener("submit", handleSubmit);
    document.getElementById("amount-input").addEventListener("input", () => {
    document.getElementById("amount-error").textContent = "";
});

document.getElementById("description-input").addEventListener("input", () => {
    document.getElementById("form-error").textContent = "";
});
    document.getElementById("webhook-save").addEventListener("click", saveWebhook);
    document.getElementById("export-btn").addEventListener("click", exportCSV);

    setType("expense");

    await loadCategories();
    await loadAll();

    document.getElementById("search-input")
        .addEventListener("input", updateTransactionView);

    document.getElementById("sort-select")
        .addEventListener("change", updateTransactionView);

      const themeBtn = document.getElementById("theme-toggle");

if(localStorage.getItem("theme") === "dark"){
    document.body.classList.add("dark");
    themeBtn.innerHTML = "☀️";
}else{
    themeBtn.innerHTML = "🌙";
}

themeBtn.addEventListener("click",()=>{

    document.body.classList.toggle("dark");

    if(document.body.classList.contains("dark")){

        localStorage.setItem("theme","dark");
        themeBtn.innerHTML="☀️";

    }else{

        localStorage.setItem("theme","light");
        themeBtn.innerHTML="🌙";

    }

});

    // Cancel delete
document.getElementById("cancel-delete").addEventListener("click", () => {

    document.getElementById("delete-modal").classList.remove("show");

    transactionToDelete = null;

});

// Confirm delete
document.getElementById("confirm-delete").addEventListener("click", async () => {

    if (!transactionToDelete) return;

    await api("/api/transactions/" + transactionToDelete, {
        method: "DELETE"
    });

    document.getElementById("delete-modal").classList.remove("show");

    showToast("🗑️ Transaction deleted!");

    transactionToDelete = null;

    await loadAll();

});

});
