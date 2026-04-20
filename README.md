<div align="center">

# BLW Canada — Cell Dashboard

A single-file HTML dashboard for tracking cell and service attendance across subgroups.  
Data is pulled live from a Google Apps Script backend and rendered client-side with no framework dependencies.

> 🔗 **Live demo available upon request.**

<br/>

<img width="1912" alt="Dashboard overview — dark mode" src="https://github.com/user-attachments/assets/c130d6c5-48c2-4a48-80e2-ff775d11124e" />

<br/><br/>

<img width="1897" alt="Dashboard overview — light mode" src="https://github.com/user-attachments/assets/998ae1bc-5763-44af-aad3-db70e71269d2" />

</div>

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla HTML / CSS / JavaScript (single file) |
| Charts | Chart.js 4.4.1 |
| Fonts | DM Serif Display, DM Sans (Google Fonts) |
| Data Backend | Google Apps Script (Web App) |
| Data Transport | JSONP + Fetch (dual transport with auto-fallback) |
| Caching | `localStorage` (per-subgroup scope) |

---

## Features

### Views & Navigation

| Tab | Description |
|-----|-------------|
| **Regional** | Aggregated overview across all subgroups (full view only) |
| **SG Overview** | Per-subgroup summary cards for both Cells and Services |
| **Cells** | Individual cell attendance cards with sparklines |
| **Services** | Individual service attendance cards |

### Per-Card Metrics

- Attendance sparkline (last N weeks/months)
- Trend badge with month-on-month % change
- Reporting rate ring (visual % indicator)
- Last 3-month average attendance
- Membership count
- **Needs Attention** flag with reasons

### Filtering & Sorting

- Live search by name, group, or leader
- Sort by: Name · Growth % · Attendance · Membership · Reporting Rate
- Trend filter: All · Growing · Emerging · Declining · Stable · Volatile · Needs Attention · Missing Reports
- **Reset Filters** button
- Clickable summary pills

### UI

- Dark mode (default) and light mode toggle — preference saved to `localStorage`
- Click any card to open a detailed modal with full chart, stats, and attention notes
- Responsive grid layout

---

## Trend Classifications

Trends are computed algorithmically from the attendance series. No manual tagging.

| Label | What triggers it |
|-------|-----------------|
| **Growing** | Recent average is >4% above prior window, with consistent upward movement |
| **Emerging Growth** | Same as Growing but only 3 data points available (low confidence) |
| **Declining** | 3 consecutive declines, OR 2 strong drops (>10% each) in recent periods |
| **Volatile** | Swing range ≥35% of the group's own average AND at least 1 directional alternation in recent moves |
| **Stable** | Movement present but no clear sustained direction |
| **Insufficient data** | Fewer than 3 valid data points |
| **New** | Exactly 2 valid data points |

> Low-confidence labels are visually dimmed on the trend badge.

---

## Subgroup URL Parameters

The dashboard supports restricted subgroup-specific URLs that hide the full view.

```
https://your-deployment/?subgroup=SubgroupName
```

Replace spaces with `%20`:

```
https://your-deployment/?subgroup=Zone%20A
```

**What changes in subgroup view:**
- Only that subgroup's data is fetched from the backend
- The **Regional** tab is hidden
- Group tabs are hidden (no browsing across other groups)
- The subgroup name is passed to the Apps Script API so only relevant records are returned

**Reserved values** (normalised to full view — will not filter):  
`all` · `all-groups` · `full` · `regional` · `*`

---

## Data Loading & Caching

1. On page load, any previously cached payload for the current scope is shown immediately
2. A fresh fetch is attempted via both JSONP and Fetch simultaneously (first valid response wins)
3. Up to **4 retry attempts** with escalating timeouts (10s → 25s) and backoff delays
4. On success, the new payload is saved to `localStorage` under a scoped key:
   ```
   blw-dashboard-last-good-payload-v2-copy-{scope}
   ```
   where `{scope}` is the subgroup name (lowercased) or `all`
5. If the network fails but a cache exists, cached data remains visible and a background retry is scheduled after 45 seconds

---

## Backend (Google Apps Script)

The dashboard fetches from:

```
https://script.google.com/macros/s/{DEPLOYMENT_ID}/exec
```

**Query parameters:**

| Parameter | Description |
|-----------|-------------|
| `subgroup` | Filter results to a specific subgroup |
| `callback` | JSONP callback function name (auto-generated) |

**Expected response shape:**

```json
{
  "overview": [ ... ],
  "cells": [ ... ],
  "services": [ ... ],
  "lastUpdated": "2024-01-01T00:00:00.000Z"
}
```

Each item in `cells` and `services` should include fields such as `name`, `group`, `leader`, `membership`, `reporting_pct`, and a series of attendance values with corresponding labels.

---

## Access Control

The subgroup URL system provides basic data separation — each subgroup link fetches only its own data. The full dashboard URL is not protected by default.

**Token-based** *(no server required)*  
Add a secret token check in the HTML. Without `?token=yourSecret`, the page shows nothing. Subgroup links do not include the token.

**Two separate files**  
Maintain one admin file (full view) and one subgroup-only file (Regional tab removed at source).

**Server-side auth** *(most secure)*  
Host the full dashboard behind HTTP Basic Auth or a login wall. Subgroup files are served from a separate public path.

---

## File Structure

Single-file application — HTML, CSS, JavaScript, and chart logic all in one `.html` file.

```
dashboard.html   ← entire application
README.md        ← this file
```

---

## Hosting

The file can be hosted anywhere that serves static HTML — no build step, no npm, no dependencies to install.

---

## Project Rating

**Overall: 8.4 / 10** — Strong production-ready tool, thoughtfully built with real operational maturity.

| Dimension | Score |
|-----------|-------|
| Technical execution | 9 / 10 |
| Feature completeness | 8.8 / 10 |
| UX & design | 8.5 / 10 |
| Resilience & caching | 9 / 10 |
| Architecture | 7.5 / 10 |
| Access control | 6.5 / 10 |

**Strengths**
- Algorithmic trend engine (Growing / Volatile / Declining etc.) is genuinely sophisticated for a no-framework app
- Dual JSONP + Fetch transport with retry backoff and `localStorage` fallback — real offline resilience
- Subgroup URL scoping is a clever zero-server access pattern
- Single-file deploy with zero dependencies is a strong operational choice for a volunteer/church context

**Areas to grow**
- Single-file architecture will get harder to maintain as features grow — worth splitting CSS/JS at some point
- Access control is advisory — a determined user can still reach the full URL; token or server auth recommended before sharing widely
- No offline-first fallback for a full Apps Script outage beyond showing cached data
