import type {
  AllocationResult,
  CollisionSummary,
  FixedScheduleRule,
  PomodoroSession,
  ScheduleException,
  Task,
  UrgencyOverride,
  UserSettings,
} from "../core";
import type { PlanningData } from "../repository/data";
import type { StorageRepository } from "../repository/repository";

export type HydrationStatus = "idle" | "loading" | "ready" | "needs-attention";
export type SessionsStatus = "ok" | "unavailable";

export interface StorageIssue {
  key: "data" | "sessions";
  reason: string;
  backupKey: string;
}

export interface AlinorState extends PlanningData {
  hydration: HydrationStatus;
  issues: StorageIssue[];
  /** Kegagalan membaca penyimpanan (bukan data rusak), misalnya localStorage diblokir. */
  loadError: string | null;
  /** Penyimpanan terakhir gagal; state di memori tetap, penyimpanan berikutnya mencoba lagi. */
  persistError: string | null;
  sessions: PomodoroSession[];
  sessionsStatus: SessionsStatus;
  lastActiveDate: string | null;
}

export interface NewTaskInput {
  title: string;
  isImportant: boolean;
  estimatedPomodoros: number;
  deadline?: string;
  urgencyOverride?: UrgencyOverride;
}

export type TaskPatch = Partial<
  Pick<
    Task,
    | "title"
    | "isImportant"
    | "urgencyOverride"
    | "deadline"
    | "estimatedPomodoros"
  >
>;
export type NewRuleInput = Omit<FixedScheduleRule, "id">;
export type RulePatch = Partial<Omit<FixedScheduleRule, "id">>;

export interface RuleChange {
  rule: FixedScheduleRule;
  summary: CollisionSummary;
}

export interface ExceptionChange {
  exception: ScheduleException;
  summary: CollisionSummary;
}

export interface CompletePomodoroOptions {
  markTaskDone?: boolean;
}

export interface AlinorActions {
  hydrate(): Promise<void>;
  resolveStorageIssue(choice: "reset" | "retry"): Promise<void>;

  addTask(input: NewTaskInput): Promise<Task>;
  updateTask(id: string, patch: TaskPatch): Promise<Task>;
  removeTask(id: string): Promise<void>;
  markTaskDone(id: string): Promise<void>;

  addRule(input: NewRuleInput): Promise<RuleChange>;
  updateRule(id: string, patch: RulePatch): Promise<RuleChange>;
  removeRule(id: string): Promise<CollisionSummary>;
  cancelOccurrence(
    ruleId: string,
    originalDate: string,
  ): Promise<ExceptionChange>;
  restoreOccurrence(exceptionId: string): Promise<CollisionSummary>;
  updateSettings(patch: Partial<UserSettings>): Promise<CollisionSummary>;

  autoFillToday(): Promise<AllocationResult>;
  completePomodoro(
    session: PomodoroSession,
    options?: CompletePomodoroOptions,
  ): Promise<void>;
}

export type AlinorStore = AlinorState & AlinorActions;

export interface StoreDeps {
  repository: StorageRepository;
  clock: () => Date;
  newId: () => string;
}
