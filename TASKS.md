# Alinor: task checklist

Work top to bottom. One task = one commit (Conventional Commits), on a feature branch, merged through a PR.
Before ticking a box: `pnpm test:run` and `pnpm lint` are green. Never change `src/core/` behavior without a failing test first.

## Working rules

- Branch per phase: `feat/store`, `feat/ui-shell`, and so on. Never commit to `main` directly.
- Read `node_modules/next/dist/docs/` before writing Next.js code (see `AGENTS.md`).
- If a decision is not covered here or in `CLAUDE.md`, ask instead of guessing.

## Phase 0: Baseline

- [x] `pnpm install`, `pnpm test:run`, `pnpm lint` all pass on a clean checkout. Report any failure before changing code.
- [x] `src/storage/` was dropped in favor of `src/repository/` + `src/store/` (data-integrity rules proven by tests there); `CLAUDE.md` and `TASKS.md` committed as `docs:`.

## Phase 1: Tooling fixes (`chore/tooling`)

- [x] `chore:` make `@/*` resolve to `./src/*` in `tsconfig.json` and mirror it in `vitest.config.mts`. Verify the ESLint ban on `@/store/*` and `@/components/*` inside `src/core/` still fires (add a throwaway import, confirm the error, remove it).
- [x] `chore:` add `pnpm typecheck` (`next typegen && tsc --noEmit`) to scripts. Confirm the build is clean with `pnpm build`.
- [ ] Replace the placeholder metadata in `src/app/layout.tsx` (title, description) with Alinor's.

## Phase 2: Zustand store (`feat/store`)

- [x] `pnpm add zustand`.
- [x] Define store state (`src/store/types.ts`): `PlanningData` fields plus `sessions`, `sessionsStatus`, `lastActiveDate`, `hydration` (`idle`, `loading`, `ready`, `needs-attention`), `issues`, `loadError`, `persistError`. `now` comes from the injected `clock`. Warnings (allocation, collisions) are returned by the actions, not stored; feasibility is a selector.
- [x] Actions, each with tests: `addTask`, `updateTask`, `removeTask`, `markTaskDone`; `addRule`, `updateRule`, `removeRule`; `cancelOccurrence` (`CANCELLED` exception) and `restoreOccurrence`; `updateSettings`.
- [ ] Add a test that changes `isImportant` and `urgencyOverride` via `updateTask`.
- [x] Derived selectors (not stored): quadrant per task via `deriveTaskQuadrant`, today's free slots via `calculateFreeSlots`, feasibility via `computeFeasibility`.
- [x] Planning actions: `autoFillToday` (`generateAutoAllocations`); `resolveCollisions` after every schedule change (rules, occurrences, settings). There is no `rolloverIfNewDay` action: `rolloverAllocations` runs automatically in `hydrate()` and before every data-changing action (`begin()`). `now` is always injected, never read inside `src/core/`.
- [x] Session actions: `completePomodoro` (including the abandoned status) exists; it updates `completedPomodoros` and allocation status consistently (via `getStartedAllocationIds`).
- [ ] DECISION PENDING (owner): does the store record a session start (e.g. to recover an interrupted session)? Decide before Phase 3.
- [x] Persistence: `hydrate()` loads through `StorageRepository`, which returns a `LoadResult` (`empty`, `ok`, `invalid`); `empty` means `emptyPlanningData()`. Every mutation saves. Corrupt data is backed up, puts the store in `needs-attention`, and is never overwritten.
- [ ] DECISION PENDING (owner): debounce saves or keep saving on every mutation.
- [x] Input validation at the store boundary (non-negative integer pomodoros, valid dates and times): the store rejects bad input with `InvalidDataError` and leaves state and storage untouched.
- [ ] Tests use `createMemoryKv` and a fixed `now`. Add a property test that save then hydrate restores the same state.
- [ ] Parameterized test proving every data-changing store action is rejected in `needs-attention` (today only `addTask` is tested).

## Phase 3: App shell (`feat/ui-shell`)

- [ ] Client-only hydration boundary: `localStorage` is touched only in the browser. No hydration mismatch warnings.
- [ ] Design tokens in `globals.css` as specified in `DESIGN.md` (sections b, d, e): light and dark palette tokens, glass surfaces with opaque fallbacks, focus ring with offset. Re-run the contrast check if any token changes.
- [ ] Add `lucide-react` (dependency approved by the owner) and map the quadrant and warning icons from `DESIGN.md` section g to real lucide icon names (verify they exist).
- [ ] Replace the `Arial` font override in `globals.css` with Geist (`var(--font-sans)`), as decided in `DESIGN.md`.
- [ ] Layout and navigation: Today, Tasks, Schedule, Settings. Mobile first.
- [ ] Replace the create-next-app template in `src/app/page.tsx`. Remove unused template assets in `public/`.
- [ ] Turn store errors (`InvalidDataError`, `StoreNotReadyError`, `SessionsUnavailableError`, `persistError`) into plain-language messages; the UI does not crash.

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
