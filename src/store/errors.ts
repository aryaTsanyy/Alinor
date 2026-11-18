import type { HydrationStatus } from "./types";

export class StoreNotReadyError extends Error {
  readonly status: HydrationStatus;

  constructor(status: HydrationStatus) {
    super(
      `The store is not ready (status: ${status}); hydrate it or resolve the storage issue first`,
    );
    this.name = "StoreNotReadyError";
    this.status = status;
  }
}

export class SessionsUnavailableError extends Error {
  constructor() {
    super(
      "The pomodoro log is unreadable, so sessions cannot be recorded until the storage issue is resolved",
    );
    this.name = "SessionsUnavailableError";
  }
}
