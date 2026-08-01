const express = require("express");
const multer = require("multer");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const { parse } = require("csv-parse/sync");
const Database = require("better-sqlite3");

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, "data.db");

// Fresh DB file on each server start (keeps the demo simple & predictable)
if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
const db = new Database(DB_PATH);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

let currentColumns = []; // [{ name, type: 'numeric' | 'text' }]

function sanitizeColumnName(name) {
  return name.trim().replace(/[^a-zA-Z0-9_]/g, "_").replace(/^(\d)/, "_$1");
}

function inferType(values) {
  const sample = values.slice(0, 50).filter((v) => v !== "" && v !== null && v !== undefined);
  if (sample.length === 0) return "text";
  const allNumeric = sample.every((v) => v !== "" && !Number.isNaN(Number(v)));
  return allNumeric ? "numeric" : "text";
}

// ---------- Routes ----------

// Upload a CSV, replace the dataset in SQLite
app.post("/api/upload", upload.single("file"), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });

    const text = req.file.buffer.toString("utf-8");
    const records = parse(text, { columns: true, skip_empty_lines: true, trim: true });

    if (!records.length) return res.status(400).json({ error: "CSV is empty or invalid." });

    const rawColumns = Object.keys(records[0]);
    const columnMap = rawColumns.map((c) => ({ raw: c, safe: sanitizeColumnName(c) }));

    currentColumns = columnMap.map(({ raw, safe }) => ({
      name: safe,
      label: raw,
      type: inferType(records.map((r) => r[raw])),
    }));

    db.exec("DROP TABLE IF EXISTS records");
    const colDefs = currentColumns
      .map((c) => `"${c.name}" ${c.type === "numeric" ? "REAL" : "TEXT"}`)
      .join(", ");
    db.exec(`CREATE TABLE records (id INTEGER PRIMARY KEY AUTOINCREMENT, ${colDefs})`);

    const insertCols = currentColumns.map((c) => `"${c.name}"`).join(", ");
    const placeholders = currentColumns.map(() => "?").join(", ");
    const insert = db.prepare(`INSERT INTO records (${insertCols}) VALUES (${placeholders})`);

    const insertMany = db.transaction((rows) => {
      for (const row of rows) {
        const values = columnMap.map(({ raw }, i) => {
          const val = row[raw];
          if (currentColumns[i].type === "numeric") {
            const n = Number(val);
            return Number.isNaN(n) ? null : n;
          }
          return val ?? null;
        });
        insert.run(...values);
      }
    });
    insertMany(records);

    res.json({
      message: "Uploaded successfully.",
      rowCount: records.length,
      columns: currentColumns,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to process CSV: " + err.message });
  }
});

// List columns + inferred types for the current dataset
app.get("/api/columns", (req, res) => {
  res.json({ columns: currentColumns });
});

// Paginated / searchable raw records
app.get("/api/records", (req, res) => {
  try {
    const { search = "", page = 1, limit = 50 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    let rows;
    let total;

    if (search.trim()) {
      const like = `%${search.trim()}%`;
      const whereClause = currentColumns.map((c) => `"${c.name}" LIKE ?`).join(" OR ");
      const params = currentColumns.map(() => like);
      rows = db
        .prepare(`SELECT * FROM records WHERE ${whereClause} LIMIT ? OFFSET ?`)
        .all(...params, Number(limit), offset);
      total = db.prepare(`SELECT COUNT(*) as c FROM records WHERE ${whereClause}`).get(...params).c;
    } else {
      rows = db.prepare(`SELECT * FROM records LIMIT ? OFFSET ?`).all(Number(limit), offset);
      total = db.prepare(`SELECT COUNT(*) as c FROM records`).get().c;
    }

    res.json({ rows, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Summary statistics for a numeric column (computed server-side)
app.get("/api/stats", (req, res) => {
  try {
    const { column } = req.query;
    if (!column) return res.status(400).json({ error: "column query param required." });

    const colMeta = currentColumns.find((c) => c.name === column);
    if (!colMeta || colMeta.type !== "numeric") {
      return res.status(400).json({ error: "Column not found or not numeric." });
    }

    const agg = db
      .prepare(
        `SELECT COUNT("${column}") as count, AVG("${column}") as mean, MIN("${column}") as min, MAX("${column}") as max
         FROM records WHERE "${column}" IS NOT NULL`
      )
      .get();

    const values = db
      .prepare(`SELECT "${column}" as v FROM records WHERE "${column}" IS NOT NULL ORDER BY "${column}" ASC`)
      .all()
      .map((r) => r.v);

    let median = null;
    if (values.length) {
      const mid = Math.floor(values.length / 2);
      median = values.length % 2 !== 0 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
    }

    const variance = values.length
      ? values.reduce((acc, v) => acc + (v - agg.mean) ** 2, 0) / values.length
      : 0;
    const std = Math.sqrt(variance);

    res.json({ ...agg, median, std });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Grouped averages of a numeric column, grouped by a categorical column
app.get("/api/group", (req, res) => {
  try {
    const { category, numeric } = req.query;
    if (!category || !numeric) return res.status(400).json({ error: "category and numeric query params required." });

    const rows = db
      .prepare(
        `SELECT "${category}" as name, AVG("${numeric}") as average, COUNT(*) as count
         FROM records WHERE "${category}" IS NOT NULL GROUP BY "${category}" ORDER BY average DESC`
      )
      .all();

    res.json({ rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Distribution (counts) of a categorical column - for pie/bar charts
app.get("/api/distribution", (req, res) => {
  try {
    const { column } = req.query;
    if (!column) return res.status(400).json({ error: "column query param required." });

    const rows = db
      .prepare(`SELECT "${column}" as name, COUNT(*) as value FROM records GROUP BY "${column}" ORDER BY value DESC`)
      .all();

    res.json({ rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Analytics Dashboard running at http://localhost:${PORT}`);
});
