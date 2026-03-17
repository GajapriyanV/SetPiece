# SetPiece — Project Bible

## What We're Building

A live football debate platform. Two speakers argue a football topic head to head via voice. A live audience listens and votes on who made the better argument. Debaters earn an Elo rating based on their results.

**Core loop:** topic posted → two speakers join → argue live via voice → timed rounds → audience votes → winner's rating goes up, loser's goes down → rankings update publicly.

**Key features:**
- Live voice rooms: two speakers, unlimited listeners (LiveKit)
- Timed debate rounds: opening statement, rebuttal, closing argument — enforced by server-side countdown
- Audience voting after debate with hidden tallies until close
- Elo rating system — record is public and permanent
- Global and weekly leaderboards
- Live audience chat

---

## Tech Stack

- **Framework:** Next.js 16 (App Router, TypeScript)
- **Styling:** Tailwind CSS v4 — configured via `@theme inline` in `globals.css`, no `tailwind.config.ts`
- **UI components:** shadcn/ui only where it genuinely helps (forms, modals, dropdowns) — not for everything
- **Fonts:** via `next/font/google` — Oswald, Roboto_Mono, Familjen_Grotesk. Big Shoulders Display loaded via `@import url()` in globals.css (not next/font — it's not in their font list)
- **Auth:** Supabase Auth (email/password, OAuth: Google/Twitter/Discord) via `@supabase/ssr`
- **Backend:** Node.js + Express + Socket.IO server in `server/` subdirectory
- **Real-time state:** Upstash Redis (rooms, phases, votes, chat — all ephemeral)
- **Database:** Supabase PostgreSQL (debates, votes, profiles, Elo ratings — persistent)
- **Real-time:** LiveKit for voice (not yet integrated), Socket.IO for events
- **JWT:** Supabase access tokens use ES256 — verified via JWKS endpoint, NOT the JWT secret

---

## Design System

### Colours (CSS custom properties in `:root`)

```css
--g: #00ff87          /* primary accent green */
--g2: #00e077         /* green hover state */
--g3: rgba(0,255,135,0.13) /* green tint */
--dark: #060608       /* page background */
--dark2: #0c0c10      /* surface / section backgrounds */
--dark3: #111116      /* slightly lighter surface */
--card: #0f0f14       /* card backgrounds */
--border: #1a1a22     /* borders */
--border2: #222230    /* slightly lighter borders */
--text: #ececec       /* primary text */
--dim: #555566        /* muted / secondary text */
--red: #ff2d55        /* danger / negative — use sparingly */
```

**Rule:** Never use red as a hover or accent colour on non-error UI. Green is the only accent. Red is strictly for errors or negative states.

### Typography

```css
--font-display: 'Big Shoulders Display', sans-serif  /* display headings, large numbers */
--font-oswald: Oswald                                 /* section headings, nav */
--font-mono: Roboto Mono                              /* labels, stats, tags, timestamps */
--font-body: Familjen Grotesk                         /* body text, descriptions */
```

**Usage rules:**
- Big Shoulders Display → hero headlines, CTA headings, section titles (weight 900), large watermark text
- Oswald → nav logo, sub-headings, stat numbers (weight 600–700)
- Roboto Mono → all labels, eyebrows, metadata, tags, timestamps, letter-spacing 2–3px, uppercase
- Familjen Grotesk → descriptions, body copy, card text

### Feel & Atmosphere

Bold, premium sports product. Not generic SaaS. Think stadium — high energy, high stakes, dark and electric. Headlines should be massive and uppercase. Green is used purposefully (live states, CTAs, accents) — not everywhere.

---

## Styling Rules

1. **All styling is via inline `style={{}}` props**, not Tailwind utility classes. Tailwind is used only for layout helpers if needed. This is intentional — CSS variables don't map cleanly to Tailwind v4 utilities.

2. **No Tailwind colour utilities** (`text-green-400`, `bg-gray-900` etc.) — use `var(--g)`, `var(--dark)` etc. directly.

3. **`clamp()` for responsive font sizes** — e.g. `fontSize: "clamp(72px, 10vw, 148px)"`. Never hardcode a single large pixel value for headings.

4. **`letterSpacing: "-2px"` on large headlines** — tighten tracking on anything above 40px.

5. **`lineHeight: 0.88–0.92` on display headings** — tight line height for Big Shoulders Display headlines.

6. **Borders are `1px solid var(--border)`** — grid gaps are done via `gap: "1px"` + `background: "var(--border)"` on the grid container, not individual cell borders.

7. **Hover effects via `onMouseEnter`/`onMouseLeave`** — mutate `e.currentTarget.style` directly. No CSS `:hover` in inline styles.

8. **Scroll reveal:** `.rv` class starts `opacity: 0; transform: translateY(24px)`. Adding `.on` class reveals it. Use `IntersectionObserver` in `useEffect` per section.

9. **Entrance animations for hero:** CSS classes `.hero-meta`, `.hero-line-1`, `.hero-line-2`, `.hero-line-3`, `.hero-bottom-anim` — each uses `animation: fu 0.7s ease forwards` with staggered delays (0.1s → 0.8s). Defined in `globals.css`.

---

## Component Architecture

### Client vs Server

Mark `"use client"` only when the component uses hooks, browser APIs, or event handlers. If a component has `onMouseEnter`/`onMouseLeave` it **must** be a client component.

| Component type | Directive |
|---|---|
| Interactive (useState, useEffect, event handlers) | `"use client"` |
| Animated (IntersectionObserver, intervals) | `"use client"` |
| Static content only | server (no directive) |

### File Structure

```
app/
  layout.tsx            ← root layout: fonts, metadata, TopNav, HeroCursor
  page.tsx              ← home (assembles sections)
  globals.css           ← tokens, keyframes, utility classes
  rooms/
    page.tsx            ← room listing (fetches from /api/rooms, 7s polling)
    [id]/page.tsx       ← individual room (useRoom hook, status-based view switching)
  register/page.tsx     ← registration page
  reset-password/page.tsx ← password reset landing page

components/
  layout/
    TopNav.tsx          ← fixed nav, blur backdrop, auth-aware (sign in/out)
  auth/
    SignInModal.tsx      ← email/password + OAuth + forgot password flow
    RegisterModal.tsx    ← email/password + OAuth registration
  landing/
    HeroCursor.tsx      ← green dot + lagging ring cursor
    HeroSection.tsx     ← hero + stats strip + debate ticker
    DebateTicker.tsx     ← standalone ticker (unused — ticker in HeroSection)
    LiveDebatesGrid.tsx
    FourRoundsOneWinner.tsx
    LeaderboardPreview.tsx
    CtaStrip.tsx
    LandingFooter.tsx
  room/
    RoomTopBar.tsx      ← status bar, member count, leave button
    ChatPanel.tsx       ← live chat sidebar with scrollable messages
    LobbyView.tsx       ← topic display, side-pick buttons, ready up
    LiveView.tsx        ← debate UI: timer, phase bar, debater cards, waveform
    VotingView.tsx      ← vote buttons, live tally bar, countdown
    ResultsView.tsx     ← winner, Elo changes, final vote bar
    CreateRoomModal.tsx ← room creation form

hooks/
  useSocket.ts          ← socket singleton lifecycle (persists across navigations)
  useRoom.ts            ← room state reducer + all Socket.IO event listeners
  useServerTimer.ts     ← countdown from server endsAt timestamp

lib/
  socket.ts             ← Socket.IO client singleton with auth token

types/
  socket.ts             ← frontend type definitions mirroring server types

utils/
  supabase/
    client.ts           ← browser Supabase client (singleton)
    server.ts           ← server-side Supabase client

proxy.ts                ← Next.js 16 proxy (replaces middleware.ts) — session refresh + route guards

server/                 ← Backend (separate Node.js process)
  src/
    index.ts            ← Express + Socket.IO bootstrap, /health, /api/rooms
    config/env.ts       ← env var validation
    auth/
      verifyToken.ts    ← JWT verification via Supabase JWKS (ES256)
      socketAuth.ts     ← Socket.IO auth middleware
    lib/
      supabase.ts       ← admin Supabase client (service_role key)
      redis.ts          ← Upstash Redis client
    types/
      room.ts           ← Side, RoomStatus, PhaseName, RoomMember, etc.
      events.ts         ← ClientToServerEvents, ServerToClientEvents
      debate.ts         ← Debate, Vote interfaces
    state/
      roomStore.ts      ← Redis CRUD for rooms, members, phases, chat
      voteStore.ts      ← Redis vote tracking with count management
    rooms/
      roomManager.ts    ← createRoom, joinRoom, leaveRoom, getFullRoomState
      sidePicker.ts     ← pickSide, unpickSide, setReady, broadcastSides
    debate/
      phaseEngine.ts    ← 6 debate phases with durations
      timerService.ts   ← server-owned timers (setTimeout chains)
      debateHandler.ts  ← debate countdown, side-pick timeout
      topics.ts         ← 15 football debate topics
    chat/chatHandler.ts ← 280 char limit, 1 msg/sec rate limit
    voting/
      voteHandler.ts    ← vote casting, debater exclusion
      voteTally.ts      ← tally + Elo update + Supabase persistence
    elo/eloCalculator.ts ← K=32 Elo formula
    handlers/registerHandlers.ts ← master event wiring + disconnect grace timers
    utils/
      logger.ts         ← Pino logger
      errors.ts         ← AppError class, emitError helper
```

---

## Key Patterns

### Section structure

Every section follows this pattern:
```tsx
<section style={{ background: "var(--dark2)", borderBottom: "1px solid var(--border)", padding: "100px 44px" }}>
  <div ref={ref} style={{ maxWidth: "1400px", margin: "0 auto" }}>
    <div className="rv">...</div>
  </div>
</section>
```

Alternate section backgrounds: `var(--dark)` and `var(--dark2)` to create visual separation.

### Section eyebrow label

```tsx
<div className="sec-label">The Format</div>
```

`.sec-label` in globals.css: Roboto Mono, 11px, uppercase, `--g` green, with a `::before` 20px green line.

### Step / process number

```tsx
<div className="p-num">01</div>
```

`.p-num` in globals.css: Roboto Mono, 10px, green, with a `::after` extending line.

### Corner accent on cards

```tsx
<div className="corner-accent">...</div>
```

`.corner-accent` in globals.css: CSS `::after` triangle top-right corner, turns green on hover.

### Feature card hover underline

```tsx
<div className="feature-card">...</div>
```

`.feature-card::before` in globals.css: 1px green line at bottom, `scaleX(0→1)` on hover.

### Live dot blink

```tsx
<div className="live-dot" style={{ width: "5px", height: "5px", background: "var(--g)", borderRadius: "50%" }} />
```

### Waveform bars

Animated using `@keyframes wv` (scaleY 0.3→1), staggered `animationDelay` per bar.

### Vote bar

```tsx
<div style={{ height: "3px", background: "var(--border2)", borderRadius: "3px", overflow: "hidden" }}>
  <div style={{ height: "100%", background: "linear-gradient(90deg, #3b82f6, #fb923c)", width: `${pct}%`, transition: "width 1s ease" }} />
</div>
```

Blue (#3b82f6) for Side A, Orange (#fb923c) for Side B — consistent across all vote bars.

### Debate card status colours

- LIVE: `var(--red)` dot + red left border
- UPCOMING: `var(--g)` dot + green left border
- Status dot blink: `.status-dot-live` class

### Grid layouts

- Debate cards: `repeat(3, 1fr)` grid, `gap: 1px`, `background: var(--border)` on container
- Stats strip: `gridTemplateColumns: "1fr 1.4fr 1fr 1fr 1.2fr"`
- Two-column sections: `1fr 1fr` or `1fr 1.4fr`

---

## Backend Architecture

### Debate State Machine

`LOBBY → SIDE_PICK → LIVE (6 phases) → VOTING → RESULTS → CLOSED`

- **LOBBY:** Room created, users join (max 6), topic displayed, side-pick buttons visible
- **SIDE_PICK:** One or both sides picked, debaters ready up. 60s timeout — if deadlock, topic rotates back to LOBBY
- **LIVE:** 6 phases: opening_a (150s), opening_b (150s), rebuttal_a (60s), rebuttal_b (60s), closing_a (30s), closing_b (30s). Server owns timers, broadcasts `endsAt` timestamps
- **VOTING:** 30s window, audience only (debaters excluded), hidden tallies until close
- **RESULTS:** Winner + Elo changes displayed, persisted to Supabase

### Key Backend Decisions

- **Server-owned timers:** Server broadcasts `endsAt` timestamps, clients compute `endsAt - Date.now()` with 250ms tick. No drift.
- **Upstash Redis quirk:** Auto-deserializes JSON — always check `typeof` before `JSON.parse` in roomStore
- **Supabase JWT (ES256):** Access tokens are verified via JWKS endpoint (`/auth/v1/.well-known/jwks.json`), NOT the JWT secret. The JWT secret is HS256 and only for anon/service keys.
- **Socket singleton:** Socket persists across page navigations. `useSocket` does NOT disconnect on unmount.
- **Room creation flow:** `room:create` only creates the room (no auto-join). The room page's `useRoom` hook handles joining.
- **Grace periods:** 60s for debaters during live debate, 5min for spectators. Reconnecting within grace cancels removal.

### Supabase Tables Required

- `profiles` — id, username, elo (default 1200), wins, losses, draws, debates_count, updated_at
- `debates` — id, topic, side_a_label, side_b_label, debater_a_id, debater_b_id, winner_id, result, votes_a, votes_b, elo_change, status, started_at, finished_at
- `votes` — id, debate_id, user_id, side

### Environment Variables

**Frontend (`.env.local`):**
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SOCKET_URL` (default `http://localhost:3001`)

**Backend (`server/.env`):**
- `PORT`, `CORS_ORIGIN`
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`

---

## Protected Routes

- `/rooms` and `/profile` require authentication (enforced by `proxy.ts`)
- Unauthenticated users are redirected to `/` with `?redirect=` param
- "Enter the Pitch" buttons on landing page check auth state and show SignInModal if not signed in

---

## Globals.css — Critical Rules

1. `@import url("https://fonts.googleapis.com/...")` **must be line 1** — before `@import "tailwindcss"`. CSS parse error otherwise.
2. `@import "tailwindcss"` must come second.
3. `@theme inline {}` block maps next/font CSS variables.
4. All keyframes: `blink`, `tick`, `fu`, `wv`, `phase-fill`.

---

## What NOT To Do

- Don't use `next/font/google` for Big Shoulders Display — it's not in their list. Use `@import url()` in CSS.
- Don't put `onMouseEnter`/`onMouseLeave` in server components — add `"use client"`.
- Don't use red (`--red`) for hover states or interactive accents — only for errors/live indicators.
- Don't use Tailwind colour utilities — always use CSS variables.
- Don't hardcode font-family strings — always use `var(--font-display)`, `var(--font-oswald)` etc. with a fallback.
- Don't put the debate ticker below the hero fold — it should render inside `HeroSection` so it's visible on load.
- Don't make CTAs full-width banners — use a centred card with `maxWidth: 1100px`.
- Don't auto-join rooms on `room:create` — let the room page handle joining via `useRoom`.
- Don't disconnect the socket singleton on component unmount — it persists across navigations.
- Don't use `JSON.parse` on Upstash Redis results without checking `typeof` first — Upstash auto-deserializes.

---

## Current Status

### Completed
- Landing page with all sections (hero, stats, debates grid, format, leaderboard preview, CTA, footer)
- Supabase auth integration (register, sign in, forgot password, OAuth, route protection)
- Full backend server (Socket.IO + Redis + Supabase persistence)
- Frontend ↔ backend wiring (socket hooks, room state management, all room sub-components)
- Room creation, listing, joining, side picking, chat — all working end to end

### Not Yet Tested (needs two accounts)
- Full debate flow (both sides ready → timer → phase changes → voting → results)
- Elo rating updates after debate

### Not Yet Built
- LiveKit voice integration (placeholder waveform bars exist)
- Profile page (`/profile`)
- Leaderboard page (`/rankings`) — currently mock data
- Debate history / past debates view
