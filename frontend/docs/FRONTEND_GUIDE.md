# CAP Frontend Guide

**Cardano Analytics Platform – User & Developer Documentation**

This guide explains how to use, customize, and contribute to the **CAP Frontend**, the React/Vite interface powering natural language blockchain analytics, dashboards, and Cardano wallet integration.

---

# Table of Contents

1. [Overview](#overview)
2. [User Guide](#user-guide)

   - [Logging In](#logging-in)
   - [Landing Page](#landing-page)
   - [Natural Language Queries](#natural-language-queries)
   - [Interpreting Results](#interpreting-results)
   - [Artifacts (Tables & Charts)](#artifacts-tables--charts)
   - [Pinning Items to Dashboard](#pinning-items-to-dashboard)
   - [Dashboard Usage](#dashboard-usage)
   - [Settings Page](#settings-page)

3. [Developer Guide](#developer-guide)

   - [Project Structure](#project-structure)
   - [Environment Variables](#environment-variables)
   - [Running Locally](#running-locally)
   - [API Dependencies](#api-dependencies)
   - [Key Hooks & Components](#key-hooks--components)
   - [Artifacts Architecture](#artifacts-architecture)
   - [Dashboard Architecture](#dashboard-architecture)

4. [Cardano Wallet Integration](#cardano-wallet-integration)
5. [Internationalization](#internationalization)
6. [Styling & Theming](#styling--theming)
7. [Contributing](#contributing)

---

# Overview

The **CAP Frontend** is a React/Vite SPA that communicates with the CAP backend to provide:

- Natural language blockchain analytics
- Interactive dashboard widgets
- Multilingual interface (EN + PT-BR)
- Wallet-based authentication (CIP-30)
- Real-time ETL sync indicators
- Responsive mobile-friendly UI

This document helps both **users** and **developers** operate and extend the frontend.

---

# User Guide

## Logging In

CAP supports **three authentication methods**:

1. **Email + Password** (with confirmation flow)
2. **Google OAuth**
3. **Cardano Wallet Login (CIP-30)** for on-chain actions

<p align="center">
  <img src="./images/login.png"
       alt="Login Page"
       width="700"
       style="border-radius: 12px; box-shadow: 0 2px 12px rgba(56, 56, 56, 0.45);" />
</p>

---

## Landing Page

After login, you’re greeted with the **Natural Language Query Interface**, where you can ask things like:

- “What is a datum?“
- “Plot a pie chart to show how much the top 1% ADA holders represent from the total supply on the Cardano network.“
- “Plot a bar chart showing monthly multi assets created in 2021.“
- “List the latest 5 blocks.“
- “Plot a line chart showing monthly number of transactions and outputs.“

<p align="center">
  <img src="./images/landing.png"
       alt="Login Page"
       width="700"
       style="border-radius: 12px; box-shadow: 0 2px 12px rgba(56, 56, 56, 0.45);" />
</p>

Key elements:

- Input box for NL queries
- Streamed responses (real-time token updates)
- Auto-detected charts/tables displayed below
- “Pin to Dashboard” button for any artifact
- Toast notifications on pinning
- Query history scrollable on the left sidebar

---

## Natural Language Queries

The NL pipeline works like this:

1. User enters a message
2. Backend LLM interprets → generates SPARQL
3. SPARQL executed on knowledge graph
4. Results returned in a standardized `kv_results` format
5. Frontend detects chart/table & displays automatically

Features:

- Markdown formatting
- KaTeX math support
- Code / SPARQL highlighting
- Chunked/streamed text
- Cancelable queries

---

## Interpreting Results

Every system response includes:

- **Textual explanation**
- **Structured `kv_results`**:

  - `metadata`
  - `result_type: table | bar_chart | line_chart | ...`
  - `data.values`

The frontend uses `kvToChartSpec` to automatically convert results into:

- Vega-Lite charts (`VegaChart`)
- Smart tables (`KVTable`)

---

## Artifacts (Tables & Charts)

Artifacts support:

- Responsive layout
- Click-to-expand (for charts)
- Sortable columns (for tables)
- Overflow detection for wide tables
- Consistent dark/light theming
- Toolbar with:

  - Pin to dashboard
  - Info tooltip
  - Expand/close buttons

---

## Pinning Items to Dashboard

Any artifact (chart or table) includes a **Pin to Dashboard** button.

Workflow:

1. User clicks **📌 Pin to Dashboard**
2. A toast appears (“Pinned to your dashboard!”)
3. Clicking the toast opens the dashboard directly
4. Layout persists across sessions

---

## Dashboard Usage

<p align="center">
  <img src="./images/dashboard.png"
       alt="Login Page"
       width="700"
       style="border-radius: 12px; box-shadow: 0 2px 12px rgba(56, 56, 56, 0.45);" />
</p>

Dashboard features:

- Widgets (drag & drop, resize planned)
- Responsive cards (mobile-friendly)
- Chart modal (click widget to enlarge)
- Persistent layout stored in PostgreSQL

Each dashboard widget corresponds to a saved **artifact**, not raw data—preserving:

- Chart type
- Formatting
- Query metadata
- Config object

---

## Settings Page

<p align="center">
  <img src="./images/settings.png"
       alt="Login Page"
       width="700"
       style="border-radius: 12px; box-shadow: 0 2px 12px rgba(56, 56, 56, 0.45);" />
</p>

Settings allow:

- Language selection
- Profile details (display name, username, avatar)
- Notification preferences (planned)
- Wallet connection status (planned)
- Logout controls (planned)

---

# Developer Guide

## Project Structure

```
src/
├── components/
│   ├── artifacts/        # VegaChart, KVTable, artifact toolbars
│   ├── dashboard/        # Grid, toolbar, widget components
│   ├── layout/           # NavBar, Header, NavigationSidebar
│   └── ...
├── hooks/
│   ├── useAuthRequest.js
│   ├── useLLMStream.js
│   ├── useDashboardData.js
│   ├── useDashboardItems.js
│   └── useSyncStatus.js
├── pages/
│   ├── LandingPage.jsx
│   ├── DashboardPage.jsx
│   ├── SettingsPage.jsx
│   └── ...
├── utils/
│   ├── kvCharts.js
│   ├── streamSanitizers.js
│   └── ...
└── styles/
```

---

## Environment Variables

Vite loads variables depending on the mode:

| File               | Used In         | Notes                   |
| ------------------ | --------------- | ----------------------- |
| `.env`             | All modes       | Baseline values         |
| `.env.local`       | Local only      | Secrets; ignored by Git |
| `.env.development` | `npm run dev`   | Dev-only overrides      |
| `.env.production`  | `npm run build` | Production settings     |

Important variables:

```
VITE_API_URL=http://localhost:8000/api
VITE_NL_ENDPOINT=http://localhost:8000/query
VITE_GOOGLE_CLIENT_ID=...
VITE_ENV_LABEL=DEV
```

---

## Running Locally

```
npm install
npm run dev
```

Frontend runs on:

```
http://localhost:5173
```

Hot reload is fully supported.

---

## API Dependencies

The frontend communicates with:

- `POST /query` — NL → SPARQL pipeline
- `GET /api/v1/dashboard/*` — dashboards
- `POST /api/v1/auth/*` — authentication
- `POST /api/v1/wallet/*` — wallet sessions
- `GET /api/v1/sync-status` — blockchain sync

Ensure the backend is running (FastAPI + Postgres + Virtuoso).

---

## Key Hooks & Components

### Hooks

- **useLLMStream** – Handles chunked streaming from NL endpoint
- **useDashboardData** – Fetches dashboards list & defaults
- **useDashboardItems** – Fetches widgets inside dashboards
- **useSyncStatus** – Polls backend for ETL status
- **useAuthRequest** – Authenticated fetch layer

### Components

- **VegaChart** – Auto-rendered Vega-Lite chart
- **KVTable** – Auto-built dynamic table
- **DashboardGrid** – Drag/resizable grid container
- **DashboardWidget** – Wrapper for each artifact
- **NavigationSidebar** – Sliding left sidebar
- **Header / NavBar** – Top navigation
- **Toast Notifications** – Click-to-open-dashboard support

---

## Artifacts Architecture

Artifacts standardize all chart/table results using:

```
{
  result_type: "bar_chart" | "line_chart" | "table",
  data: { values: [...] },
  metadata: { columns: [...], count: ... }
}
```

Conversion is handled by:

```
kvToChartSpec()
```

Tables are rendered via **KVTable**, charts via **VegaChart**.

Artifacts are reusable both in:

- LandingPage (via NL query)
- DashboardPage (widgets)

---

## Dashboard Architecture

Dashboard widgets are stored in PostgreSQL with fields:

- `artifact_type`
- `title`
- `source_query`
- `config`
- `position`, `width`, `height`

Frontend uses:

- **react-grid-layout** style grid
- Resize + drag
- Widget removal
- Persisted layout

---

# Cardano Wallet Integration

CAP supports any **CIP-30 wallet**, including:

- Eternl
- Flint
- Lace
- Nami (legacy)

Capabilities:

- Connect/disconnect
- Read balance (ADA + multi-assets)
- Sign transactions
- Submit transactions (via backend proxy if configured)

Used primarily for:

- Publishing on-chain artifacts
- Signing authentication requests
- Confirming dashboard actions (future extensions)

---

# Internationalization

Translations live in:

```
src/i18n/
```

Languages supported:

- 🇬🇧 English
- 🇧🇷 Portuguese

All UI strings go through `t(...)`.

Add new languages by adding new JSON files and updating the i18n init.

---

# Styling & Theming

CAP uses:

- React-Bootstrap for base components
- Custom CSS modules under `src/styles/`
- Dark mode as the primary design
- Tailored scrollbars, toasts, modals, and grid cards

Developers can modify:

- Theme colors
- NavBar / Sidebar appearance
- Dashboard card styles
- Artifact spacing and shadows

---

# Contributing

1. Fork the repository
2. Create a feature branch
3. Ensure ESLint passes
4. Submit a PR with clear description
5. Include screenshots when modifying UI
