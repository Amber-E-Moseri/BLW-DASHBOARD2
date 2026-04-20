# Intelligence Dashboard

A live attendance and reporting dashboard for tracking 53 cells and services across six groups.

> Built with Google Apps Script + vanilla HTML/JS. No framework. No build step. Deploys as a single file.

---

🔗 **Live demo available upon request.**
## Preview

<br/>

<img width="1912" alt="Dashboard overview — dark mode" src="https://github.com/user-attachments/assets/c130d6c5-48c2-4a48-80e2-ff775d11124e" />

<br/><br/>

<img width="1897" alt="Dashboard overview — light mode" src="https://github.com/user-attachments/assets/998ae1bc-5763-44af-aad3-db70e71269d2" />

</div>

---

## What This Dashboard Does

- Tracks weekly attendance across all cells and services by subgroup
- Flags underperforming cells — low reporting % or multiple missing weeks
- Displays attendance trends (Growing / Declining / Stable) per cell and service
- Provides subgroup-level aggregated insights for regional leadership
- Supports restricted views per subgroup via unique shareable links
- Renders live from Google Sheets — no manual exports needed

---

## Project Structure

```
BLWCANADA-DASHBOARD/
├── index.html        # Full dashboard UI — single file, self-contained
├── appscript.gs      # Google Apps Script backend — deployed as a web app
└── canada_sr.png     # Logo used in the dashboard header
```

---

## Architecture Overview

```
Google Sheet
  └─ "Cell Reporting" sheet
  └─ "Services" sheet
        │
        ▼
  appscript.gs  (Google Apps Script Web App)
        │  reads both sheets, computes summaries
        │  returns JSON payload via HTTP GET
        │  supports JSONP for CORS bypass
        ▼
  index.html  (static dashboard, hosted anywhere)
        │  fetches data on load
        │  caches to localStorage per subgroup
        │  renders charts, trends, and filters
```

---

## Backend — `appscript.gs`

Deployed as a Google Apps Script **web app**. Reads the source spreadsheet and returns structured JSON on every `GET` request.

**Endpoint response shape:**

```json
{
  "last_updated": "<ISO timestamp>",
  "cells":    [ ...cell records ],
  "services": [ ...service records ],
  "overview": [ ...subgroup aggregates ]
}
```

**Key behaviours:**
- Detects group header rows automatically (name present, no leader/membership/attendance)
- Marks a week as `missing` when its cell is red-highlighted and empty
- Computes `needs_attention` flag: `reporting_pct < 50` OR `missing_reports >= 2`
- Writes (and formats) an **Overview tab** back into the spreadsheet after every fetch
- Supports `?callback=<n>` for JSONP cross-origin loading

---

## Frontend — `index.html`

A fully self-contained single-file dashboard. Open directly in a browser — no server or build tool required.

