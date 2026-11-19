@AGENTS.md

# Alinor

Opinionated daily planner for students who also work: fixed schedule -> effective free slots -> derived Eisenhower quadrants -> auto-allocation -> task-bound Pomodoro. See README.md for the full idea and a worked day.

Work plan: `TASKS.md` (phases and checklist). Visual spec: `DESIGN.md` (exists; all UI must follow it).

## Commands

```bash
pnpm install
pnpm test:run   # vitest: unit + property-based (fast-check)
pnpm lint
pnpm typecheck  # next typegen && tsc --noEmit
pnpm dev
```

Run `pnpm test:run` and `pnpm lint` before saying a change is done, plus `pnpm build` for anything touching the UI. Report the real output, never claim success without it. If a command cannot run, say so.

## Architecture

- `src/core/` is the planning engine: pure TypeScript, no I/O. It is finished and heavily tested. Do not change its behavior without a failing test first.
- `src/repository/` is the persistence layer: a `KeyValueStore` (localStorage or in-memory), versioned envelopes with migrations, zod schemas, and `createStorageRepository`. Planning data lives under `alinor:data`, the Pomodoro session log under `alinor:sessions`. Data that fails to parse, migrate or validate is copied to `alinor:backup:*` and reported as `{ status: "invalid" }`; the original is never overwritten. Saving invalid data throws `InvalidDataError`.
- `src/store/` is a Zustand vanilla store (`createAlinorStore`, with `repository`, `clock` and `newId` injected) plus derived selectors in `selectors.ts`. `hydration` is `idle`, `loading`, `ready` or `needs-attention`. Unreadable planning data or a storage failure on load puts the store in `needs-attention`, where every data-changing action throws `StoreNotReadyError`. An unreadable session log keeps the store `ready` but marks sessions `unavailable` and refuses to record new ones. Stored data is replaced only through an explicit `resolveStorageIssue("reset")`, and the backup stays.
- `src/app/` is the Next.js 16.4.5 UI (App Router). `page.tsx` is still the create-next-app template.
- Planned next: UI on top of `src/store/` (nothing in `src/app/` uses it yet): matrix, free-slot day view, Pomodoro timer, then PWA/push/calendar import.

## Engine rules (enforced by ESLint on `src/core/`)

- No imports from React, Next, Zustand, `@/store/*` or `@/components/*`.
- No `Date.now()`, `new Date()` or `Math.random()`. Time is always injected as `now`. Same input, same output.
- Dates are `"YYYY-MM-DD"`, times `"HH:mm"`, strings throughout.

## Product rules to preserve

- Quadrants are derived, never typed: urgency comes from the deadline, the user only marks importance. Drag-and-drop sets `urgencyOverride`, it does not fight the deadline.
- Q1 is capped per day, Q2 has a protected quota. Q1 overflow and deadline shortfall must surface as warnings, never be crammed in.
- Unsupported cases (events crossing midnight, `MODIFIED` exceptions) fail loudly. Keep it that way.
- Auto-fill covers today only; later days go through the feasibility check.

## Conventions

- Strict TypeScript. Tests sit next to the source as `*.test.ts`; use hand-computed expectations for examples and fast-check for invariants.
- Do not add dependencies, disable lint rules, add `any`, or weaken tests to make something pass. Ask first.

## Git workflow

- Branch per phase (`chore/tooling`, `feat/store`, `feat/ui-shell`, ...). Never commit to `main`.
- Conventional Commits (`feat(store):`, `fix:`, `chore:`, `docs:`, `test:`), imperative subject under about 72 characters, one purpose per commit.
- Stage explicitly with `git add <files>` (or `git add -p`), never `git add .`. Check `git status` first.
- Do not push. The owner reviews the diff, pushes, and opens the PR.

## UI workflow (Phase 3 onward)

- Direction: navy / cream / coral palette with sky blue #98D3F3 as the brand colour, glassmorphism only on cards and panels (not whole screens), light and dark, WCAG AA contrast. Full spec: `DESIGN.md`.
- After each UI feature: run `pnpm dev`, check `localhost:3000` with `playwright-cli` at mobile and desktop widths in light and dark, fix what breaks, then review against `DESIGN.md` with the `design:accessibility-review`, `design:design-critique` and `design:ux-copy` skills and fix their findings.
- Derived and unsupported states must be visible in the UI (Q1 overflow, feasibility shortfall, unsupported schedule cases), never hidden.
- Do not edit the generated block in `AGENTS.md`. Read `node_modules/next/dist/docs/` before writing Next.js code, because this Next version differs from older ones.

## Open decisions

- Default `UserSettings` live in `src/repository/data.ts` (`DEFAULT_SETTINGS`) and were chosen from the README example, not yet confirmed by the owner.
- Known engine limits: Pomodoro cycle restarts in every gap, first-fit placement can fragment long Q2 tasks, no per-task daily limit.
