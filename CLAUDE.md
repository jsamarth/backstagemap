# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun run dev          # Start dev server on port 8080
bun run build        # Production build
bun run lint         # Run ESLint
bun run test         # Run Vitest tests once
bun run test:watch   # Run Vitest in watch mode
```

## Architecture

**BackstageMap** is a single-page React app for discovering music events in NYC. The stack is React 18 + TypeScript + Vite, with Supabase as the backend (PostgreSQL + PostGIS), Tailwind CSS + shadcn/ui for styling, react-map-gl + MapLibre for the map, and TanStack React Query for data fetching.

### Data Flow

`Index.tsx` owns all top-level state (filters, selected event, panel visibility). It passes state down to child components and delegates data fetching to custom hooks:

- `useEvents` — queries Supabase `events` table with applied filters; some filters (neighborhood, time-of-day) are applied client-side
- `useAuth` — wraps Supabase Auth + `@lovable.dev/cloud-auth-js` for Google OAuth
- `useBookmarks` — CRUD for `bookmarks` table, keyed by authenticated user

### Key Domain Types (`src/types/index.ts`)

- **Event types:** `live_band`, `dj`, `open_mic`, `jam_session` — each has an assigned map pin color
- **Neighborhoods:** Williamsburg, Bushwick, Bed-Stuy, East Village, West Village, Chelsea, Greenpoint
- **Price types:** Free, Cover, Ticketed
- **Time-of-day buckets:** afternoon (12–18h), evening (18–23h), late_night (23h+)

### Directory Layout

```
src/
├── pages/          # Index.tsx (main UI), NotFound.tsx
├── components/     # MapView, FilterBar, EventDetailPanel, SavedEventsPanel,
│                   # AuthModal, HeaderBar, EventLegend, LogoMark, NavLink
│                   # ui/  ← shadcn/ui primitives (do not edit manually)
├── hooks/          # useEvents, useAuth, useBookmarks, use-toast, use-mobile
├── integrations/   # supabase/client.ts + types.ts, lovable/ (OAuth wrapper)
├── types/          # Domain type definitions and enums
└── lib/utils.ts    # cn() classname utility
```

### Supabase

The Supabase client is initialized in `src/integrations/supabase/client.ts` using `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. The generated types in `src/integrations/supabase/types.ts` reflect the live schema — regenerate them with the Supabase CLI when the schema changes. Migrations live in `supabase/migrations/`.

### Path Alias

`@/` maps to `src/` throughout the codebase (configured in `vite.config.ts` and `tsconfig.app.json`).

### Styling

Use Tailwind utility classes. Custom design tokens (colors, fonts, animations) are defined in `tailwind.config.ts`. Body font is Inter; display font is Space Grotesk. Use `cn()` from `lib/utils.ts` for conditional class merging.

## Project Specs

`PROJECT_SPECS/main.md` and `PROJECT_SPECS/phase1.md` contain the product vision and phased technical plan — consult these for feature scope and priorities before adding new functionality.
