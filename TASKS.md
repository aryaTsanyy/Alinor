# Alinor: task checklist

Work top to bottom. One task = one commit (Conventional Commits), on a feature branch, merged through a PR.
Before ticking a box: `pnpm test:run` and `pnpm lint` are green. Never change `src/core/` behavior without a failing test first.

## Working rules

- Branch per phase: `feat/store`, `feat/ui-shell`, and so on. Never commit to `main` directly.
- Read `node_modules/next/dist/docs/` before writing Next.js code (see `AGENTS.md`).
- Use relative imports until the alias task below is done.
- If a decision is not covered here or in `CLAUDE.md`, ask instead of guessing.

## Phase 0: Baseline

- [ ] `pnpm install`, `pnpm test:run`, `pnpm lint` all pass on a clean checkout. Report any failure before changing code.
- [ ] Confirm `src/storage/` (written without being able to run vitest) passes its 4 tests. Fix the code, not the tests, unless a test is wrong.
- [ ] Commit `CLAUDE.md` and `TASKS.md` as `docs:`, and `src/storage/` as `feat(storage):` plus `test(storage):`, if not yet committed.

## Phase 1: Tooling fixes (`chore/tooling`)

- [ ] `chore:` make `@/*` resolve to `./src/*` in `tsconfig.json` and mirror it in `vitest.config.mts`. Verify the ESLint ban on `@/store/*` and `@/components/*` inside `src/core/` still fires (add a throwaway import, confirm the error, remove it).
- [ ] `chore:` add `pnpm typecheck` (`tsc --noEmit`) to scripts. Confirm the build is clean with `pnpm build`.
- [ ] Replace the placeholder metadata in `src/app/layout.tsx` (title, description) with Alinor's.

## Phase 2: Zustand store (`feat/store`)

- [ ] `pnpm add zustand`.
- [ ] Define store state: `AppSnapshot` fields plus `hydrated: boolean`, `now` source, `warnings` (allocation and feasibility), `error` (including `StorageCorruptError`).
- [ ] Actions, each with tests: add, update, delete task; complete a task; set `isImportant` and `urgencyOverride`; add, update, delete schedule rule; add `CANCELLED` exception; update settings.
- [ ] Derived selectors (not stored): quadrant per task via `deriveTaskQuadrant`, today's free slots via `calculateFreeSlots`, feasibility via `computeFeasibility`.
- [ ] Planning actions: `autoFillToday` (`generateAutoAllocations`), `resolveCollisions` after any schedule change, `rolloverIfNewDay` (`rolloverAllocations`). `now` is always injected, never read inside `src/core/`.
- [ ] Session actions: start, finish, and abandon a Pomodoro session; update `completedPomodoros` and allocation status consistently (use `getStartedAllocationIds`).
- [ ] Persistence: `hydrate()` loads through `Repository`, `null` means `emptySnapshot()`. Save after every mutation (debounced). Corrupt data surfaces as `error` and must not overwrite the stored data.
- [ ] Input validation at the store boundary (non-negative integer pomodoros, valid dates and times). Core throws on bad input; the store turns that into a user-facing error and does not crash.
- [ ] Tests use `createMemoryStorage` and a fixed `now`. Add a property test that save then hydrate restores the same state.

## Phase 3: App shell (`feat/ui-shell`)

- [ ] Client-only hydration boundary: `localStorage` is touched only in the browser. No hydration mismatch warnings.
- [ ] Design tokens in `globals.css`: Pantone blue palette, glass surfaces (blur, translucent border, soft shadow), light and dark, readable contrast (check WCAG AA).
- [ ] Layout and navigation: Today, Tasks, Schedule, Settings. Mobile first.
- [ ] Replace the create-next-app template in `src/app/page.tsx`. Remove unused template assets in `public/`.

## Phase 4: Features (one branch each)

- [ ] **Settings:** edit every `UserSettings` field with validation. Explain each field in plain language. Show the worked-day effect (slots and caps) live.
- [ ] **Schedule:** CRUD for recurring and one-off rules, day-of-week picker, per-rule buffers, `validFrom` and `validUntil`, cancel a single occurrence. Block save on `startTime >= endTime`. Show a clear message for unsupported cases (crossing midnight).
- [ ] **Tasks:** quick-add, edit, delete, importance toggle, deadline, estimate in Pomodoros. Show the derived quadrant and why (deadline distance, override).
- [ ] **Matrix:** four quadrants, drag a card between them. Dragging sets `urgencyOverride` (and `isImportant` when crossing the importance axis). Keyboard accessible alternative to dragging.
- [ ] **Today view:** timeline of fixed events, free slots, and allocations. "Auto-fill today" button. Show warnings (Q1 overflow, feasibility shortfall) in plain language, never hide them.
- [ ] **Pomodoro timer:** bound to a task and an allocation, work/short/long break from settings, survives page reload (store the start time, not a ticking counter), records `PomodoroSession` with `quadrantAtTime`.
- [ ] **In-app reminders:** upcoming allocation and end-of-break notices while the app is open.
- [ ] **Day rollover:** on app open and at midnight, run rollover and mark missed allocations `EXPIRED`.

## Phase 5: Engine follow-ups (`feat/core-*`, tests first)

- [ ] Per-task daily Pomodoro limit so one long Q2 task does not fragment or monopolize a day.
- [ ] Avoid fragmenting a task across tiny gaps where a larger gap exists (placement beyond first-fit).
- [ ] Support events that cross midnight.
- [ ] Support `MODIFIED` schedule exceptions.
- [ ] Optional: auto-fill beyond today, using the feasibility check as the guide.

## Phase 6: Later (confirm scope with the owner first)

- [ ] Time-per-quadrant report and estimate calibration from session history.
- [ ] PWA and web push reminders.
- [ ] Calendar import.
- [ ] Schedule upload with AI parsing and a mandatory confirmation step before anything is saved.
- [ ] Postgres `Repository` implementation behind the same interface.

## Definition of done (every task)

- Tests written or updated, `pnpm test:run`, `pnpm lint`, and `pnpm build` green.
- No new `any`, no silenced lint rules.
- UI changes checked in the browser at mobile and desktop widths, light and dark.
- README status line and roadmap updated when a phase finishes.
