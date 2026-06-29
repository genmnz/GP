# Build TODO — Smart Traffic Management System

A phased, ordered checklist. Work top to bottom — each phase unblocks the next.
Check items off as you go. Items marked **(test)** are worth keeping for the report.

Legend: `[ ]` todo · `[~]` in progress · `[x]` done

---

## Phase 0 — Foundation & sanity check
> Goal: the scaffold runs end to end before you build anything on it.

- [ ] `bun install` completes clean from repo root
- [ ] Create `apps/server/.env` with `DATABASE_URL`, `CORS_ORIGIN`, `NODE_ENV`
- [ ] Create `apps/web/.env` with the API base URL (e.g. `VITE_SERVER_URL`)
- [ ] `bun run dev` boots both web (5173) and server (3000) with no errors
- [ ] Confirm `GET http://localhost:3000/` returns `OK`
- [ ] `bun run check` (Biome) and `bun run check-types` pass
- [ ] Decide congestion label vocabulary once and lock it: `empty | low | high | jam`

---

## Phase 1 — Shared contracts (the spine everything depends on)
> Goal: one source of truth for types/schemas shared by server, web, and the ML client.

- [ ] Create `packages/shared` workspace package (`@ziko/shared`)
- [ ] Define `TrafficLabel` = `"empty" | "low" | "high" | "jam"`
- [ ] Define `Inference` contract (traffic label + confidence; accident/ambulance/siren `{detected, confidence}`)
- [ ] Define `Approach` = `{ id, label, emergency?, accident? }`
- [ ] Define `SignalPlan` = `{ cycle, phases: {approachId, green}[], preempt? }`
- [ ] Define WS channel payload types for `traffic` / `emergency` / `accident`
- [ ] Define shared enums for event types and user roles
- [ ] Export everything from `@ziko/shared`; wire it into `server` and `web` deps

---

## Phase 2 — Database schema (Drizzle + libSQL/Turso)
> Goal: replace the empty `packages/db/src/schema/index.ts` with the real model.

- [ ] `users` (id, email, passwordHash, role, createdAt)
- [ ] `sessions` / refresh tokens (or rely on stateless JWT — decide)
- [ ] `intersections` (id, name, location, createdAt)
- [ ] `approaches` (id, intersectionId, label/name, direction)
- [ ] `cameras` (id, intersectionId, approachId, streamUrl/source, hasAudio)
- [ ] `signal_plans` (id, intersectionId, cycle, plan JSON, preemptApproachId, createdAt)
- [ ] `events` (id, intersectionId, type[accident|emergency], confidence, payload JSON, createdAt)
- [ ] `inferences` (optional raw log: intersectionId, raw JSON, createdAt) for analytics/audit
- [ ] Add indexes on `intersectionId` + `createdAt` for time-series queries
- [ ] `bun run db:generate` then `bun run db:push` against local libSQL
- [ ] Write a `seed` script (one intersection, 4 approaches, a demo user)

---

