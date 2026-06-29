# Smart Traffic Management System

An AI-assisted traffic-control system that watches an intersection through a camera
(and microphone), understands what it sees and hears, and adapts the traffic lights in
real time — favouring busy approaches, preempting green for emergency vehicles, and
raising accident alerts to a live dashboard.

This repository is the **TypeScript side** of the system: a Bun + Turborepo monorepo
that contains the single backend (the orchestrator), the operator dashboard, and the
shared packages they build on. The AI models live behind a thin, stateless inference
service (see [The Python boundary](#the-python-boundary)); **everything else — auth,
REST, WebSockets, the database, and the signal-timing logic — is one TypeScript/Bun
backend.**

---

## Why this design

The original brief had three problems we deliberately corrected:

1. **One backend, not two.** A split Spring Boot + Flask stack is pointless here.
   Python touches *nothing but the models*. One TypeScript/Bun backend owns all logic.
2. **A real signal algorithm.** Fixed 100/200/300-second cycles mean five minutes of
   red — no real intersection does that. We use a bounded, demand-proportional split
   with emergency preemption (see [The signal engine](#the-signal-engine)).
3. **No proprietary lock-in.** Power BI and rigid role hierarchies are scope we don't
   need to defend. Analytics is just aggregate endpoints over our own data.

### The models are classifiers, not detectors

The orchestrator never consumes a bounding box. It only ever reads a congestion
**label** and a couple of **booleans**. So object detection (YOLO) solves a harder
problem than the system actually asks. Every model is therefore a small **classifier**:

| Task        | Model               | Output                         | Training | Notes |
|-------------|---------------------|--------------------------------|----------|-------|
| Congestion  | 4-class image CNN   | `empty` / `low` / `high` / `jam` | Easy   | core of the system |
| Accident    | binary image CNN    | yes / no                       | **Hard** | the weak link — rare, imbalanced, visually diverse |
| Ambulance   | binary image CNN    | yes / no                       | Easy   | was YOLO; doesn't need to be |
| Siren       | binary audio CNN    | yes / no (spectrogram → CNN)   | Easy   | |

Downgrading "detect the ambulance" to "is there an ambulance, yes/no" deletes the entire
bounding-box annotation burden — the single most expensive part of a detection pipeline.

Four independent classifiers also means four independent datasets and training runs, so
team members work in parallel and any model can be swapped or dropped without touching
the rest. We avoid a single multi-task model on purpose: it would need images jointly
labelled for *all* tasks and couples training so one bad task drags the others.

**Emergency fusion.** The ambulance (vision) and siren (audio) signals fuse into one
`emergency` flag in the orchestrator: `emergency = vision.detected || audio.detected`.
Vision-or-audio redundancy is a stronger story than either alone — a mic-less camera
still gets vision-based detection, and a visually occluded ambulance is still caught by
its siren.

---

## Architecture

```
camera frame (+ audio) ──► Bun + Elysia API (orchestrator)
                               │  calls ML service
                               ▼
                          Python ML  /infer  ──► { traffic, accident, ambulance, siren }
                               │  returns predictions
                               ▼
                          signal-engine.ts (pure fn) ──► light plan
                               │
                     ┌─────────┼──────────┐
                     ▼         ▼          ▼
                  persist   broadcast   alert
                  (Drizzle) (WS)        (WS)
```

The orchestrator glues it together: `infer()` → build `Approach[]` →
`computeSignalPlan()` → write to the database → publish to the `traffic` /
`emergency` / `accident` WebSocket channels. The dashboard subscribes to those channels
and renders live state.

### The signal engine

A bounded, demand-proportional green split with emergency preemption. It is a **pure
function**, so it is unit-testable and the test results can go straight into the report:

- **Emergency preemption** — if any approach is flagged `emergency`, hold green for it
  and zero the rest.
- **Demand-proportional split** — weight each approach by its congestion label
  (`empty`=1 … `jam`=4), scale the cycle length between a floor and ceiling
  (`C_MIN`/`C_MAX`) by overall demand, then divide the green budget in proportion to
  weight, subject to a minimum green per approach.

### The Python boundary

Python is **training + a thin stateless inference service only**. It holds no business
logic: image/audio in, predictions out. It exposes essentially one endpoint:

```
POST /infer   (multipart: image, optional audio)
→ {
    "traffic":   { "label": "empty|low|high|jam", "confidence": number },
    "accident":  { "detected": boolean, "confidence": number },
    "ambulance": { "detected": boolean, "confidence": number },
    "siren":     { "detected": boolean, "confidence": number }
  }
```

All four models run concurrently per frame. Every *decision* happens in TypeScript.
> The inference service is a separate runtime and is not part of this monorepo; it is
> expected to live alongside it (e.g. `services/ml/`, FastAPI). A purist option is to
> export the models to ONNX and run them inside Bun via `onnxruntime-node`, making
> Python training-only — at the cost of reimplementing NMS / mel-spectrogram in TS.

---

## Tech stack — and why

This is a monorepo. Each choice is deliberate:

### Runtime & tooling
- **Bun** — a fast, lightweight, all-in-one runtime: package manager, bundler, test
  runner, and TypeScript executor in one. Native TS (no build step in dev), `--hot`
  reload, and `bun build --compile` to a single self-contained binary. Speed matters for
  a real-time frame loop.
- **Turborepo** — task orchestration and caching across the workspace, so `dev`, `build`
  and `check-types` only re-run what changed.
- **Bun workspaces + catalog** — one source of truth for shared dependency versions,
  installed with an isolated linker (`bunfig.toml`).
- **Biome** — a single, Rust-fast linter *and* formatter, replacing ESLint + Prettier.
- **TypeScript** — end-to-end type safety, with types shared between server and web
  through workspace packages.

### Backend — `apps/server` (the only backend)
- **Elysia** — a Bun-native, end-to-end type-safe web framework with first-class
  performance and **built-in WebSocket pub/sub**, so the three realtime channels are just
  topic subscriptions — no separate WS server. This single app owns auth, REST, the WS
  channels, the database, and the signal engine.
- **TypeBox** (`@sinclair/typebox`) — the schema/validation layer Elysia uses natively,
  giving runtime validation that lines up with the static types.

### Frontend — `apps/web`
- **React 19 + TanStack Router** — type-safe, file-based routing for the operator
  dashboard.
- **Vite** — fast dev server, HMR, and production builds.
- **TailwindCSS 4 + shadcn/ui** — utility-first styling with a shared component library
  (see `packages/ui`).
- **next-themes / sonner / lucide-react / react-hook-form** — theming, toast alerts,
  icons, and forms.

### Database — `packages/db`
- **Drizzle ORM** — TypeScript-first, type-safe schema and queries; the same schema runs
  against libSQL today and Postgres later without a rewrite.
- **libSQL / Turso** — SQLite-compatible. Zero-setup local development against a plain
  file (`turso dev`), with a clean path to a hosted, replicated production database — the
  SQLite ergonomics without being boxed into a single local file.

### Shared packages
- **`@ziko/env`** — typed, validated environment variables via `@t3-oss/env-core` + Zod
  (separate `server` and `web` schemas), so a missing/invalid variable fails fast at boot.
- **`@ziko/ui`** — the shared shadcn/ui + Tailwind component library (`@base-ui/react`,
  `tailwind-merge`, `cva`).
- **`@ziko/config`** — shared TypeScript / tooling configuration.

---

## Project structure

```
.
├─ apps/
│  ├─ server/                 # Bun + Elysia — the single backend / orchestrator
│  │  └─ src/index.ts         #   bootstrap, CORS, routes (REST + WS + signal engine land here)
│  └─ web/                    # React 19 + TanStack Router dashboard (Vite + Tailwind)
│     └─ src/
│        ├─ routes/           #   file-based routes
│        └─ components/       #   header, theme toggle, loader, …
├─ packages/
│  ├─ db/                     # Drizzle ORM schema + libSQL/Turso client
│  │  └─ src/{index.ts,schema/,migrations/}
│  ├─ env/                    # typed env (server.ts + web.ts)
│  ├─ ui/                     # shared shadcn/ui components, styles, hooks
│  └─ config/                 # shared tsconfig / tooling config
├─ biome.json                 # lint + format
├─ turbo.json                 # task pipeline
├─ bunfig.toml                # bun install (isolated linker)
└─ package.json               # bun workspaces + dependency catalog
```

---

## Getting started

Install dependencies:

```bash
bun install
```

### Database

Uses libSQL/Turso with Drizzle ORM.

```bash
bun run db:local   # start a local libSQL database (optional)
bun run db:push    # apply the schema
```

Set the connection details in `apps/server`'s `.env` if needed (`DATABASE_URL`,
`CORS_ORIGIN`).

### Run

```bash
bun run dev
```

- Web app: [http://localhost:5173](http://localhost:5173)
- API: [http://localhost:3000](http://localhost:3000)

---

## UI customization

React apps share shadcn/ui primitives through `packages/ui`.

- Design tokens / global styles: `packages/ui/src/styles/globals.css`
- Shared primitives: `packages/ui/src/components/*`
- shadcn aliases: `packages/ui/components.json` and `apps/web/components.json`

Add shared components from the root:

```bash
npx shadcn@latest add accordion dialog popover sheet table -c packages/ui
```

Import them:

```tsx
import { Button } from "@ziko/ui/components/button";
```

---

## Available scripts

- `bun run dev` — start all apps in development
- `bun run build` — build all apps
- `bun run dev:web` — web only
- `bun run dev:server` — server only
- `bun run check-types` — type-check across the workspace
- `bun run check` — Biome format + lint
- `bun run db:push` — push schema changes
- `bun run db:generate` — generate migrations
- `bun run db:migrate` — run migrations
- `bun run db:studio` — open Drizzle Studio
- `bun run db:local` — start the local libSQL database
