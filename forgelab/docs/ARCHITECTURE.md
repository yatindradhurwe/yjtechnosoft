# ForgeLab — Architecture (v0.1, Phase 1 focus)

ForgeLab is a browser-based engineering studio: **describe → design → code → simulate → report**.
This document covers the system shape, the key technical choices (including where we
deviate from the initially suggested stack), the folder layout, and the Phase 1 build plan.

---

## 1. Guiding principles

1. **The LLM proposes, the engine verifies.** The AI never produces numbers that end up in a
   report. It picks parts and layouts as structured JSON; a deterministic engine computes mass,
   CG, thrust-to-weight, flight time and cost. If the AI and the engine disagree, the engine wins
   and the AI is shown the computed result so it can revise.
2. **One source of truth for engineering math.** The same TypeScript engine runs the live totals
   in the editor, the flight simulation and the final report. No duplicated formulas.
3. **Parts are data, with provenance.** Every spec field can be marked `measured`, `datasheet`
   or `estimated`, with a source URL. The UI shows estimated values with a badge.
4. **Local-first MVP.** Phase 1 runs entirely in the browser (projects saved to IndexedDB) so it
   is usable before the backend exists. The backend adds accounts, cloud saves and the AI proxy.
5. **Beginner path by default, expert depth on demand.** Every screen has a guided mode
   (step-by-step checklist, plain-language explanations) and an advanced panel (raw specs,
   PID gains, sim parameters, JSON).

---

## 2. System overview

```
┌──────────────────────────── Browser (apps/web) ─────────────────────────────┐
│                                                                             │
│  AI Chat ─┐   Parts Library   3D Workspace (R3F)   Code (Monaco)   Report   │
│           │         │                │                   │            │      │
│           ▼         ▼                ▼                   ▼            ▼      │
│     ┌─────────────────────── Design store (Zustand) ───────────────────┐    │
│     │  Design JSON: parts[], placements, wiring[], code, sim settings  │    │
│     └───────────────┬───────────────────────────────┬──────────────────┘    │
│                     ▼                               ▼                       │
│        packages/engine (pure TS)          Sim Web Worker (engine/sim)       │
│        mass · CG · power · TWR ·          6-DOF quad dynamics, motor &      │
│        flight time · cost · checks        battery models, PID, 500 Hz       │
│                                                                             │
│        IndexedDB (local projects)                                           │
└───────────────┬─────────────────────────────────────────────────────────────┘
                │ HTTPS / JSON (OpenAPI-typed client)
┌───────────────▼───────────────────── apps/api ──────────────────────────────┐
│  Auth · Projects CRUD · Parts search · AI orchestration (LLM + tools)       │
│  AI tools: search_parts, get_part, propose_design, evaluate_design          │
└───────┬───────────────────────┬────────────────────────────┬────────────────┘
        ▼                       ▼                            ▼
   PostgreSQL              LLM provider                (Phase 2+) Sim job queue
   users, projects,        (Claude API, tool use,      → containers running
   parts (JSONB specs)     structured output)          MuJoCo / Gazebo (Python)
```

### Data flow for the Phase 1 happy path

1. User types *"a quadcopter that carries 2 kg for 25 minutes"*.
2. API sends the prompt to the LLM with tools. The LLM calls `search_parts` (motors, props,
   batteries, frames…) and returns a `DesignProposal` JSON: requirements, part IDs + quantities,
   rough layout hints, and rationale text.
3. API validates every part ID against the library, then calls `evaluate_design`
   (the engine) and feeds the numbers back to the LLM for one revision round if checks fail
   (e.g. TWR < 2).
4. Browser loads the design into the store → 3D workspace auto-places parts on the frame →
   live totals update.
5. User tweaks parts/placement → engine recomputes instantly.
6. User runs the flight sim (hover, step response, payload test, endurance run) in a Web Worker.
7. Report: requirements vs. achieved, TWR, flight time, hover throttle, CG offset, BOM with cost
   range, warnings → export PDF + CSV.

---

## 3. Technology choices