## Phase 3 — Auth (one backend owns it)
- [ ] Pick JWT lib compatible with Bun/Elysia; add to `server`
- [ ] Password hashing (Bun's built-in `Bun.password` — argon2/bcrypt)
- [ ] `POST /auth/register` (guard who can register, or seed-only)
- [ ] `POST /auth/login` → issues JWT
- [ ] `GET /auth/me` returns current user
- [ ] Auth guard / Elysia derive-middleware that injects `user` into context
- [ ] Role-based guard (e.g. `admin` vs `viewer`)
- [ ] **(test)** auth happy-path + rejection cases

---

## Phase 4 — Signal engine (the part worth getting right)
> Goal: a pure, testable function — no I/O, no DB, no framework.

- [ ] Create `apps/server/src/traffic/signal-engine.ts`
- [ ] Implement weights `{empty:1, low:2, high:3, jam:4}`
- [ ] Implement emergency preemption branch (hold green for the flagged approach)
- [ ] Implement bounded cycle length (`C_MIN`..`C_MAX`) scaled by demand
- [ ] Implement demand-proportional green split with `G_MIN` floor and lost time
- [ ] **(test)** unit tests: empty intersection, single-jam approach, all-equal, emergency preempt, min-green clamping
- [ ] **(test)** snapshot a few representative plans for the report

---

## Phase 5 — ML client + mock (decouple from Python availability)
> Goal: build the whole TS pipeline before any model exists.

- [ ] Create `apps/server/src/ingest/ml-client.ts` (`infer(frame, audio?)` → `Inference`)
- [ ] Read `ML_URL` from env (default `http://localhost:8000`)
- [ ] Build a **mock inference** mode (random/scripted predictions) behind an env flag
- [ ] Map `Inference` → `Approach[]` (the fusion: `emergency = ambulance.detected || siren.detected`)
- [ ] Error handling + timeout + retry/backoff for the `/infer` call

---

## Phase 6 — Orchestrator / ingest loop
> Goal: tie inference → engine → persistence → broadcast.

- [ ] Create `apps/server/src/ingest/worker.ts` (the frame loop)
- [ ] Frame source abstraction: static image, video file, or live stream (start with file)
- [ ] Per tick: grab frame(+audio) → `infer()` → build approaches → `computeSignalPlan()`
- [ ] Persist `signal_plans`; persist `events` when accident/emergency detected
- [ ] Publish to WS channels (`traffic`, and `emergency`/`accident` when relevant)
- [ ] Throttle/interval control + graceful start/stop per intersection

---

## Phase 7 — REST modules
> Goal: CRUD + reads the dashboard needs. One module folder each.

- [ ] `modules/intersections` — list/create/get/update/delete
- [ ] `modules/approaches` — nested under intersection
- [ ] `modules/cameras` — CRUD + bind to approach
- [ ] `modules/users` — admin management
- [ ] `modules/events` — list/filter accident & emergency history
- [ ] `modules/signals` — latest plan + history per intersection
- [ ] `modules/analytics` — aggregate endpoints (counts, averages, time-series) over `events`/`inferences`
- [ ] Validate all inputs with TypeBox; consistent error shape
- [ ] **(test)** integration tests per module against a temp DB

---

## Phase 8 — Realtime (Elysia WebSockets)
> Caveat: Elysia's WS/plugin API shifts between versions — check current docs for exact `subscribe`/`publish` calls.

- [ ] Create `apps/server/src/realtime/channels.ts` (topics: `traffic | emergency | accident`)
- [ ] WS route with auth on connect
- [ ] `publish(topic, payload)` helper used by the ingest worker
- [ ] Subscribe semantics: client picks intersection(s) to follow
- [ ] Heartbeat / reconnect handling
- [ ] **(test)** a script that connects, triggers a mock event, asserts the broadcast

---

## Phase 9 — Frontend dashboard (`apps/web`)
> React 19 + TanStack Router + Tailwind + `@ziko/ui`.

- [ ] App shell / layout: header, theme toggle (already scaffolded), nav
- [ ] Auth pages: login (+ register if allowed); store JWT; auth guard on routes
- [ ] API client (typed fetch using `@ziko/shared` types)
- [ ] WebSocket hook (`useChannel`) for `traffic`/`emergency`/`accident`
- [ ] Intersections list page
- [ ] Intersection detail: **live signal view** (per-approach green countdown, current label)
- [ ] Emergency/accident alert banner + toast (sonner) on WS events
- [ ] Events history page (table, filters by type/date)
- [ ] Analytics page (charts: congestion over time, event counts) — replaces Power BI
- [ ] Camera management UI (add/bind cameras)
- [ ] Empty/loading/error states; responsive layout

---

## Phase 10 — Python ML service (`services/ml`)
> Separate runtime, stateless: image/audio in, predictions out.

- [ ] Scaffold `services/ml` (FastAPI, `pyproject.toml`)
- [ ] `server.py`: `POST /infer` (multipart image + optional audio), runs models concurrently
- [ ] `inference/traffic.py` — 4-class image classifier load + predict
- [ ] `inference/accident.py` — binary image classifier
- [ ] `inference/ambulance.py` — binary image classifier (was YOLO; now yes/no)
- [ ] `inference/siren.py` — binary audio classifier (spectrogram → CNN)
- [ ] `common.py` — shared preprocessing (resize/normalize, mel-spectrogram)
- [ ] Make `/infer` response match the `Inference` contract exactly
- [ ] Health endpoint + model-loaded check
- [ ] Swap the TS mock off; point `ML_URL` at the real service

---

## Phase 11 — Model training (the academic core)
> One independent script per model — parallelizable across the team.

- [ ] Pick + document one dataset per task; record labeling definitions (esp. high vs jam)
- [ ] `training/traffic.py` — congestion 4-class CNN (input size, layers, augmentation)
- [ ] `training/accident.py` — binary; **handle class imbalance**, document limitations honestly
- [ ] `training/ambulance.py` — binary image classifier
- [ ] `training/siren.py` — binary audio classifier
- [ ] Export weights to a consistent format the inference modules load (`models/`, gitignored)
- [ ] **(test)** per-model eval metrics (accuracy / precision / recall / confusion matrix) for the report
- [ ] Note false-positive behaviour of the accident model explicitly

---

## Phase 12 — Integration & data flow
- [ ] End-to-end smoke: video file → ML → engine → DB → WS → dashboard updates live
- [ ] Multi-intersection support verified (channels keyed by intersection)
- [ ] Emergency preemption visibly overrides the normal plan in the UI
- [ ] Accident event raises an alert and lands in history
- [ ] Analytics reflect accumulated events

---

## Phase 13 — Quality, tooling, CI
- [ ] `bun run check` + `check-types` clean across the workspace
- [ ] Unit tests (signal engine), integration tests (modules), one e2e path
- [ ] GitHub Actions: install, lint, type-check, test on PR
- [ ] Seed/demo script documented for examiners to run
- [ ] Update `README.md` if structure drifts (keep it honest)

---

## Phase 14 — Deployment / demo
- [ ] `docker-compose.yml`: db (libSQL/Turso) + ml (FastAPI) + api (Bun)
- [ ] `bun build --compile` the server to a single binary (optional)
- [ ] Production env vars + secrets documented
- [ ] Build + serve the web app
- [ ] A repeatable demo script/recording for the defense

---

## Phase 15 — Report deliverables (don't leave to the end)
- [ ] Architecture diagram (use the one in the README as a base)
- [ ] Signal-engine test table → straight into the report
- [ ] Per-model metrics + honest limitations (accident = the weak link)
- [ ] Justify "classifiers not detectors" and the emergency-fusion decision
- [ ] Justify the single-backend / Python-for-AI-only boundary

---

### Optional / stretch
- [ ] ONNX export + `onnxruntime-node` to run inference inside Bun (zero Python at runtime)
- [ ] Postgres swap via the same Drizzle schema for a "production" story
- [ ] Stopped-vehicle / anomaly framing as a more tractable accident proxy
- [ ] Drop to 3 models (siren-only emergency) if time runs short
