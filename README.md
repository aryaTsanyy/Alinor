# Alinor

An opinionated daily planner that answers the question calendars and to-do apps skip: _given my fixed schedule, when can I actually do the important work?_

> **Status:** the planning engine is complete and tested. The store, persistence and UI (Pantone blue, glassmorphism) are next.

## The problem

The Eisenhower Matrix tells you _what_ matters, not _when_ you have time for it. A calendar shows free gaps, but nobody wants to play schedule Tetris every morning. Alinor is built for students who also work: rigid recurring commitments (classes, shifts) alongside tasks whose priority keeps shifting.

## The idea

```
fixed schedule -> effective free slots -> derived Eisenhower quadrants
              -> auto-allocation into slots -> task-bound Pomodoro
```

- **Free slots, not raw gaps.** Transition buffers, a minimum block of one Pomodoro, and a daily energy cap mean free time is never mistaken for focus time.
- **Quadrants are derived, never typed.** Urgency comes from the deadline; you only say whether something is important. Dragging a card sets an explicit override instead of fighting the deadline.
- **Q1 is contained, Q2 is protected.** Auto-fill caps Q1 per day and reserves a quota for Q2, so crisis work cannot silently starve long-term work.
- **Honest about overload.** When something does not fit, Alinor says so (Q1 overflow, deadline feasibility) instead of cramming.

## A worked day

Monday: class 09:00-10:40, meeting 14:00-15:00, gym 17:00-18:30 (30-minute cool-down).

| Free gap    | Length  | Pomodoros that fit |
| ----------- | ------- | ------------------ |
| 08:00-09:00 | 60 min  | 2                  |
| 10:55-14:00 | 185 min | 6                  |
| 15:15-17:00 | 105 min | 3                  |
| 19:00-22:00 | 180 min | 5                  |

That is 16 physical slots against a daily cap of 8. With a report due today (3), exam prep due Wednesday (22) and a thesis proposal with no deadline (6), auto-fill gives the report 3 and exam prep 2 (Q1 is capped at 5), protects the Q2 quota so the proposal gets 3, and warns that 20 exam pomodoros were not scheduled. The feasibility check adds that even across three days, 2 would not fit. The full scenario lives in `src/core/flow.test.ts`.

## Architecture

All planning logic lives in `src/core/` as pure TypeScript functions with no React, DOM or storage dependency:

| Module                           | Responsibility                                          |
| -------------------------------- | ------------------------------------------------------- |
| `slots`, `schedule`, `intervals` | Recurring rules -> buffered occupied time -> free slots |
| `capacity`, `allocatable`        | Pomodoro cycle math, gap clipping, placement            |
| `quadrant`                       | Derived Eisenhower quadrant with urgency overrides      |
| `allocator`                      | Auto-fill with a hard Q1 cap and protected Q2 quota     |
| `feasibility`                    | Earliest-deadline-first capacity check across days      |
| `collisions`, `rollover`         | Schedule changes and day rollover                       |

Rules enforced by ESLint on `src/core/`: no imports from React, Next or Zustand, no `Date.now()` or `new Date()` (time is always injected as `now`), no `Math.random()`. Same input, same output.

## Decisions and known limitations

- The Pomodoro cycle (long break every 4th) restarts in every gap.
- Placement is first-fit, so a long Q2 task can fragment into small pieces. There is no per-task daily limit yet.
- Auto-fill covers today only; deadlines beyond today are handled by the feasibility check.
- Events crossing midnight and `MODIFIED` schedule exceptions are not supported yet and fail loudly instead of being ignored.
- Flexible non-Pomodoro activities ("exercise three times this week, any time") are deliberately deferred; fixed events cover scheduled ones.

## Testing

Vitest, with hand-computed expectations for example tests and property-based tests (fast-check) for interval, capacity, quadrant and allocation invariants. Key properties were sanity-checked by deliberately breaking the code and confirming the tests fail.

```bash
pnpm install
pnpm test:run     # unit and property tests
pnpm lint
pnpm dev
```

## Roadmap

1. Zustand store and an async storage repository (localStorage first, Postgres later)
2. UI: matrix, free-slot day view, Pomodoro timer bound to a task, in-app reminders
3. Web push reminders (PWA), calendar import, schedule upload with AI parsing and a confirmation step
4. Time-per-quadrant report and estimate calibration from Pomodoro session history

**Stack:** Next.js (App Router), TypeScript (strict), Tailwind CSS, Vitest.