| Area | Choice | Notes / why |
|---|---|---|
| Monorepo | **pnpm workspaces** + Turborepo | Shared types and the engine used by web + API. |
| Frontend | **React 18 + TypeScript + Vite** | SPA; the app is client-heavy, SSR (Next.js) buys little. |
| Styling | **Tailwind CSS** + Radix primitives (shadcn/ui style) | Accessible components, dark mode via `class` strategy. |
| State | **Zustand** (+ `zundo` for undo/redo) | Simple, fast, works well with R3F. |
| 3D | **React Three Fiber + drei** | Phase 1 parts render as parametric primitives (boxes, cylinders, arms) sized from part dimensions; real GLB models later. |
| Code editor | **Monaco** (`@monaco-editor/react`) | Phase 2 for code generation; Phase 1 ships the editor shell + flight-controller config templates. |
| Charts | **uPlot** for sim time-series, Recharts for small summary charts | uPlot handles 10k+ points at 60 fps. |
| Engine & sim | **Custom TS 6-DOF flight model in a Web Worker** | *Deviation:* Rapier/Cannon are collision engines; they don't model propellers, motors or batteries. A drone sim needs a thrust/torque model, motor lag, battery sag, drag and a controller — ~500 lines of well-tested TS. Rapier (WASM) is added in Phase 2 for rovers/terrain contact. MuJoCo stays the backend plan. |
| Validation | **Zod** schemas (TS) → JSON Schema export | Parts JSON, design JSON and AI output are all validated by the same schemas. |
| Backend | **FastAPI (Python)** *or* **Fastify (TypeScript)** — *decision pending* | See §6. |
| Database | **PostgreSQL 16**; parts stored with typed columns + `specs JSONB`; `pg_trgm` for search | Parts JSON files in git are the source of truth; a seed script loads them. |
| AI | **Claude API** with tool use + structured JSON output | A fast model for chat/explanations, the strongest model for full design proposals. Key stays server-side. |
| Auth | Managed provider or self-hosted JWT — *decision pending* | See §6. |
| Testing | Vitest (engine, ~100% of formulas), Playwright (UI smoke), pytest if FastAPI | Engine tests compare against hand-calculated reference cases. |
| Deploy | Docker Compose for dev (Postgres + API); web as static build | Sim containers arrive in Phase 2+. |

---

## 4. Core data models (abridged)

```ts
// packages/schema
type Provenance = 'datasheet' | 'measured' | 'estimated';

interface Spec<T> { value: T; unit?: string; provenance: Provenance; source?: string }

interface Part {
  id: string;                    // "motor.tmotor.mn3110-470kv"
  category: PartCategory;        // 'motor' | 'esc' | 'propeller' | 'battery' | 'frame' | 'flight_controller' | ...
  name: string; manufacturer: string;
  description: string;
  image?: string;
  massG: Spec<number>;
  dimensionsMm: Spec<{ x: number; y: number; z: number }>;
  priceUsd: { min: number; max: number; provenance: Provenance; asOf: string };
  electrical?: { voltageV?: Spec<{min:number;max:number}>; currentA?: Spec<{typ:number;max:number}> };
  pinout?: Pin[];
  specs: Record<string, Spec<unknown>>;   // category-specific, validated per category
  compatibleWith?: string[];     // part IDs or rules ("prop.diameterIn<=11")
  usedIn: MachineType[];         // 'quadcopter' | 'rover' | 'cubesat' | ...
}

interface Design {
  id: string; name: string; machineType: 'quadcopter';   // Phase 1
  requirements: { payloadKg?: number; flightTimeMin?: number; budgetUsd?: number; notes?: string };
  items: { instanceId: string; partId: string; position: [number,number,number]; rotation: [number,number,number]; mount?: string }[];
  wiring: Wire[];                // Phase 2
  sim: { controller: PidGains; scenario: ScenarioId };
  code?: { language: 'arduino' | 'micropython' | 'python' | 'ros2'; source: string };
  version: number;
}
```

Motor performance (thrust and current vs. throttle, per prop + voltage) is stored as **lookup
tables** from manufacturer test data where available, with a fitted fallback
(`T = kT·ω²`, `P = kP·ω³`) marked `estimated`.

---

## 5. Folder structure

```
forgelab/
├── apps/
│   ├── web/                          # React + Vite SPA
│   │   ├── src/
│   │   │   ├── app/                  # routing, layout shell, theme (dark mode)
│   │   │   ├── features/
│   │   │   │   ├── assistant/        # AI chat, proposal review & "apply to design"
│   │   │   │   ├── library/          # part cards, search, filters, compare
│   │   │   │   ├── workspace/        # R3F scene, gizmos, part meshes, totals panel
│   │   │   │   ├── simulation/       # sim controls, 3D playback, uPlot charts
│   │   │   │   ├── code/             # Monaco editor + templates (Phase 2 grows here)
│   │   │   │   ├── wiring/           # Phase 2
│   │   │   │   └── report/           # report view, PDF/CSV export
│   │   │   ├── stores/               # Zustand design/project/ui stores
│   │   │   ├── workers/              # sim.worker.ts (wraps packages/engine/sim)
│   │   │   ├── lib/                  # api client, IndexedDB persistence, utils
│   │   │   └── components/ui/        # buttons, dialogs, badges, etc.
│   │   └── e2e/                      # Playwright tests
│   └── api/                          # Backend (FastAPI or Fastify — see §6)
│       ├── src/
│       │   ├── routes/               # auth, projects, parts, ai
│       │   ├── ai/                   # prompts, tool definitions, orchestration loop
│       │   ├── db/                   # schema, migrations, seed (loads packages/parts)
│       │   └── services/
│       └── tests/
├── packages/
│   ├── schema/                       # Zod schemas + TS types (Part, Design, Report, AI I/O)
│   ├── parts/                        # Component library as JSON (source of truth)
│   │   ├── data/
│   │   │   ├── microcontrollers/*.json
│   │   │   ├── flight-controllers/*.json
│   │   │   ├── motors/*.json   esc/*.json   propellers/*.json
│   │   │   ├── batteries/*.json   power/*.json
│   │   │   ├── sensors/*.json   comms/*.json
│   │   │   ├── frames/*.json   sbc/*.json   space/*.json
│   │   ├── images/
│   │   └── scripts/validate.ts       # schema + unit + duplicate checks (runs in CI)
│   └── engine/                       # Pure TS, no DOM — runs in browser, worker, and Node
│       ├── src/
│       │   ├── budgets/              # mass, CG, inertia, power, cost
│       │   ├── propulsion/           # motor/prop tables, interpolation, hover point
│       │   ├── checks/               # TWR, flight time, CG offset, current limits, warnings
│       │   ├── sim/                  # 6-DOF rigid body, motor lag, battery, PID, scenarios
│       │   └── report/               # builds the Report object from design + sim results
│       └── test/                     # Vitest reference cases
├── services/
│   └── sim-runner/                   # Phase 2+: Python container (MuJoCo/Gazebo jobs)
├── infra/
│   └── docker-compose.yml            # Postgres (+ API) for local dev
├── docs/
│   ├── ARCHITECTURE.md               # this file
│   └── PARTS_DATA_GUIDE.md           # how to add/verify parts, provenance rules
├── package.json  pnpm-workspace.yaml  turbo.json  tsconfig.base.json
└── README.md
```