**Dependencies (CDN only):**
- [Chart.js 4.4.1](https://www.chartjs.org/) — sparklines and attendance charts
- [DM Sans & DM Serif Display](https://fonts.google.com/) — typography

#### Views

| Tab         | Shows                                                       |
|-------------|-------------------------------------------------------------|
| SG Overview | One row per subgroup with rolled-up stats                   |
| Cells       | Individual cell records, grouped and filterable by subgroup |
| Services    | Individual service records, grouped by subgroup             |

#### Filters & Controls

- **Search** — by name, leader, or group
- **Trend filter** — Growing / Declining / Stable
- **Reset Filters** button
- **Light / Dark mode** toggle

#### URL Parameters

| Parameter  | Example                  | Effect                                            |
|------------|--------------------------|---------------------------------------------------|
| `subgroup` | `?subgroup=Central+SGA`  | Locks dashboard to one subgroup                   |
| `token`    | `?token=blw2024admin`    | Unlocks the full cross-subgroup admin view        |

Without either, access is blocked — allowing safe sharing of subgroup-specific links.

#### Data Loading Strategy

1. Checks `localStorage` for a cached payload → renders immediately if found
2. Races a **JSONP request** (CORS bypass) against a standard `fetch()` — first to respond wins
3. Retries up to **4 times** with escalating timeouts (10s → 25s) and 900ms backoff
4. Caches the fresh payload to `localStorage` (scoped per subgroup)
5. On fetch failure with cache available: keeps cached data visible, retries in 45 seconds

---

## Setup & Deployment

### 1. Prepare the Google Sheet

Create a Google Sheet with two tabs named **exactly**:

- `Cell Reporting`
- `Services`

**Cell Reporting layout** _(row 5 = month headers, row 6 = week labels, row 7+ = data)_

| Col | Field          | Notes                                              |
|-----|----------------|----------------------------------------------------|
| A   | SC Code        |                                                    |
| D   | Cell Name      | Group header rows: name only, all other cols empty |
| E   | Leader         |                                                    |
| F   | Membership     |                                                    |
| G   | Avg Attendance |                                                    |
| H   | Reporting %    |                                                    |
| I+  | Weekly data    | Red cell fill = missing/unreported week            |

**Services layout** _(same header row structure)_

| Col | Field              |
|-----|--------------------|
| A   | SC Code            |
| B   | Cells Represented  |
| C   | Service Name       |
| D   | Leader             |
| E   | Reporting %        |
| F   | Avg Attendance     |
| G+  | Weekly data        |

### 2. Deploy the Apps Script

1. In your Google Sheet: **Extensions → Apps Script**
2. Paste the contents of `appscript.gs` and save
3. **Deploy → New deployment** → Type: **Web App**
4. Execute as: **Me** · Who has access: **Anyone**
5. Copy the generated deployment URL

### 3. Wire Up the Dashboard

In `index.html` (~line 2486), replace the placeholder URL:

```js
const BASE_API_URL = 'https://script.google.com/macros/s/<YOUR_DEPLOYMENT_ID>/exec';
```

Optionally update the admin token (~line 806):

```js
const FULL_VIEW_TOKEN = 'your-secure-token-here';
```

### 4. Host & Share

`index.html` is a static file — host it anywhere (GitHub Pages, Netlify, Vercel, etc.).

```
# Subgroup leader link (restricted view)
https://your-domain.com/?subgroup=Central+SGA

# Admin link (full view)
https://your-domain.com/?token=your-secure-token-here
```

---

## Subgroups

Six subgroups are tracked (defined in `appscript.gs`):

`Central East SGA` · `Central East SGB` · `Central SGA` · `Central SGB` · `West SGA` · `West SGB`

---

## Data Model Reference

<details>
<summary>Cell / Service record fields</summary>

| Field             | Type    | Description                                              |
|-------------------|---------|----------------------------------------------------------|
| `name`            | string  | Cell or service name                                     |
| `leader`          | string  | Leader name                                              |
| `membership`      | number  | Registered members (cells only)                          |
| `avg_attendance`  | number  | Average weekly attendance                                |
| `engagement_pct`  | number  | `avg_attendance / membership × 100`                      |
| `reporting_pct`   | number  | % of weeks with a submitted report                       |
| `missing_reports` | number  | Count of red-highlighted (unreported) weeks              |
| `needs_attention` | boolean | `true` if `reporting_pct < 50` or `missing_reports >= 2` |
| `sc_code`         | string  | Subgroup/cluster code                                    |
| `group`           | string  | Subgroup name                                            |
| `weekly`          | array   | `[{ week, attendance, missing }]` per reported week      |

</details>

<details>
<summary>Overview record fields (per subgroup)</summary>

Includes all of the above rolled up per subgroup, plus:

| Field                       | Description                                     |
|-----------------------------|-------------------------------------------------|
| `cell_count`                | Number of cells in the subgroup                 |
| `cell_avg_engagement_pct`   | Average engagement % across cells               |
| `cells_needing_attention`   | Count of cells flagged `needs_attention`         |
| `service_count`             | Number of services in the subgroup              |
| `service_cells_represented` | Total cells covered by services                 |
| `missing_reports`           | Combined missing report count (cells + services)|
| `weekly`                    | Merged weekly averages across cells and services|

</details>

