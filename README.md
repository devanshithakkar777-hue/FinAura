# FinAura — Behavior-Driven AI Investing Platform

> An AI-powered portfolio intelligence platform built for Gen Z investors — combining real-time health scoring, behavioral analysis, and gamified financial discipline.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Architecture](#architecture)
- [Key Design Decisions](#key-design-decisions)
- [Known Limitations](#known-limitations)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

FinAura is a React-based financial dashboard that helps retail investors understand not just *what* their portfolio looks like, but *how* they behave as investors. It scores portfolios in real time using a multi-factor health engine, detects behavioral patterns (panic selling, SIP inconsistency, over-concentration), and delivers AI-driven advisory through a chat interface.

The platform is built around three core beliefs:

1. **Behavior matters more than allocation** — Most retail losses come from emotional decisions, not bad picks.
2. **Explainability builds trust** — Every score and suggestion is grounded in visible metrics, not black-box outputs.
3. **Gamification sustains discipline** — XP, streaks, leaderboards, and achievements turn good habits into a game worth playing.

---

## Features

| Module | Description |
|--------|-------------|
| **Portfolio Health Score** | Multi-ring composite score across diversification, volatility, crypto exposure, and risk alignment |
| **Behavior Profile** | Radar chart of investing traits (patience, discipline, risk management, consistency, research depth) |
| **AI Chat Advisor** | Natural-language assistant with behavioral context and portfolio-aware responses |
| **Rebalance Simulator** | Interactive sliders that always sum to 100%, with live 10-year projections across 3 scenarios |
| **RSI Signals** | Per-asset momentum gauges with overbought / oversold thresholds |
| **Markets Dashboard** | Live-style quotes, sparklines, index strip, and category filtering |
| **Portfolio View** | Holdings table with P&L, return badges, and 6-month performance chart |
| **Rewards & XP** | Level progression, achievement badges, active challenges, leaderboard |
| **Risk Quiz** | 4-question onboarding quiz with corrected score boundaries → Conservative / Moderate / Aggressive |
| **Dark / Light Mode** | System-preference-aware theming with `localStorage` persistence |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 19 + Vite 7 |
| Styling | Tailwind CSS v4 (`@tailwindcss/vite`) |
| Animation | Framer Motion |
| Charts | Recharts |
| Auth & Database | Firebase v11 (Auth + Firestore) |
| Icons | Lucide React |
| HTTP client | Axios |
| Market data | Alpha Vantage API (falls back to mock data) |

---

## Project Structure

```
finaura/
├── index.html
├── vite.config.js
├── package.json
├── .env.example
│
└── src/
    ├── main.jsx                    # Entry point — providers wrap AppRoutes
    ├── App.jsx                     # Thin re-export of AppRoutes
    │
    ├── routes/
    │   └── AppRoutes.jsx           # Auth gate → Onboarding gate → App shell
    │
    ├── context/
    │   ├── AuthContext.jsx         # Firebase auth + Firestore profile, refreshProfile()
    │   └── ThemeContext.jsx        # Dark/light toggle with safe localStorage
    │
    ├── lib/
    │   └── firebase.js             # Firebase init — throws in prod on missing env vars
    │
    ├── app/
    │   ├── AppLayout.jsx           # Sidebar + Navbar wrapper with page transitions
    │   ├── Sidebar.jsx             # Nav, XP strip (live from profile), user row
    │   ├── Navbar.jsx              # Search, theme toggle, notifications, avatar
    │   ├── ThemeProvider.jsx       # Re-export shim
    │   └── layout/
    │       └── AppLayout.jsx       # Re-export shim (resolves AppRoutes import path)
    │
    ├── components/
    │   ├── Button.jsx              # Primary / ghost / danger variants + IconButton
    │   ├── Card.jsx                # Glass card + CardHeader
    │   ├── Badge.jsx               # Color-coded semantic badges
    │   ├── StatCard.jsx            # Animated stat card with trend indicator
    │   ├── Input.jsx               # Text input + Select with icon support
    │   └── ui/                     # Re-export shims — both import paths work
    │       ├── Button.jsx
    │       ├── Card.jsx
    │       ├── Badge.jsx
    │       └── StatCard.jsx
    │
    ├── features/
    │   ├── DashboardPage.jsx       # Main dashboard — stats, chart, health ring, holdings
    │   ├── HealthScoreRing.jsx     # Animated SVG multi-ring health score
    │   ├── PortfolioAllocation.jsx # Donut chart + allocation bars
    │   ├── AIInsightCard.jsx       # Expandable behavioral insight rows
    │   ├── RSIInsightCard.jsx      # Per-asset RSI gauges
    │   ├── RebalanceSimulator.jsx  # Normalized sliders + 10-year projection chart
    │   ├── LeaderboardCard.jsx     # Ranked investor list with badges
    │   ├── AIChatAssistant.jsx     # Chat UI + behavior radar (uses real user name)
    │   ├── OnboardingPage.jsx      # Welcome → Quiz → Result → refreshProfile()
    │   ├── RiskQuiz.jsx            # 4-question quiz (fixed score boundaries)
    │   ├── dashboard/              # Re-export shim
    │   ├── onboarding/             # Re-export shim
    │   └── aiChat/                 # Re-export shim
    │
    ├── pages/
    │   ├── Auth.jsx                # Login / register with Google + email
    │   ├── Portfolio.jsx           # Holdings table, allocation donut, 6M chart
    │   ├── Markets.jsx             # Market quotes, index strip, sparklines
    │   ├── Rewards.jsx             # XP, challenges, achievements, leaderboard
    │   └── Settings.jsx            # Profile, risk profile, appearance, notifications
    │
    ├── services/
    │   ├── scoringEngine.js        # Health score, behavior score, XP, levelFromXP()
    │   ├── advisoryEngine.js       # AI response generation + portfolio advisory text
    │   └── marketApi.js            # Alpha Vantage wrapper with mock fallback
    │
    ├── data/
    │   └── mockData.js             # Static portfolio, holdings, market, leaderboard data
    │
    └── styles/
        └── globals.css             # Tailwind v4 theme tokens, glass card, typography scale
```

---

## Getting Started

### Prerequisites

- Node.js ≥ 18
- A Firebase project with **Authentication** (Email/Password + Google) and **Firestore** enabled

### Installation

```bash
# 1. Unzip and enter the project
unzip finaura-fixed.zip && cd finaura

# 2. Copy the env template and fill in your Firebase values
cp .env.example .env

# 3. Install dependencies
npm install

# 4. Start the dev server
npm run dev
```

### Build for production

```bash
npm run build
npm run preview
```

---

## Environment Variables

Copy `.env.example` to `.env` and populate it:

```env
# Required — get from Firebase Console → Project Settings → Your apps
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=

# Optional — get a free key at alphavantage.co
# Leave blank to use mock market data
VITE_ALPHA_VANTAGE_KEY=
```

> **Note:** In development, if Firebase env vars are missing the app runs in demo mode with mock auth (a warning is printed to the console). In production, missing vars throw immediately so misconfiguration is never silent.

---

## Architecture

### Auth & Routing Flow

```
App start
  └─ loading? → <LoadingScreen />
  └─ no user?  → <Auth /> (lazy)
  └─ user but no riskProfile? → <OnboardingPage />
       └─ quiz complete → updateDoc(riskProfile) → refreshProfile()
          → re-renders past gate → <AppLayout />
  └─ user + profile → <AppLayout> + <Suspense> lazy pages
```

### Health Score Computation (`scoringEngine.js`)

The composite score is a weighted average of four sub-scores:

| Sub-score | Weight | What it measures |
|-----------|--------|-----------------|
| Diversification | 30% | Asset-class spread and concentration |
| Volatility | 25% | Weighted average volatility of holdings |
| Crypto Exposure | 20% | Crypto % vs. profile-appropriate maximum |
| Risk Alignment | 25% | RSI-based overbought/oversold penalty |

All inputs are validated before computation — an empty or zero-value portfolio returns `{ total: 0, ... }` without dividing by zero.

### Rebalance Simulator — Normalization

When a slider is moved, the remaining percentage is distributed proportionally across the other three asset classes, always keeping the total at exactly 100%. An allocation indicator confirms this visually.

### Risk Quiz — Score Boundaries

| Score range | Profile |
|-------------|---------|
| 4–7 | Conservative |
| 8–12 | Moderate |
| 13–16 | Aggressive |

Min possible score: 4 (all 1s). Max: 16 (all 4s).

---

## Key Design Decisions

**Re-export shims over refactoring imports**
Rather than updating every import across dozens of files, thin re-export shims were added at the paths the codebase expected (`components/ui/*`, `app/layout/AppLayout`, `features/dashboard/*`, etc.). The canonical implementations live in one place; the shims are one-liners. This keeps diffs minimal and avoids introducing new bugs.

**`React.lazy` at module level**
All lazy-loaded page components are declared once at the top of `AppRoutes.jsx` (module scope), not inside the render function. Declaring lazy components inside render would recreate them on every render, unmounting and remounting the page — causing visible flickering and lost scroll position.

**`refreshProfile()` instead of `onComplete` prop**
The previous `onboarding` gate passed `onComplete={() => {}}` as a no-op, so the app never left the onboarding screen. The fix moves the navigation trigger into `AuthContext`: after saving the risk profile to Firestore, `OnboardingPage` calls `refreshProfile()`, which re-fetches the user document and updates the `profile` state. Because `profile.riskProfile` is now set, `AppRoutes` re-renders past the gate automatically — no prop threading required.

---

## Known Limitations

- **Market data is mocked** — Alpha Vantage's free tier allows 25 requests/day; the app falls back to static `mockData.js` when the key is absent or the limit is hit.
- **No real trade execution** — "Trade" buttons are UI-only placeholders.
- **Transaction history** — The tab exists in Portfolio but is not yet implemented.
- **Behavior score** — Currently returns static demo values from `computeBehaviorScore()`. Real computation requires Firestore trade-history records.
- **SIP tracking** — Mentioned in AI responses but not yet stored or computed from real data.

---

## Roadmap

- [ ] Real trade history storage in Firestore with behavior score computation
- [ ] SIP tracking and streak detection
- [ ] Alpha Vantage caching layer (avoid rate-limit exhaustion)
- [ ] Push notifications for RSI alerts
- [ ] Social features — follow investors, compare portfolios
- [ ] Mobile app (React Native)
- [ ] Real broker/robo-advisor data integration (20k–50k account dataset)

---

## Contributing

1. Fork the repo and create a feature branch: `git checkout -b feat/your-feature`
2. Run `npm run lint` before committing
3. Open a pull request with a clear description of what changed and why

---

## License

MIT © Devanshi — FinAura