---

## 6. Open decisions (need sign-off before step 2)

| # | Decision | Options | Recommendation |
|---|---|---|---|
| D1 | **Where ForgeLab lives** | (a) its own new repository, (b) `forgelab/` folder in this `yjtechnosoft` repo | **(a)** — it's an unrelated product with its own stack and release cycle. (b) works for now and can be split out later with `git subtree split`. |
| D2 | **Backend language** | (a) FastAPI (Python), (b) Fastify/Node (TypeScript) | **(b) TypeScript API** for Phase 1–2: the engine, schemas and AI tool code are shared with the frontend with zero duplication, and the existing team works in Node. Python joins as `services/sim-runner` when MuJoCo/Gazebo/orbit work starts. Choose (a) if the team is stronger in Python. |
| D3 | **Auth** | (a) Managed (Clerk / Supabase Auth / Auth0), (b) self-hosted email + password + OAuth with JWT | **(a)** for speed and security; only matters at step 8, can wait. |
| D4 | **LLM provider** | Claude API (default), or a provider-agnostic adapter | Claude with a thin adapter interface; needs an API key at step 9. |
| D5 | **License / open source?** | Proprietary vs. open core | Affects whether the parts library can be community-contributed; can wait. |

---

## 7. Phase 1 build plan (drones only)

| Step | Deliverable | You can test |
|---|---|---|
| 1 | Architecture + folder structure (this doc) | — |
| 2 | Monorepo scaffold, web shell, routing, dark mode, design store, IndexedDB save | App runs, theme toggle, create/save/reopen a project |
| 3 | Parts schema + validator + **30+ real parts** (drone-focused, plus MCUs, SBCs, sensors and a few space parts), estimated values flagged | `pnpm parts:validate`; inspect JSON |
| 4 | Engine: mass, CG, power, propulsion lookup, TWR, flight time, cost, checks — with unit tests | `pnpm test` against reference quads |
| 5 | Component Library UI: cards, search, filters, compare (up to 4), add to design | Browse, filter, compare motors |
| 6 | 3D Workspace: frame + auto-placement, move/rotate gizmos, snapping to mounts, live totals panel | Build a quad, watch CG and TWR change |
| 7 | Flight simulation: worker sim, hover/step/payload/endurance scenarios, 3D playback, plots | Run hover with 2 kg payload, see battery sag and flight time |
| 8 | API + Postgres + auth + cloud project save | Sign in, projects sync |
| 9 | AI Design Assistant: idea → requirements → parts → layout → engine check → revise | Prompt the 2 kg / 25 min quad, apply proposal |
| 10 | Report: summary, checks, BOM, charts → PDF + CSV | Export and open the report |

Phase 2 (rovers, wiring view, code generation), Phase 3 (rockets, satellites) and Phase 4
(collaboration, CAD/STL export, HIL, marketplace) build on the same schema/engine split:
each new machine type adds a `packages/engine/<domain>` module, part categories and a sim scenario set.

---

## 8. Known risks

- **Part data accuracy.** Manufacturer thrust tables vary by test setup; prices drift. Mitigation:
  provenance per field, `asOf` dates on prices, a validator in CI, and a "report a spec" button.
- **Sim fidelity vs. user trust.** A simple model can mislead. Mitigation: the report states model
  assumptions and confidence; conservative defaults (80% usable battery capacity, 10–15% margin on
  hover current).
- **LLM hallucinated parts or numbers.** Mitigation: the AI can only reference part IDs that exist
  (validated server-side), and all metrics come from the engine (principle 1).
- **3D performance on low-end laptops.** Mitigation: primitive meshes in Phase 1, instancing,
  on-demand rendering (`frameloop="demand"`).
