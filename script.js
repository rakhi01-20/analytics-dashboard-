const state = {
  columns: [],
  numericCols: [],
  categoricalCols: [],
  activeNumeric: null,
  activeCategory: null,
  page: 1,
  limit: 50,
  totalRows: 0,
  fileName: "",
};

const charts = {};

const $ = (id) => document.getElementById(id);

function showError(msg) {
  const box = $("errorBox");
  box.textContent = msg;
  box.classList.remove("hidden");
  setTimeout(() => box.classList.add("hidden"), 5000);
}

function fmt(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "-";
  const num = Number(n);
  return Math.abs(num) >= 1000
    ? num.toLocaleString(undefined, { maximumFractionDigits: 2 })
    : Number(num.toFixed(3)).toString();
}

async function uploadFile(file) {
  const formData = new FormData();
  formData.append("file", file);

  try {
    const res = await fetch("/api/upload", { method: "POST", body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Upload failed.");

    state.fileName = file.name;
    state.columns = data.columns;
    state.numericCols = data.columns.filter((c) => c.type === "numeric").map((c) => c.name);
    state.categoricalCols = data.columns.filter((c) => c.type === "text").map((c) => c.name);
    state.activeNumeric = state.numericCols[0] || null;
    state.activeCategory = state.categoricalCols[0] || null;
    state.page = 1;

    $("emptyState").classList.add("hidden");
    $("dashboard").classList.remove("hidden");
    $("fileMeta").innerHTML = `<span>${state.fileName}</span> · ${data.rowCount} rows · ${data.columns.length} columns`;

    populateSelectors();
    await refreshAll();
  } catch (err) {
    showError(err.message);
  }
}

function populateSelectors() {
  const numSel = $("numericSelect");
  const catSel = $("categorySelect");
  numSel.innerHTML = state.numericCols.map((c) => `<option value="${c}">${c}</option>`).join("");
  catSel.innerHTML = state.categoricalCols.map((c) => `<option value="${c}">${c}</option>`).join("");
  numSel.value = state.activeNumeric;
  catSel.value = state.activeCategory;
}

async function refreshAll() {
  await Promise.all([loadStats(), loadGroupChart(), loadDistribution(), loadTrend(), loadRecords()]);
}

async function loadStats() {
  if (!state.activeNumeric) return;
  const res = await fetch(`/api/stats?column=${encodeURIComponent(state.activeNumeric)}`);
  const s = await res.json();
  if (!res.ok) return showError(s.error);

  const cards = [
    { label: "Count", value: s.count },
    { label: "Mean", value: fmt(s.mean) },
    { label: "Median", value: fmt(s.median) },
    { label: "Std Dev", value: fmt(s.std) },
    { label: "Range", value: `${fmt(s.min)}–${fmt(s.max)}` },
  ];
  $("statGrid").innerHTML = cards
    .map((c) => `<div class="stat-card"><div class="label">${c.label}</div><div class="value">${c.value}</div></div>`)
    .join("");
}

async function loadGroupChart() {
  if (!state.activeNumeric || !state.activeCategory) return;
  const res = await fetch(
    `/api/group?category=${encodeURIComponent(state.activeCategory)}&numeric=${encodeURIComponent(state.activeNumeric)}`
  );
  const { rows } = await res.json();

  $("numLabel1").textContent = state.activeNumeric;
  $("catLabel1").textContent = state.activeCategory;

  const ctx = $("barChart").getContext("2d");
  if (charts.bar) charts.bar.destroy();
  charts.bar = new Chart(ctx, {
    type: "bar",
    data: {
      labels: rows.map((r) => r.name),
      datasets: [{ label: "average", data: rows.map((r) => r.average), backgroundColor: "#F5A623", borderRadius: 4 }],
    },
    options: chartOptions(),
  });
}

async function loadDistribution() {
  if (!state.activeCategory) return;
  const res = await fetch(`/api/distribution?column=${encodeURIComponent(state.activeCategory)}`);
  const { rows } = await res.json();

  $("catLabel2").textContent = state.activeCategory;

  const palette = ["#F5A623", "#2DD4BF", "#818CF8", "#F472B6", "#4ADE80", "#FB923C"];
  const ctx = $("pieChart").getContext("2d");
  if (charts.pie) charts.pie.destroy();
  charts.pie = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: rows.map((r) => r.name),
      datasets: [{ data: rows.map((r) => r.value), backgroundColor: palette }],
    },
    options: { plugins: { legend: { labels: { color: "#94A3B8", font: { size: 11 } } } } },
  });
}

async function loadTrend() {
  if (!state.activeNumeric) return;
  const res = await fetch(`/api/records?limit=200`);
  const { rows } = await res.json();

  $("numLabel2").textContent = state.activeNumeric;

  const ctx = $("lineChart").getContext("2d");
  if (charts.line) charts.line.destroy();
  charts.line = new Chart(ctx, {
    type: "line",
    data: {
      labels: rows.map((_, i) => i + 1),
      datasets: [
        {
          label: state.activeNumeric,
          data: rows.map((r) => r[state.activeNumeric]),
          borderColor: "#4ADE80",
          backgroundColor: "transparent",
          tension: 0.3,
          pointRadius: 0,
        },
      ],
    },
    options: chartOptions(),
  });
}

function chartOptions() {
  return {
    plugins: { legend: { display: false } },
    scales: {
      x: { ticks: { color: "#64748B", font: { size: 11 } }, grid: { color: "#1F2A40" } },
      y: { ticks: { color: "#64748B", font: { size: 11 } }, grid: { color: "#1F2A40" } },
    },
  };
}

async function loadRecords() {
  const search = $("searchInput").value;
  const params = new URLSearchParams({ page: state.page, limit: state.limit, search });
  const res = await fetch(`/api/records?${params.toString()}`);
  const { rows, total } = await res.json();
  state.totalRows = total;

  $("rowCount").textContent = `(${total})`;
  $("tableHead").innerHTML = `<tr>${state.columns.map((c) => `<th>${c.label}</th>`).join("")}</tr>`;
  $("tableBody").innerHTML = rows
    .map((r) => `<tr>${state.columns.map((c) => `<td>${r[c.name] ?? ""}</td>`).join("")}</tr>`)
    .join("");

  const totalPages = Math.max(1, Math.ceil(total / state.limit));
  $("pageInfo").textContent = `page ${state.page} / ${totalPages}`;
  $("prevPage").disabled = state.page <= 1;
  $("nextPage").disabled = state.page >= totalPages;
}

// ---------- Event listeners ----------

$("fileInput").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) uploadFile(file);
});

$("sampleBtn").addEventListener("click", async () => {
  const res = await fetch("/sample_students.csv");
  const blob = await res.blob();
  const file = new File([blob], "sample_students.csv", { type: "text/csv" });
  uploadFile(file);
});

$("numericSelect").addEventListener("change", (e) => {
  state.activeNumeric = e.target.value;
  loadStats();
  loadGroupChart();
  loadTrend();
});

$("categorySelect").addEventListener("change", (e) => {
  state.activeCategory = e.target.value;
  loadGroupChart();
  loadDistribution();
});

let searchTimeout;
$("searchInput").addEventListener("input", () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    state.page = 1;
    loadRecords();
  }, 300);
});

$("prevPage").addEventListener("click", () => {
  if (state.page > 1) {
    state.page -= 1;
    loadRecords();
  }
});
$("nextPage").addEventListener("click", () => {
  state.page += 1;
  loadRecords();
});
