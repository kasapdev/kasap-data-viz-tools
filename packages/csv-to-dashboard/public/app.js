import { parseCSV } from "/lib/csv.js";
import { inferColumns } from "/lib/inference.js";
import { renderBarChartSVG, renderLineChartSVG, computeStats } from "/lib/charts.js";

const fileInput = document.getElementById("file");
const statusEl = document.getElementById("status");
const output = document.getElementById("output");

fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) return;

  statusEl.textContent = `Reading ${file.name}...`;
  output.innerHTML = "";

  try {
    const text = await file.text();
    const { headers, rows } = parseCSV(text);

    if (headers.length === 0) {
      statusEl.textContent = "Could not find any rows in that file.";
      return;
    }

    const columns = inferColumns(headers, rows);
    statusEl.textContent = `${rows.length} rows, ${headers.length} columns.`;

    render(columns, headers, rows);
  } catch (err) {
    statusEl.textContent = `Failed to parse CSV: ${err instanceof Error ? err.message : String(err)}`;
  }
});

function render(columns, headers, rows) {
  output.innerHTML = "";

  const dateColumn = columns.find((c) => c.type === "date");
  const numberColumns = columns.filter((c) => c.type === "number");
  const categoricalColumns = columns.filter((c) => c.type === "categorical");

  // Numeric stats table (one row per numeric column).
  if (numberColumns.length > 0) {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `<h2>Numeric column statistics</h2><div class="meta">min / max / mean / median</div>`;
    const table = document.createElement("table");
    table.innerHTML = `<thead><tr><th>Column</th><th>Count</th><th>Min</th><th>Max</th><th>Mean</th><th>Median</th></tr></thead>`;
    const tbody = document.createElement("tbody");
    for (const col of numberColumns) {
      const idx = headers.indexOf(col.name);
      const values = rows.map((r) => Number(r[idx])).filter((v) => Number.isFinite(v));
      const stats = computeStats(values);
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${escapeHtml(col.name)}</td><td>${stats.count}</td><td>${fmt(stats.min)}</td><td>${fmt(stats.max)}</td><td>${fmt(stats.mean)}</td><td>${fmt(stats.median)}</td>`;
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    card.appendChild(table);
    output.appendChild(card);
  }

  // Bar chart per categorical column: count occurrences of each value.
  for (const col of categoricalColumns) {
    const idx = headers.indexOf(col.name);
    const counts = new Map();
    for (const row of rows) {
      const value = (row[idx] ?? "").trim() || "(empty)";
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    const data = [...counts.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 15);

    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `<h2>${escapeHtml(col.name)}</h2><div class="meta">${col.distinctCount} distinct values (top ${data.length} shown)</div>`;
    card.innerHTML += renderBarChartSVG(data, { width: 640, height: 280 });
    output.appendChild(card);
  }

  // Line chart per numeric column plotted against the first date column found.
  if (dateColumn) {
    const dateIdx = headers.indexOf(dateColumn.name);
    for (const col of numberColumns) {
      const idx = headers.indexOf(col.name);
      const points = rows
        .map((row) => {
          const t = Date.parse(row[dateIdx] ?? "");
          const y = Number(row[idx]);
          return { x: t, y };
        })
        .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
        .sort((a, b) => a.x - b.x);

      if (points.length === 0) continue;

      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `<h2>${escapeHtml(col.name)} over ${escapeHtml(dateColumn.name)}</h2><div class="meta">${points.length} points</div>`;
      card.innerHTML += renderLineChartSVG(points, { width: 640, height: 280 }, (v) =>
        new Date(v).toISOString().slice(0, 10),
      );
      output.appendChild(card);
    }
  }

  if (numberColumns.length === 0 && categoricalColumns.length === 0) {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML =
      "<h2>No categorical or numeric columns detected</h2><div class=\"meta\">Nothing to chart automatically for this file.</div>";
    output.appendChild(card);
  }
}

function fmt(value) {
  if (!Number.isFinite(value)) return "-";
  return Math.round(value * 100) / 100;
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
