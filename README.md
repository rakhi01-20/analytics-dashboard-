# PulseAnalytics — Full-Stack Data Analytics Dashboard

A complete full-stack web application: CSV upload → SQLite database storage → REST API →
live, interactive charts. Built with **Node.js, Express, SQLite, and vanilla JS/Chart.js**
(no heavy frontend build tools, so it's light enough to run comfortably even on a
low-RAM laptop, or entirely in the cloud with zero local install).

## Tech Stack
- **Backend:** Node.js + Express — REST API
- **Database:** SQLite (via `better-sqlite3`) — file-based, no separate DB server needed
- **File handling:** Multer (upload) + csv-parse (parsing)
- **Frontend:** Plain HTML/CSS/JS + Chart.js (via CDN) — no React/webpack build step
- **Fonts:** Space Grotesk (headings), IBM Plex Sans (body), IBM Plex Mono (data)

## Features
- Upload any CSV — server auto-detects numeric vs categorical columns
- Data persisted in a real SQL database, not just in-browser memory
- REST API endpoints compute statistics **on the server**:
  - `GET /api/columns` — column names + inferred types
  - `GET /api/records?search=&page=&limit=` — paginated, searchable raw data
  - `GET /api/stats?column=X` — count, mean, median, std dev, min/max
  - `GET /api/group?category=Y&numeric=X` — grouped averages (for bar chart)
  - `GET /api/distribution?column=Y` — category counts (for pie chart)
- Live bar chart, doughnut chart, and line/trend chart
- Debounced search + pagination on the data table
- Sample dataset included (college student records) so it works out of the box

## Running it — Option A: On a cloud IDE (recommended for low-RAM laptops)

You don't need to install anything locally. Use a free browser-based environment:

1. **Replit** (easiest): Go to replit.com → Create Repl → Import from GitHub (or upload
   this folder as a zip) → it auto-detects Node.js → click **Run**. Replit gives you a
   live public URL instantly.
2. **GitHub Codespaces**: Push this folder to a GitHub repo → click **Code → Codespaces →
   Create codespace** → in the terminal run `npm install && npm start` → it forwards
   port 3000 automatically with a clickable link.
3. **StackBlitz**: stackblitz.com → new Node.js project → drag in these files → run.

All three run the app on Anthropic/Google/Microsoft's servers, not your laptop — so RAM
is never a bottleneck.

## Running it — Option B: Locally (if you want to)

```bash
npm install
npm start
```

Then open **http://localhost:3000** in your browser.

## Deploying it live (for submission / demo link)

- **Backend + frontend together (this repo as-is):** Render.com or Railway.app —
  both have a free tier, connect your GitHub repo, set start command `npm start`, done.
- Since the frontend is served by Express itself (`public/` folder), you only need
  **one** deployment — no separate frontend hosting required.

## Project Structure
```
analytics-project/
├── server.js          # Express backend + all API routes
├── package.json
├── data.db             # SQLite database (auto-created on server start)
└── public/
    ├── index.html
    ├── style.css
    ├── script.js
    └── sample_students.csv
```

## For your project report
> "A full-stack data analytics dashboard where CSV datasets are parsed, validated,
> and persisted in a relational (SQLite) database. All statistical computation —
> mean, median, standard deviation, grouped aggregation — is performed server-side
> via REST API endpoints, with the frontend purely responsible for visualization
> and user interaction. This separation of concerns demonstrates a genuine
> client-server architecture rather than a client-only simulation."

## Possible extensions (if you want to go further)
- Add user authentication (login/signup) with JWT
- Add a "download filtered results as CSV" endpoint
- Add correlation analysis between two numeric columns
- Switch SQLite → PostgreSQL for a "production-grade" story
