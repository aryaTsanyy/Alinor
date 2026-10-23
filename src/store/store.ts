import { createStore, type StoreApi } from "zustand/vanilla";
import {
  calculateFreeSlots,
  generateAutoAllocations,
  reconcile,
  resolveCollisions,
  rolloverAllocations,
  toDateString,
} from "../core";
import type {
  CollisionSummary,
  FixedScheduleRule,
  ScheduleException,
  Task,
} from "../core";
import { emptyPlanningData, type PlanningData } from "../repository/data";
import { InvalidDataError } from "../repository/repository";
import { validatePlanningData } from "../repository/schemas";
import { SessionsUnavailableError, StoreNotReadyError } from "./errors";
import { selectStartedAllocationIds } from "./selectors";
import type {
  AlinorStore,
  SessionsStatus,
  StorageIssue,
  StoreDeps,
} from "./types";

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export function createAlinorStore({
  repository,
  clock,
  newId,
}: StoreDeps): StoreApi<AlinorStore> {
  return createStore<AlinorStore>((set, get) => {
    const planningOf = (): PlanningData => {
      const { settings, rules, exceptions, tasks, allocations } = get();
      return { settings, rules, exceptions, tasks, allocations };
    };

    const persist = async (data: PlanningData): Promise<void> => {
      try {
        await repository.savePlanning(data);
        if (get().persistError !== null) set({ persistError: null });
      } catch (error) {
        set({ persistError: errorMessage(error) });
      }
    };

    /** Validasi sebelum menyentuh state: data tidak valid ditolak utuh. */
    const check = (candidate: PlanningData): PlanningData => {
      const result = validatePlanningData(candidate);
      if (!result.ok) throw new InvalidDataError(`Rejected: ${result.reason}`);
      return result.data;
    };

    const commit = async (candidate: PlanningData): Promise<void> => {
      const valid = check(candidate);
      set(valid);
      await persist(valid);
    };

    /** Gerbang aksi yang mengubah data: harus siap, dan alokasi hari lalu dikadaluarsakan. */
    const begin = (): { now: Date; today: string } => {
      const { hydration } = get();
      if (hydration !== "ready") throw new StoreNotReadyError(hydration);
      const now = clock();
      const today = toDateString(now);
      if (get().lastActiveDate !== today) {
        set({
          allocations: rolloverAllocations(get().allocations, now),
          lastActiveDate: today,
        });
      }
      return { now, today };
    };

    /** Satu jalur untuk semua perubahan yang bisa menimbulkan bentrokan. */
    const applyScheduleChange = async (
      candidate: PlanningData,
      now: Date,
    ): Promise<CollisionSummary> => {
      const valid = check(candidate);
      const { sessions, sessionsStatus } = get();
      const summary = resolveCollisions(
        {
          allocations: valid.allocations,
          rules: valid.rules,
          exceptions: valid.exceptions,
          settings: valid.settings,
          startedAllocationIds: selectStartedAllocationIds({
            allocations: valid.allocations,
            sessions,
            sessionsStatus,
          }),
        },
        now,
      );
      const removedIds = new Set(summary.removed.map((a) => a.id));
      await commit({
        ...valid,
        allocations: valid.allocations.filter((a) => !removedIds.has(a.id)),
      });
      return summary;
    };

    /** Menandai tugas selesai dan membuang alokasi PLANNED sisanya. */
    const finishTask = (
      planning: PlanningData,
      taskId: string,
      completedAt: string,
    ): PlanningData => ({
      ...planning,
      tasks: planning.tasks.map(
        (t): Task =>
          t.id === taskId ? { ...t, status: "DONE", completedAt } : t,
      ),
      allocations: planning.allocations.filter(
        (a) => !(a.taskId === taskId && a.status === "PLANNED"),
      ),
    });

    const findTask = (id: string): Task => {
      const task = get().tasks.find((t) => t.id === id);
      if (!task) throw new RangeError(`Unknown task "${id}"`);
      return task;
    };

    const findRule = (id: string): FixedScheduleRule => {
      const rule = get().rules.find((r) => r.id === id);
      if (!rule) throw new RangeError(`Unknown rule "${id}"`);
      return rule;
    };

    return {
      ...emptyPlanningData(),
      hydration: "idle",
      issues: [],
      loadError: null,
      persistError: null,
      sessions: [],
      sessionsStatus: "ok",
      lastActiveDate: null,

      hydrate: async () => {
        if (get().hydration === "loading") return;
        set({ hydration: "loading", loadError: null });
        try {
          const [planning, sessions] = await Promise.all([
            repository.loadPlanning(),
            repository.loadSessions(),
          ]);

          const issues: StorageIssue[] = [];
          if (planning.status === "invalid") {
            issues.push({
              key: "data",
              reason: planning.reason,
              backupKey: planning.backupKey,
            });
          }
          if (sessions.status === "invalid") {
            issues.push({
              key: "sessions",
              reason: sessions.reason,
              backupKey: sessions.backupKey,
            });
          }
          const sessionList = sessions.status === "ok" ? sessions.data : [];
          const sessionsStatus: SessionsStatus =
            sessions.status === "invalid" ? "unavailable" : "ok";

          // Data perencanaan tidak terbaca: tidak ada yang bisa dioperasikan.
          if (planning.status === "invalid") {
            set({
              ...emptyPlanningData(),
              sessions: sessionList,
              sessionsStatus,
              issues,
              hydration: "needs-attention",
              lastActiveDate: null,
            });
            return;
          }

          let data =
            planning.status === "ok" ? planning.data : emptyPlanningData();
          const now = clock();
          let changed = false;

          // Penulisan yang terputus: sesi sudah tercatat, data perencanaan belum.
          if (sessionsStatus === "ok") {
            const reconciled = reconcile({
              tasks: data.tasks,
              allocations: data.allocations,
              sessions: sessionList,
            });
            if (reconciled.changes.length > 0) {
              data = {
                ...data,
                tasks: reconciled.tasks,
                allocations: reconciled.allocations,
              };
              changed = true;
            }
          }

          const rolled = rolloverAllocations(data.allocations, now);
          if (rolled.some((a, i) => a !== data.allocations[i])) {
            data = { ...data, allocations: rolled };
            changed = true;
          }

          set({
            ...data,
            sessions: sessionList,
            sessionsStatus,
            issues,
            hydration: "ready",
            lastActiveDate: toDateString(now),
            persistError: null,
          });
          if (changed) await persist(data);
        } catch (error) {
          set({ hydration: "needs-attention", loadError: errorMessage(error) });
        }
      },

      resolveStorageIssue: async (choice) => {
        const { hydration, issues } = get();
        if (hydration === "idle" || hydration === "loading")
          throw new StoreNotReadyError(hydration);
        if (choice === "reset") {
          for (const issue of issues) {
            if (issue.key === "data")
              await repository.savePlanning(emptyPlanningData());
            else await repository.resetSessions();
          }
        }
        set({ hydration: "idle" });
        await get().hydrate();
      },

      addTask: async (input) => {
        const { now } = begin();
        const task: Task = {
          id: newId(),
          title: input.title,
          isImportant: input.isImportant,
          urgencyOverride: input.urgencyOverride ?? "AUTO",
          estimatedPomodoros: input.estimatedPomodoros,
          completedPomodoros: 0,
          status: "TODO",
          createdAt: now.toISOString(),
          ...(input.deadline === undefined ? {} : { deadline: input.deadline }),
        };
        await commit({ ...planningOf(), tasks: [...get().tasks, task] });
        return task;
      },

      updateTask: async (id, patch) => {
        begin();
        const task: Task = { ...findTask(id), ...patch };
        const planning = planningOf();
        await commit({
          ...planning,
          tasks: planning.tasks.map((t) => (t.id === id ? task : t)),
        });
        return task;
      },

      removeTask: async (id) => {
        begin();
        findTask(id);
        const planning = planningOf();
        await commit({
          ...planning,
          tasks: planning.tasks.filter((t) => t.id !== id),
          allocations: planning.allocations.filter((a) => a.taskId !== id),
        });
      },

      markTaskDone: async (id) => {
        const { now } = begin();
        if (findTask(id).status === "DONE") return;
        await commit(finishTask(planningOf(), id, now.toISOString()));
      },

      addRule: async (input) => {
        const { now } = begin();
        const rule: FixedScheduleRule = { ...input, id: newId() };
        const summary = await applyScheduleChange(
          { ...planningOf(), rules: [...get().rules, rule] },
          now,
        );
        return { rule, summary };
      },

      updateRule: async (id, patch) => {
        const { now } = begin();
        const rule: FixedScheduleRule = { ...findRule(id), ...patch };
        const summary = await applyScheduleChange(
          {
            ...planningOf(),
            rules: get().rules.map((r) => (r.id === id ? rule : r)),
          },
          now,
        );
        return { rule, summary };
      },

      removeRule: async (id) => {
        const { now } = begin();
        findRule(id);
        const planning = planningOf();
        return applyScheduleChange(
          {
            ...planning,
            rules: planning.rules.filter((r) => r.id !== id),
            exceptions: planning.exceptions.filter((e) => e.ruleId !== id),
          },
          now,
        );
      },

      cancelOccurrence: async (ruleId, originalDate) => {
        const { now } = begin();
        findRule(ruleId);
        const existing = get().exceptions.find(
          (e) =>
            e.ruleId === ruleId &&
            e.originalDate === originalDate &&
            e.type === "CANCELLED",
        );
        if (existing)
          return { exception: existing, summary: { removed: [], flagged: [] } };
        const exception: ScheduleException = {
          id: newId(),
          ruleId,
          originalDate,
          type: "CANCELLED",
        };
        const summary = await applyScheduleChange(
          { ...planningOf(), exceptions: [...get().exceptions, exception] },
          now,
        );
        return { exception, summary };
      },

      restoreOccurrence: async (exceptionId) => {
        const { now } = begin();
        if (!get().exceptions.some((e) => e.id === exceptionId)) {
          throw new RangeError(`Unknown exception "${exceptionId}"`);
        }
        const planning = planningOf();
        return applyScheduleChange(
          {
            ...planning,
            exceptions: planning.exceptions.filter((e) => e.id !== exceptionId),
          },
          now,
        );
      },

      updateSettings: async (patch) => {
        const { now } = begin();
        return applyScheduleChange(
          { ...planningOf(), settings: { ...get().settings, ...patch } },
          now,
        );
      },

      autoFillToday: async () => {
        const { now, today } = begin();
        const state = get();
        const result = generateAutoAllocations(
          {
            date: today,
            slots: calculateFreeSlots(
              today,
              state.rules,
              state.exceptions,
              state.settings,
            ),
            tasks: state.tasks,
            // Allocator hanya menerima alokasi pada `date`; riwayat hari lain
            // (misalnya COMPLETED kemarin) harus disaring.
            existingAllocations: state.allocations.filter(
              (a) => a.date === today,
            ),
            settings: state.settings,
          },
          now,
        );
        if (result.allocations.length > 0) {
          await commit({
            ...planningOf(),
            allocations: [...get().allocations, ...result.allocations],
          });
        }
        return result;
      },

      completePomodoro: async (session, options = {}) => {
        begin();
        if (get().sessionsStatus !== "ok") throw new SessionsUnavailableError();
        if (!get().tasks.some((t) => t.id === session.taskId)) {
          throw new RangeError(`Unknown task "${session.taskId}"`);
        }

        // 1. Catat sesi dulu (idempoten menurut id).
        await repository.appendSession(session);

        // 2. Baca ulang state: aksi lain bisa berjalan selama await.
        const state = get();
        const sessions = state.sessions.some((s) => s.id === session.id)
          ? state.sessions
          : [...state.sessions, session];
        set({ sessions });

        // 3. Penghitung dan penyelesaian alokasi lewat jalur yang sama dengan hidrasi.
        const reconciled = reconcile({
          tasks: state.tasks,
          allocations: state.allocations,
          sessions,
        });
        let next: PlanningData = {
          ...planningOf(),
          tasks: reconciled.tasks,
          allocations: reconciled.allocations,
        };
        const task = next.tasks.find((t) => t.id === session.taskId);
        if (task && task.status !== "DONE") {
          const reachedEstimate =
            session.completed &&
            task.completedPomodoros >= task.estimatedPomodoros;
          if (options.markTaskDone === true || reachedEstimate) {
            next = finishTask(next, task.id, clock().toISOString());
          }
        }

        // 4. Simpan data perencanaan.
        await commit(next);
      },
    };
  });
}
