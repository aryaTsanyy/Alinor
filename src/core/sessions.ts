import type { PomodoroSession } from "./types";

/** Id alokasi yang punya setidaknya satu sesi pomodoro (selesai atau tidak). */
export function getStartedAllocationIds(
  sessions: readonly PomodoroSession[],
): Set<string> {
  const ids = new Set<string>();
  for (const session of sessions) {
    if (session.allocationId !== undefined) ids.add(session.allocationId);
  }
  return ids;
}
